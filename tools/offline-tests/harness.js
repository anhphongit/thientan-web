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
    Utilities: { getUuid: () => 'uuid-' + (++uuid) },
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
