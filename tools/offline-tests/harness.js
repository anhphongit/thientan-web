/**
 * Offline harness for the Milestone 2 order logic.
 * Loads the real Config/Permissions/Orders sources into a VM with an in-memory
 * spreadsheet that reproduces Sheets semantics (1-based rows, rows shift on delete).
 */
const fs = require('fs');
const vm = require('vm');
const path = __dirname + '/../../apps/api/';

function makeEnv(configOverrides) {
  const store = { Orders: [], OrderLines: [], Invoices: [], StatusHistory: [],
                  Products: [], // Milestone 5 / 5.1
                  Users: [],    // Milestone 5 / 5.2
                  Config: [] };  // Will be populated below after publicConfig is set
  const props = {};
  let uuid = 0;

  /**
   * Milestone 6 / Phase 1 — builds the Drive-folder API surface BackupJob.gs
   * needs (nested subfolders, getFolders() iteration, getDateCreated() for
   * retention-cutoff sorting, setTrashed()) on top of the id-keyed record in
   * `sandbox.fakeDriveFolderRecords`. Every call re-reads the record live
   * (rather than closing over a stale copy), so a test can mutate
   * `env.fakeDriveFolderRecords[id].dateCreated` directly to backdate a
   * backup folder — the same "edit the record, no real clock needed"
   * technique exportjob.test.js already uses for job.updatedAt. Declared
   * here (not as a plain sandbox property) because it also needs `uuid` for
   * fresh child-folder/file ids, which — unlike `sandbox` — is a closed-over
   * local, not something reachable from inside the sandbox object itself.
   */
  function makeFakeFolder(id) {
    const rec = sandbox.fakeDriveFolderRecords[id];
    const folder = {
      getId: () => id,
      getName: () => rec.name,
      getUrl: () => 'https://drive.example/folder/' + id,
      getDateCreated: () => rec.dateCreated,
      setTrashed(v) { rec.trashed = v; return folder; },
      isTrashed: () => rec.trashed,
      createFolder(name) {
        const childId = 'folder-' + (++uuid);
        sandbox.fakeDriveFolderRecords[childId] = {
          id: childId, name, dateCreated: new Date(), trashed: false, childFolderIds: []
        };
        rec.childFolderIds.push(childId);
        return makeFakeFolder(childId);
      },
      createFile(blob) {
        const fileId = 'file-' + (++uuid);
        const file = {
          getId: () => fileId,
          getName: () => blob.getName(),
          getUrl: () => 'https://drive.example/file/' + fileId,
          setTrashed(v) { sandbox.fakeDriveFiles[fileId].trashed = v; return file; }
        };
        sandbox.fakeDriveFiles[fileId] = { id: fileId, blob, folderId: id, trashed: false };
        return file;
      },
      getFolders() {
        const ids = rec.childFolderIds.slice();
        let i = 0;
        return {
          hasNext: () => i < ids.length,
          next: () => makeFakeFolder(ids[i++])
        };
      }
    };
    return folder;
  }
  // Milestone 3 / 3.8 — approvalFlowEnabled defaults to false, same as a
  // real freshly-seeded deployment (CONFIG_DEFAULTS in Config.gs). Tests
  // that exercise the approve-status workflow pass { approvalFlowEnabled: true }.
  const publicConfig = Object.assign({
    statusList: [{ key: 'draft', label: 'Nháp' }, { key: 'confirmed', label: 'Đã xác nhận' }],
    uomList: ['Cái', 'Cuộn'],
    vatRates: [0.08, 0.1],
    customerList: ['Yamato'],
    approvalFlowEnabled: false,
    currency: 'VND'
  }, configOverrides || {});

  // Milestone 5 / 5.4 — populate the fake Config sheet from every key in
  // publicConfig, mirroring production (readPublicConfig_ in Router.gs
  // reads ALL rows of the real Config sheet, not just the admin-editable
  // subset). Bug fix 2026-09-11: this used to loop over a hardcoded
  // editableKeys allowlist (customerList/statusList/uomList/vatRates/
  // currency) — the same list AdminConfig.gs uses to decide what the
  // admin UI may edit. Conflating "seed the fake sheet" with "editable via
  // admin UI" meant approvalFlowEnabled (deliberately NOT admin-editable,
  // see AdminConfig.gs EDITABLE_CONFIG_KEYS) never made it into store.Config,
  // so the harness's readPublicConfig_() (below) always read it back as
  // undefined — approvalFlowEnabled_() was permanently false regardless of
  // makeEnv({ approvalFlowEnabled: true }), breaking every approve-status
  // test that depends on the flag. Seed from all publicConfig keys instead;
  // actionListConfig_'s own EDITABLE_CONFIG_KEYS allowlist still governs
  // what the admin UI can list/edit, independent of what's seeded here.
  // Note: customerList first for backward compatibility with existing tests.
  const orderedKeys = ['customerList', 'statusList', 'uomList', 'vatRates', 'currency']
    .concat(Object.keys(publicConfig).filter(k =>
      ['customerList', 'statusList', 'uomList', 'vatRates', 'currency'].indexOf(k) < 0));
  orderedKeys.forEach(key => {
    if (key in publicConfig) {
      const val = publicConfig[key];
      store.Config.push({
        key: key,
        value: typeof val === 'object' ? JSON.stringify(val) : String(val),
        description: ''
      });
    }
  });

  const sandbox = {
    console: { log(){}, warn(){}, error(){} },
    store,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: k => { delete props[k]; },
        // Milestone 4 / 4.5.4 — cleanupExportJobs scans every stored
        // property looking for EXPORTJOB_-prefixed keys, so it needs the
        // real getProperties() shape (a plain object of ALL keys/values),
        // not just single-key access.
        getProperties: () => Object.assign({}, props)
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + (++uuid),
      base64Encode: bytes => Buffer.from(bytes).toString('base64'),
      base64Decode: str => Array.from(Buffer.from(str, 'base64')),
      newBlob(bytes, mimeType, name) {
        const buf = Buffer.from(bytes);
        let blobName = name;
        return {
          getBytes: () => buf,
          getName: () => blobName,
          setName(n) { blobName = n; return this; },
          getContentType: () => mimeType
        };
      }
    },
    CacheService: { getScriptCache: () => null },
    // Milestone 4 / 4.5.1 — minimal in-memory stand-ins for
    // SpreadsheetApp/ScriptApp so ExportJob.gs's checkpoint loop is
    // testable offline. `fakeSpreadsheets` keyed by id, each holding a
    // single fake sheet whose getRange().setValues() just records into an
    // in-memory 2D array (`cells`) — enough for ExportJob tests to read
    // back exactly what got written after N checkpointed batches, without
    // a real Sheets backend. Triggers are recorded, not actually
    // scheduled (this test harness runs synchronously; a "trigger" firing
    // is simulated by the test calling resumeExportJob_ itself — see
    // exportjob.test.js).
    fakeSpreadsheets: {},
    fakeTriggers: [],
    // Milestone 4 / 4.5.3 — in-memory stand-ins for the Drive/email/HTTP
    // surface deliverExportJob_ touches, so its Drive-folder-lookup,
    // Drive-file-save, and email-attach-vs-link-only branching are all
    // testable offline without a real Google account. `fakeDriveFolders`
    // keyed by folder name (DriveApp.getFoldersByName's real lookup key);
    // `fakeDriveFiles` keyed by id, holding whatever blob/name was saved
    // last plus a trashed flag; `fakeEmails` records every MailApp.sendEmail
    // call verbatim so a test can assert on subject/body/attachments.
    fakeDriveFolders: {},
    fakeDriveFiles: {},
    fakeEmails: [],
    // Milestone 6 / Phase 1 — BackupJob.gs needs richer fake Drive folders
    // than exportsFolder_()'s flat/name-only ones: a parent backups folder
    // that can hold nested timestamped subfolders, be looked up by id
    // (DriveApp.getFolderById — Finding 13's collision-safe path), and be
    // trashed (retention cleanup). `fakeDriveFolders` above stays a
    // name->id index (unchanged shape/semantics — existing exportjob.test.js
    // does `'name' in env.fakeDriveFolders`); `fakeDriveFolderRecords` is the
    // real id-keyed store every folder object reads/writes through, so a
    // test can freely backdate `getDateCreated()` the same way exportjob
    // tests backdate `job.updatedAt` directly, without a real clock.
    fakeDriveFolderRecords: {},
    UrlFetchApp: {
      // fetchSpreadsheetExportBase64_'s only use of UrlFetchApp: fetching
      // a spreadsheet's own xlsx/pdf export URL. The harness has no real
      // Sheets backend to render, so this returns a small fixed blob
      // whose bytes are deterministic and cheap to assert against (e.g.
      // "is the exported blob under the attach-size threshold").
      fetch(url, options) {
        return {
          getResponseCode: () => 200,
          getBlob: () => ({
            getBytes: () => Buffer.from('fake-export-bytes:' + url)
          })
        };
      }
    },
    DriveApp: {
      getFoldersByName(name) {
        const id = sandbox.fakeDriveFolders[name];
        let done = !id;
        return {
          hasNext: () => !done,
          next() { done = true; return makeFakeFolder(id); }
        };
      },
      createFolder(name) {
        const id = 'folder-' + (++uuid);
        sandbox.fakeDriveFolderRecords[id] = {
          id, name, dateCreated: new Date(), trashed: false, childFolderIds: []
        };
        sandbox.fakeDriveFolders[name] = id;
        return makeFakeFolder(id);
      },
      /** Milestone 6 / Phase 1 (Finding 13) — the collision-safe lookup path
       *  backupsParentFolder_() tries first. Throws for a missing/deleted
       *  id, same as a real 404 would surface as an exception — BackupJob.gs
       *  wraps this in its own try/catch and falls back to name lookup. */
      getFolderById(id) {
        if (!sandbox.fakeDriveFolderRecords[id]) {
          throw new Error('DriveApp.getFolderById: no fake folder ' + id);
        }
        return makeFakeFolder(id);
      },
      getFileById(id) {
        const rec = sandbox.fakeDriveFiles[id];
        if (rec) {
          return {
            setTrashed(v) { rec.trashed = v; return this; },
            getId: () => id,
            getUrl: () => 'https://drive.example/file/' + id
          };
        }
        // Milestone 6 / Phase 1 — backupNow_() calls
        // DriveApp.getFileById(ss.getId()).makeCopy(name, folder) on the
        // LIVE spreadsheet's own Drive file wrapper. This harness has no
        // real Drive backend to duplicate bytes/formulas against (that's
        // exactly what a real deployment's live-verification phase checks
        // instead — see the phase plan's Success Criteria), so a fake
        // spreadsheet id just produces a new tracked Drive file record
        // registered into the given folder, enough to exercise
        // backupNow_()'s real control flow (folder resolution, copy call,
        // ScriptProperties writes) offline.
        if (sandbox.fakeSpreadsheets[id]) {
          return {
            getId: () => id,
            makeCopy(name, folder) {
              const fileId = 'file-' + (++uuid);
              const file = {
                getId: () => fileId,
                getName: () => name,
                getUrl: () => 'https://drive.example/file/' + fileId,
                setTrashed(v) { sandbox.fakeDriveFiles[fileId].trashed = v; return file; }
              };
              sandbox.fakeDriveFiles[fileId] = {
                id: fileId, name, folderId: folder && folder.getId && folder.getId(), trashed: false
              };
              return file;
            }
          };
        }
        throw new Error('DriveApp.getFileById: no fake file ' + id);
      }
    },
    MailApp: {
      sendEmail(to, subject, body, options) {
        sandbox.fakeEmails.push({ to, subject, body, options: options || {} });
      }
    },
    SpreadsheetApp: {
      create(name) {
        const id = 'ss-' + (++uuid);
        const cells = [];
        const fakeSheet = {
          getRange(row, col, numRows, numCols) {
            return {
              setValues(grid) {
                for (let r = 0; r < grid.length; r++) {
                  cells[row - 1 + r] = cells[row - 1 + r] || [];
                  for (let c = 0; c < grid[r].length; c++) cells[row - 1 + r][col - 1 + c] = grid[r][c];
                }
              },
              setFontWeight() {}, merge() {}, setVerticalAlignment() {}, setNumberFormat() {},
              setBorder() {}, setBackground() {}
            };
          },
          setFrozenRows() {}, autoResizeColumns() {},
          getSheetId: () => 0
        };
        sandbox.fakeSpreadsheets[id] = { id, name, cells, sheets: [fakeSheet] };
        return { getId: () => id, getSheets: () => sandbox.fakeSpreadsheets[id].sheets };
      },
      openById(id) {
        const ss = sandbox.fakeSpreadsheets[id];
        if (!ss) throw new Error('SpreadsheetApp.openById: no fake spreadsheet ' + id);
        return { getId: () => id, getSheets: () => ss.sheets };
      },
      BorderStyle: { SOLID: 'SOLID' }
    },
    ScriptApp: {
      getOAuthToken: () => 'fake-oauth-token',
      newTrigger(fnName) {
        const spec = { handlerFunction: fnName, after: null, everyDays: null, atHour: null };
        const builder = {
          timeBased: () => builder,
          after(ms) { spec.after = ms; return builder; },
          // Milestone 4 / 4.5.4 — cleanupExportJobs's daily install
          // (installExportJobCleanupReminder) chains everyDays/atHour
          // rather than after(ms) — recorded the same way, just for
          // tests that only need to confirm ONE daily trigger exists
          // for the right handler, not simulate it actually firing on a
          // schedule (this harness has no clock to wait on either way).
          everyDays(n) { spec.everyDays = n; return builder; },
          atHour(h) { spec.atHour = h; return builder; },
          create() { sandbox.fakeTriggers.push(spec); return spec; }
        };
        return builder;
      },
      getProjectTriggers: () => sandbox.fakeTriggers.map(t => ({
        getHandlerFunction: () => t.handlerFunction,
        __spec: t
      })),
      deleteTrigger(t) {
        const i = sandbox.fakeTriggers.indexOf(t.__spec);
        if (i >= 0) sandbox.fakeTriggers.splice(i, 1);
      }
    },

    /* --- SheetsRepo stand-ins --- */
    /**
     * Milestone 6 / Phase 1 — BackupJob.gs is the first harness-loaded file
     * to call SheetsRepo.gs's getSpreadsheet_() directly (every other
     * loaded file goes through readAll_/findBy_/etc., which this harness
     * already stubs on its own, bypassing SheetsRepo.gs entirely). Not a
     * full port of the real memoized getSpreadsheet_ — just enough of its
     * contract (an object with getId()/getName()) for backupNow_() to
     * resolve a "live" spreadsheet and hand its id to
     * DriveApp.getFileById(...).makeCopy(...). Lazily creates one fake
     * spreadsheet the first time it's called and returns the same one on
     * every later call within this env, same singleton behavior as the
     * real _ssMemo cache.
     */
    getSpreadsheet_() {
      if (!sandbox.fakeLiveSpreadsheetId) {
        const id = 'live-ss-' + (++uuid);
        sandbox.fakeSpreadsheets[id] = { id, name: 'THIENTAN (live)', cells: [], sheets: [] };
        sandbox.fakeLiveSpreadsheetId = id;
      }
      const rec = sandbox.fakeSpreadsheets[sandbox.fakeLiveSpreadsheetId];
      return { getId: () => rec.id, getName: () => rec.name };
    },
    readAll_(name) {
      return (store[name] || []).map((row, i) => Object.assign({}, row, { _row: i + 2 }));
    },
    findBy_(name, field, value) {
      const needle = typeof value === 'string' ? value.trim().toLowerCase() : value;
      const rows = sandbox.readAll_(name);
      for (const row of rows) {
        const actual = row[field];
        if (typeof actual === 'string') {
          if (actual.trim().toLowerCase() === needle) return row;
        } else if (actual === needle) return row;
      }
      return null;
    },
    appendRecord_(name, obj) {
      store[name] = store[name] || [];
      store[name].push(Object.assign({}, obj));
      return store[name].length + 1;
    },
    updateRecord_(name, rowNumber, obj) {
      const row = store[name][rowNumber - 2];
      if (!row) throw new Error('updateRecord_: no row ' + rowNumber + ' in ' + name);
      Object.keys(obj).forEach(k => { row[k] = obj[k]; });
    },
    deleteRecord_(name, rowNumber) {
      if (!store[name][rowNumber - 2]) throw new Error('deleteRecord_: no row ' + rowNumber);
      store[name].splice(rowNumber - 2, 1);
    },
    readPublicConfig_() {
      // Milestone 5 / 5.4 — read from Config sheet, same as real implementation
      const result = {};
      (store.Config || []).forEach(row => {
        const key = row.key;
        if (!key) return;
        try {
          result[key] = (typeof row.value === 'string' && (row.value.charAt(0) === '[' || row.value.charAt(0) === '{'))
            ? JSON.parse(row.value)
            : row.value;
        } catch (err) {
          result[key] = row.value;
        }
      });
      return result;
    },
    invalidateConfigCache_() {},
    invalidateReadCache_() {}
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  ['Config.gs', 'Auth.gs', 'Permissions.gs', 'Orders.gs', 'Export.gs', 'ExportSheet.gs',
   'ExportJob.gs', 'Stats.gs', 'Products.gs', 'Admin.gs', 'AdminConfig.gs',
   'BackupJob.gs', 'SystemHealth.gs',
   // Milestone 7 / Phase 1 — legacy Excel import, row-grouping/parsing only
   // (LegacyImport.gs's Drive/SpreadsheetApp orchestration functions are not
   // exercised offline — no Advanced Drive Service fake exists in this
   // harness — but parseLegacySheet_ (LegacyImportParse.gs) needs no Drive
   // access at all, only a sheet-like getDataRange().getDisplayValues()).
   'LegacyImport.gs', 'LegacyImportParse.gs',
   // 2026-09-16 — date-format audit diagnostic. legacyBuildDateAuditReport_
   // is a pure function over parseLegacySheet_'s output (no Drive/Sheets
   // access); legacyAuditNgayHdFormats() itself (Drive conversion +
   // guardSetup_) is not exercised offline, same limitation as
   // dryRunImportLegacyOrders() above.
   'LegacyImportDateAudit.gs',
   // Milestone 7 / Phase 2 — field mapping/extraction rules, pure functions,
   // no Drive/Sheets access either. LegacyImportMap.gs's detectVatRate_/
   // mapLegacyOrderGroup_ (via LegacyImportMapDeposit.gs's
   // extractDepositSupplier_) call legacyParseNumber_, so LegacyImportParse.gs
   // must load first (already the case, listed above).
   'LegacyImportMap.gs', 'LegacyImportMapCompose.gs', 'LegacyImportMapDeposit.gs',
   // Milestone 7 / Phase 3 — bulk write path. LegacyImportWriteOrder.gs's
   // legacyConvertLineFieldsOrThrow_/legacyResolveOrderDate_/legacyWriteOneOrder_
   // call money_/quantity_/parseDate_/buildLineRecord_/sumLines_/nextOrderId_/
   // makeLineId_/withOrderLock_/appendStatusHistory_ (all defined in Orders.gs,
   // already loaded above) and readPublicConfig_/appendRecord_ (this harness's
   // own sandbox stubs) — load order only matters here in that both new files
   // must come after Orders.gs, which it already does.
   // Milestone 7 / Phase 4 — idempotency/resumability. LegacyImportWriteResume.gs
   // (getLegacyImportResumePoint_/setLegacyImportResumePoint_/
   // resetLegacyImportResumePoint/legacyAssertNoOrderLinesForOrderId_) must load
   // before LegacyImportWriteOrder.gs (calls the tripwire) and
   // LegacyImportWrite.gs (calls the resume-point get/set) — both use
   // PropertiesService/findBy_, already stubbed above, and PROP.LEGACY_IMPORT_
   // RESUME_INDEX, defined by Config.gs (already loaded first). Report
   // formatting (legacyDescribeOrder_/legacyBuildWriteReport_) is split into
   // LegacyImportWriteReport.gs, loaded before LegacyImportWrite.gs (its
   // legacyRunImportBatch_ calls both).
   // 2026-09-16 — date-parsing fix (see file doc comment). Loaded before
   // LegacyImportWriteOrder.gs, which calls legacyParseHistoricalDate_;
   // that function calls legacyImportYear_() (LegacyImportReconcile.gs,
   // loaded later below) only at call-time, so load order relative to that
   // one is not load-bearing — every file is loaded before any test runs.
   'LegacyImportDateParse.gs',
   'LegacyImportWriteResume.gs', 'LegacyImportWriteOrder.gs',
   'LegacyImportWriteReport.gs', 'LegacyImportWrite.gs',
   // Milestone 7 / Phase 5 — post-hoc reconciliation. legacyReconcileMonths_/
   // legacyImportYear_ read LEGACY_SHEET_NAME_ (LegacyImport.gs, already
   // loaded above) and touch no Drive/Sheets API, so no new sandbox stub is
   // needed; reconcileLegacyImport() itself (Drive conversion + guardSetup_)
   // is not exercised offline, same documented limitation as
   // dryRunImportLegacyOrders()/migrateImportLegacyOrders() above.
   'LegacyImportReconcile.gs'].forEach(f => {
    vm.runInContext(fs.readFileSync(path + f, 'utf8'), sandbox, { filename: f });
  });
  return sandbox;
}

function user(email, overrides) {
  const permissions = Object.assign({
    view_orders: true, view_all_orders: true, create_order: true, edit_order: true,
    delete_order: true, change_status: true
  }, overrides || {});
  permissions.visible_fields = permissions.visible_fields || ['*'];
  return { email: email, displayName: email, role: 'admin', permissions: permissions };
}

/** True flag helper: makeEnv({ approvalFlowEnabled: true }). Also usable to
 *  flip it back off mid-test.
 *  Bug fix 2026-09-11: readPublicConfig_() (see makeEnv above) rebuilds a
 *  brand-new plain object from store.Config on every call — it is not a
 *  live/cached reference. Mutating the object this function used to get
 *  back from env.readPublicConfig_() was therefore thrown away immediately
 *  and never affected the next readPublicConfig_() call. This masqueraded
 *  as working only because approvalFlowEnabled was, until the store.Config
 *  seeding fix above, permanently absent (=false) anyway. Write through to
 *  store.Config directly instead, same as a real actionUpdateConfig_ write. */
function withApprovalFlow(env, enabled) {
  const row = env.store.Config.find(r => r.key === 'approvalFlowEnabled');
  const value = enabled ? 'TRUE' : 'FALSE';
  if (row) { row.value = value; }
  else { env.store.Config.push({ key: 'approvalFlowEnabled', value: value, description: '' }); }
}

let pass = 0, fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
        'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}
function throws(name, fn, fragment) {
  try { fn(); check(name, false, 'no error thrown'); }
  catch (err) {
    check(name, !fragment || String(err.message).indexOf(fragment) >= 0,
          'message was: ' + err.message);
  }
}
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/**
 * Milestone 7 / Phase 1 — a minimal read-oriented fake Sheet for
 * legacy-import-parse.test.js. The existing fake sheet inside
 * SpreadsheetApp.create() (above) is write-oriented (setValues() records
 * into an in-memory grid meant to be inspected by the test afterward);
 * parseLegacySheet_ instead needs a sheet it can READ a pre-built 2D array
 * of display strings FROM, via getDataRange().getDisplayValues() — the same
 * method production code uses so multi-line/Vietnamese text survives intact
 * (see LegacyImportParse.gs's file doc comment). getLastRow()/getRange()
 * are included too even though parseLegacySheet_ only calls getDataRange(),
 * so a future caller that prefers the range-based read path is covered
 * without needing another harness change.
 *
 * @param {string[][]} rows a 2D array of already-stringified cell values
 *   (the shape getDisplayValues() itself returns).
 */
function makeFakeSheetFromRows(rows) {
  return {
    getDataRange() {
      return { getDisplayValues: () => rows, getValues: () => rows };
    },
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((max, r) => Math.max(max, r.length), 0),
    getRange(row, col, numRows, numCols) {
      const nR = numRows || 1, nC = numCols || 1;
      const slice = [];
      for (let r = 0; r < nR; r++) {
        const src = rows[row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < nC; c++) line.push(src[col - 1 + c] === undefined ? '' : src[col - 1 + c]);
        slice.push(line);
      }
      return { getDisplayValues: () => slice, getValues: () => slice };
    }
  };
}

module.exports = { makeEnv, user, check, eq, throws, done, withApprovalFlow, makeFakeSheetFromRows };
