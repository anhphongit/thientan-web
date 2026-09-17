/**
 * Offline tests for the 2026-09-16 date-parsing fix
 * (legacyParseHistoricalDate_, LegacyImportDateParse.gs) — regression tests
 * for the year-2001 incident: `new Date("6/6")` silently defaults to 2001
 * (V8's legacy-parser default), while `new Date("22/9")` correctly fails.
 * Both are wrong for this migration; this parser must handle bare "d/m" by
 * defaulting to legacyImportYear_() (2026 for THONGKE_2026) instead of
 * delegating either shape to the native Date constructor.
 *
 * Run with: node tools/offline-tests/legacy-import-date-parse.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const env = H.makeEnv();

function ymd(d) {
  if (!d) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

console.log('\n1. Regression: bare d/m that used to silently land in 2001');
eq('"6/6" -> 2026-06-06, not 2001-06-06', ymd(env.legacyParseHistoricalDate_('6/6')), '2026-06-06');
eq('"1/2" -> 2026-02-01', ymd(env.legacyParseHistoricalDate_('1/2')), '2026-02-01');

console.log('\n2. Regression: bare d/m (day > 12, unambiguous) that used to silently return null');
eq('"22/12" -> 2026-12-22, not null', ymd(env.legacyParseHistoricalDate_('22/12')), '2026-12-22');
eq('"22/9" -> 2026-09-22, not null', ymd(env.legacyParseHistoricalDate_('22/9')), '2026-09-22');

console.log('\n3. Still handles full "d/m/yyyy" exactly like parseDate_');
eq('"05/03/2026" -> 2026-03-05', ymd(env.legacyParseHistoricalDate_('05/03/2026')), '2026-03-05');

console.log('\n4. Still handles ISO yyyy-mm-dd');
eq('"2026-08-20" -> 2026-08-20', ymd(env.legacyParseHistoricalDate_('2026-08-20')), '2026-08-20');

console.log('\n5. Never guesses via the native Date fallback for unrecognized shapes');
eq('"n/a" -> null', env.legacyParseHistoricalDate_('n/a'), null);
eq('"32/1" (day out of range) -> null', env.legacyParseHistoricalDate_('32/1'), null);
eq('"5/13" (month out of range) -> null', env.legacyParseHistoricalDate_('5/13'), null);
eq('blank -> null', env.legacyParseHistoricalDate_(''), null);
eq('undefined -> null', env.legacyParseHistoricalDate_(undefined), null);

console.log('\n6. Regression: second incident (2026-09-16 audit) — US M/D/YYYY rows that used');
console.log('   to silently roll into a different year via month-index overflow');
eq('"4/21/2026" -> 2026-04-21 (was silently 2027-09-04 via month overflow)',
  ymd(env.legacyParseHistoricalDate_('4/21/2026')), '2026-04-21');
eq('"5/15/2026" -> 2026-05-15', ymd(env.legacyParseHistoricalDate_('5/15/2026')), '2026-05-15');
eq('unambiguous D/M/YYYY still reads as D/M, not swapped ("05/03/2026" stays March 5, not May 3)',
  ymd(env.legacyParseHistoricalDate_('05/03/2026')), '2026-03-05');
eq('"30/30/2026" (invalid under both D/M and M/D) -> null, never guessed',
  env.legacyParseHistoricalDate_('30/30/2026'), null);

console.log('\n7. Integration: legacyResolveOrderDate_ resolves a bare-d/m order date correctly');
const group = { lines: [{ ngayHd: '6/6' }] };
eq('order date resolves to 2026-06-06', ymd(env.legacyResolveOrderDate_(group)), '2026-06-06');

const groupUnambiguous = { lines: [{ ngayHd: '22/12' }] };
eq('order date resolves to 2026-12-22 (previously silently skipped as unparseable)',
  ymd(env.legacyResolveOrderDate_(groupUnambiguous)), '2026-12-22');

H.done();
