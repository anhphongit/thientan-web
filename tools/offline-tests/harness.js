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
                  Config: [
                    { key: 'customerList', value: JSON.stringify(['Yamato']) }
                  ] };
  const props = {};
  let uuid = 0;
  // Milestone 3 / 3.8 — approvalFlowEnabled defaults to false, same as a
  // real freshly-seeded deployment (CONFIG_DEFAULTS in Config.gs). Tests
  // that exercise the approve-status workflow pass { approvalFlowEnabled: true }.
  const publicConfig = Object.assign({
    statusList: [{ key: 'draft', label: 'Nháp' }, { key: 'confirmed', label: 'Đã xác nhận' }],
    uomList: ['Cái', 'Cuộn'],
    vatRates: [0.08, 0.1],
    customerList: ['Yamato'],
    approvalFlowEnabled: false
  }, configOverrides || {});

  const sandbox = {
    console: { log(){}, warn(){}, error(){} },
    store,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: k => { delete props[k]; }
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
        const folder = sandbox.fakeDriveFolders[name];
        let done = !folder;
        return {
          hasNext: () => !done,
          next() { done = true; return folder; }
        };
      },
      createFolder(name) {
        const id = 'folder-' + (++uuid);
        const folder = {
          getId: () => id,
          getName: () => name,
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
          }
        };
        sandbox.fakeDriveFolders[name] = folder;
        return folder;
      },
      getFileById(id) {
        const rec = sandbox.fakeDriveFiles[id];
        if (!rec) throw new Error('DriveApp.getFileById: no fake file ' + id);
        return {
          setTrashed(v) { rec.trashed = v; return this; },
          getId: () => id
        };
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
        const spec = { handlerFunction: fnName, after: null };
        const builder = {
          timeBased: () => builder,
          after(ms) { spec.after = ms; return builder; },
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
    readPublicConfig_: () => publicConfig,
    invalidateConfigCache_() {}
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  ['Config.gs', 'Permissions.gs', 'Orders.gs', 'Export.gs', 'ExportSheet.gs', 'ExportJob.gs'].forEach(f => {
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
 *  flip it back off mid-test since publicConfig is captured live per-env. */
function withApprovalFlow(env, enabled) {
  const cfg = env.readPublicConfig_();
  cfg.approvalFlowEnabled = enabled;
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

module.exports = { makeEnv, user, check, eq, throws, done, withApprovalFlow };
