/**
 * Offline tests for the 2026-09-16 Drive rate-limit retry fix
 * (legacyIsRetryableRateLimitError_/legacyRetryBackoffMs_, LegacyImport.gs)
 * — real incident: repeated same-session runs of dryRunImportLegacyOrders/
 * legacyAuditNgayHdFormats/migrateImportLegacyOrders (each converts the
 * source .xlsx fresh via Drive.Files.copy) tripped Google's per-user Drive
 * API rate limit ("GoogleJsonResponseException: ... User rate limit
 * exceeded"). convertLegacyXlsxToSheet_() itself (the actual retry loop
 * around Drive.Files.copy) is not exercised offline — no Advanced Drive
 * Service fake exists in this harness, same documented limitation as every
 * other Drive-touching function in this migration. This test only covers
 * the two pure decision functions the retry loop relies on.
 *
 * Run with: node tools/offline-tests/legacy-import-drive-retry.test.js
 */
const H = require('./harness.js');
const { check, eq } = H;

const env = H.makeEnv();

console.log('\n1. Recognizes the real incident\'s exact error shape as retryable');
eq('"User rate limit exceeded" is retryable',
  env.legacyIsRetryableRateLimitError_(new Error('User rate limit exceeded.')), true);
eq('"Rate Limit Exceeded" (case-insensitive) is retryable',
  env.legacyIsRetryableRateLimitError_({ message: 'Rate Limit Exceeded' }), true);
eq('"Quota exceeded for quota metric..." is retryable',
  env.legacyIsRetryableRateLimitError_(new Error('Quota exceeded for quota metric X')), true);
eq('a plain string error also works (not just an Error object)',
  env.legacyIsRetryableRateLimitError_('user rate limit exceeded'), true);

console.log('\n2. Does NOT retry unrelated errors — fail fast, do not waste time');
eq('"File not found" is not retryable',
  env.legacyIsRetryableRateLimitError_(new Error('File not found: abc123')), false);
eq('"Permission denied" is not retryable',
  env.legacyIsRetryableRateLimitError_(new Error('Permission denied')), false);
eq('a null/undefined error is not retryable (never crash the classifier)',
  env.legacyIsRetryableRateLimitError_(null), false);

console.log('\n3. Backoff is exponential and short relative to the 6-minute execution ceiling');
eq('attempt 1 -> 2s', env.legacyRetryBackoffMs_(1), 2000);
eq('attempt 2 -> 4s', env.legacyRetryBackoffMs_(2), 4000);
eq('attempt 3 -> 8s', env.legacyRetryBackoffMs_(3), 8000);
eq('attempt 4 -> 16s', env.legacyRetryBackoffMs_(4), 16000);
check('total worst-case wait across 4 retries stays well under the 6-minute ceiling',
  (2000 + 4000 + 8000 + 16000) < 6 * 60 * 1000, 'sum=' + (2000 + 4000 + 8000 + 16000));

H.done();
