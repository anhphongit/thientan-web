#!/usr/bin/env node
/**
 * run-all.js — Milestone 6 / Phase 1 (Finding 8): this repo had 20+
 * `*.test.js` files under tools/offline-tests/ and a README documenting
 * only INDIVIDUAL `node tools/offline-tests/<file>.test.js` invocations —
 * no unified "run everything" command. This discovers and runs every
 * `*.test.js` file in this directory, printing a one-line pass/fail summary
 * per file plus a final total, and exits non-zero if anything failed.
 *
 * Each test file ends by calling harness.js's done(), which itself calls
 * process.exit(fail ? 1 : 0) — so a test file can NOT be require()'d
 * in-process here: the first one to run would terminate this whole runner
 * via its own process.exit() before any later file got a turn. Every file
 * is instead run as its own `node <file>` child process (exactly what the
 * README already tells a person to type by hand, once per file) — this
 * script just does that for every file in sequence and aggregates the
 * results, rather than changing 20+ existing test files' proven behavior to
 * accommodate an in-process runner.
 *
 * Usage: node tools/offline-tests/run-all.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(function (f) { return f.endsWith('.test.js'); })
  .sort();

if (!files.length) {
  console.error('run-all.js: no *.test.js files found in ' + dir);
  process.exit(1);
}

const results = [];

files.forEach(function (file) {
  const fullPath = path.join(dir, file);
  const res = spawnSync(process.execPath, [fullPath], { encoding: 'utf8' });
  const output = (res.stdout || '') + (res.stderr || '');
  const failed = res.status !== 0;

  // Every test file's own done() (harness.js) prints "<N> passed, <M>
  // failed" as its very last line — surface that instead of just the exit
  // code, so a failure's scope is visible without opening the full output.
  const nonEmptyLines = output.split('\n').filter(function (l) { return l.trim().length > 0; });
  const summaryLine = nonEmptyLines.length ? nonEmptyLines[nonEmptyLines.length - 1] : '(no output)';

  results.push({ file: file, failed: failed, output: output });
  console.log((failed ? 'FAIL ' : 'ok   ') + file + '  — ' + summaryLine);
  if (failed) {
    console.log(output.split('\n').map(function (l) { return '    ' + l; }).join('\n'));
  }
});

const failedFiles = results.filter(function (r) { return r.failed; });
console.log('\n' + (results.length - failedFiles.length) + '/' + results.length +
  ' test file(s) passed.');
if (failedFiles.length) {
  console.log('Failed: ' + failedFiles.map(function (r) { return r.file; }).join(', '));
}

process.exit(failedFiles.length ? 1 : 0);
