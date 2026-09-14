/**
 * Offline test for plan 260912-1110 Phase 4's keep-warm trigger
 * (apps/api/Security.gs): `installKeepWarmTrigger` schedules a 5-minute
 * ping to reduce how often a WEB→API call hits Apps Script's slow/cold
 * execution variability (the actual root cause behind the 3xx/404 blips
 * this plan's retry logic works around) — see
 * plans/reports/researcher-260914-1345-appsscript-coldstart-mitigation.md.
 */
const fs = require('fs'), vm = require('vm');
const API_ROOT = __dirname + '/../../apps/api/';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => cond ? (pass++, console.log('  ok   ' + name))
  : (fail++, console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')));

console.log('\nkeepWarmPing / installKeepWarmTrigger');

const configSrc = fs.readFileSync(API_ROOT + 'Config.gs', 'utf8');
const securitySrc = fs.readFileSync(API_ROOT + 'Security.gs', 'utf8');

let getIdShouldThrow, errorLogs, existingTriggers, deletedTriggers, createdTriggers;
function makeTrigger(handlerFn) {
  return { getHandlerFunction: () => handlerFn };
}

const sandbox = {
  console: { log: console.log, error: (msg) => { errorLogs.push(String(msg)); } },
  getSpreadsheet_: () => ({ getId: () => { if (getIdShouldThrow) throw new Error('Exception: temporary Sheets outage'); return 'ss-id'; } }),
  ScriptApp: {
    getProjectTriggers: () => existingTriggers,
    deleteTrigger: (t) => { deletedTriggers.push(t); },
    newTrigger: (fnName) => ({
      timeBased: () => ({
        everyMinutes: (n) => ({
          create: () => { createdTriggers.push({ fnName, everyMinutes: n }); }
        })
      })
    })
  }
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(configSrc, sandbox, { filename: 'Config.gs' });
vm.runInContext(securitySrc, sandbox, { filename: 'Security.gs' });

// --- keepWarmPing: succeeds silently when the sheet is reachable --------
getIdShouldThrow = false; errorLogs = [];
sandbox.keepWarmPing();
ok('keepWarmPing does not throw and logs nothing on success', errorLogs.length === 0);

// --- keepWarmPing: a failure is caught and logged, never thrown --------
getIdShouldThrow = true; errorLogs = [];
let threw = null;
try { sandbox.keepWarmPing(); } catch (err) { threw = err; }
ok('keepWarmPing never throws to its caller (a failing ping must not ' +
   'itself become a source of Apps Script trigger-failure emails)',
   threw === null, threw && threw.message);
ok('the failure is still logged to Stackdriver', errorLogs.some((l) => l.indexOf('keepWarmPing failed') !== -1));

// --- installKeepWarmTrigger: removes any existing same-handler trigger,
//     installs exactly one 5-minute trigger -----------------------------
existingTriggers = [makeTrigger('keepWarmPing'), makeTrigger('checkSecretExpiry')];
deletedTriggers = []; createdTriggers = [];
const result = sandbox.installKeepWarmTrigger();
ok('deletes only the pre-existing keepWarmPing trigger, not unrelated triggers',
   deletedTriggers.length === 1 && deletedTriggers[0].getHandlerFunction() === 'keepWarmPing',
   JSON.stringify(deletedTriggers.map((t) => t.getHandlerFunction())));
ok('creates exactly one new trigger, targeting keepWarmPing every 5 minutes',
   createdTriggers.length === 1 && createdTriggers[0].fnName === 'keepWarmPing' && createdTriggers[0].everyMinutes === 5,
   JSON.stringify(createdTriggers));
ok('returns a human-readable confirmation string', typeof result === 'string' && result.indexOf('5 minutes') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
