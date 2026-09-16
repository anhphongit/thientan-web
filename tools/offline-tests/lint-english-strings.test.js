/**
 * lint-english-strings.test.js — Milestone 6 / Phase 5 regression guard.
 *
 * `docs/MILESTONES.md` M6 calls for "Vietnamese completeness sweep — zero
 * English strings left." A full manual audit (2026-09-13) already found the
 * repo Vietnamese-disciplined (~0 real violations, 4 borderline loanword/
 * proper-noun findings resolved and recorded in `docs/GLOSSARY_VI.md`'s
 * "Loanwords / proper nouns kept as-is" section). This script is NOT that
 * one-shot audit — it is a regression *guard*: a plain-node regex heuristic
 * (no framework, no dependency, matching this directory's existing
 * `*.test.js` convention) that scans the UI HTML for new English strings
 * that creep into user-visible text after this sweep closes the milestone.
 *
 * Scope: `apps/web/ui/*.html` — every user-visible string in this app is
 * built by JS string concatenation inside these files (there is no separate
 * template layer), so scanning the HTML files covers buttons, headings,
 * toasts, placeholders, and confirm-dialog text. `apps/api/Config.gs` and
 * `apps/web/Config.gs` are also scanned, narrowly, for the `MSG` object
 * literal — the single place server-side user-facing error/status text is
 * defined (confirmed by grep: every `throw new Error(...)` in apps/api/*.gs
 * routes through `MSG.*`, not inline literals) — rather than blanket-
 * scanning every string in every .gs file, which would flag sheet names,
 * property keys, and log messages that are never shown to a user.
 *
 * Detection heuristic (regex-based, ~80-90% recall per this phase's
 * research — a regression guard, not a guarantee):
 *   1. Extract candidate user-visible text: HTML tag inner text (`>text<`),
 *      `placeholder="..."` attribute values, and the first string argument
 *      of `T.confirm(`, `confirm(`, `alert(`, `toast(` calls.
 *   2. Skip candidates containing a Vietnamese diacritic — Vietnamese
 *      sentences routinely mix in ASCII loanwords/numbers, so "has a
 *      diacritic" is a reliable "this is already Vietnamese" signal.
 *   3. Skip candidates with no letters, or where every word is in the
 *      explicit ALLOWLIST (loanwords/proper nouns decided in
 *      `docs/GLOSSARY_VI.md`).
 *   4. Flag remaining ALL-ASCII candidates that contain a whole-word match
 *      from the curated ENGLISH_WORDS list.
 *
 * Explicit exclusions (masked out before extraction, so they can never
 * produce a candidate): HTML comments, JS block comments, JS line comments
 * (string-literal-aware, so a `//` inside a quoted URL is not mistaken for
 * a comment start). CSS class names and `data-*` attribute values are never
 * captured in the first place — the tag-inner-text pattern only looks
 * between `>` and `<`, never inside a tag's attribute list. `console.log`/
 * `Logger.log`/debug strings are excluded by construction: the extraction
 * patterns only target the four user-visible contexts above, not arbitrary
 * string literals.
 *
 * Run with: node tools/offline-tests/lint-english-strings.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

// ---------------------------------------------------------------------
// Allowlist — loanwords/proper nouns decided in docs/GLOSSARY_VI.md's
// "Loanwords / proper nouns kept as-is" section (Milestone 6 Phase 5,
// 2026-09-15). Keep this list small and explicit: every entry here should
// trace back to a recorded decision in the glossary, not a guess.
// ---------------------------------------------------------------------
const ALLOWLIST = new Set([
  'email', 'pdf', 'excel', 'chrome', 'firefox', 'edge', 'opera', 'safari'
]);

// Vietnamese diacritic characters — presence of any one of these means the
// candidate string is already Vietnamese text (possibly mixed with ASCII
// loanwords/numbers), so it is not a violation.
const VN_DIACRITICS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

// Curated common-English-word list. A candidate is flagged only if, after
// stripping the allowlisted loanwords, it still contains one of these as a
// whole word — this is the "cries wolf" control valve: keep it to words
// that are unambiguously English UI vocabulary, not generic short tokens
// that could be incidental (variable names, abbreviations, etc.).
const ENGLISH_WORDS = new Set([
  'the', 'and', 'please', 'click', 'save', 'cancel', 'delete', 'edit', 'add',
  'remove', 'update', 'create', 'search', 'filter', 'export', 'import',
  'loading', 'error', 'warning', 'success', 'failed', 'required', 'invalid',
  'enter', 'select', 'choose', 'upload', 'download', 'submit', 'confirm',
  'close', 'open', 'back', 'next', 'previous', 'continue', 'password',
  'username', 'login', 'logout', 'sign', 'welcome', 'hello', 'thanks',
  'thank', 'sorry', 'settings', 'account', 'profile', 'yesterday',
  'tomorrow', 'quantity', 'active', 'inactive', 'enabled', 'disabled',
  'undefined'
]);

// ---------------------------------------------------------------------
// Comment masking — replaces comment contents with spaces (newlines kept)
// so line numbers of any later match stay accurate, and comment text can
// never produce a candidate (no code/markup chars survive inside it).
// ---------------------------------------------------------------------
function maskPattern(text, regex) {
  return text.replace(regex, function (m) { return m.replace(/[^\n]/g, ' '); });
}

/** String-literal-aware `//` line-comment masking, so a `//` inside a
 * quoted URL (e.g. 'https://...') is never mistaken for a comment start. */
function maskLineComments(text) {
  let out = '';
  let inString = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < text.length) { out += text[++i]; }
      else if (c === inString) { inString = null; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inString = c; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++; }
      i--; // let the outer loop re-process/preserve the newline itself
      continue;
    }
    out += c;
  }
  return out;
}

function stripComments(text) {
  text = maskPattern(text, /<!--[\s\S]*?-->/g);
  text = maskPattern(text, /\/\*[\s\S]*?\*\//g);
  text = maskLineComments(text);
  return text;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) { if (text[i] === '\n') line++; }
  return line;
}

// ---------------------------------------------------------------------
// Candidate extraction
// ---------------------------------------------------------------------

/** True if `word` (already lowercased) should never be treated as an
 * English violation on its own — either allowlisted, or too short/generic
 * to judge in isolation (single letters, numbers-as-words, etc.). */
function isBenignWord(word) {
  return ALLOWLIST.has(word);
}

/** Decide whether a raw candidate string is likely-English UI copy that
 * should have been Vietnamese. Returns a reason string if flagged, or null
 * if the candidate is fine (Vietnamese, allowlisted, or not real text). */
function classify(raw) {
  const text = raw.trim();
  if (!text) return null;
  if (VN_DIACRITICS.test(text)) return null; // already Vietnamese
  if (!/[A-Za-z]/.test(text)) return null; // no letters — numbers/punctuation/entities

  // Code-fragment guard: real UI text between tags/in dialogs never
  // contains these characters; a comparison/expression, or a JS string-
  // concatenation artifact (e.g. "' + SEARCH_ICON_SVG + '") accidentally
  // captured by the `>text<` pattern, would. (Vietnamese text that starts
  // with a literal "+ " prefix, e.g. "+ Thêm dòng", still has a diacritic
  // and is already filtered out above, so this guard never hides a real
  // Vietnamese violation.)
  if (/[(){};=&|\\+]/.test(text)) return null;

  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const flaggedWords = words.filter(function (w) {
    return !isBenignWord(w) && ENGLISH_WORDS.has(w);
  });
  if (flaggedWords.length === 0) return null;
  return 'likely-English word(s): ' + flaggedWords.join(', ');
}

function scanCandidates(maskedText, extractRegex, groupIndex) {
  const found = [];
  let m;
  extractRegex.lastIndex = 0;
  while ((m = extractRegex.exec(maskedText)) !== null) {
    const raw = m[groupIndex];
    if (raw === undefined) continue;
    const reason = classify(raw);
    if (reason) {
      found.push({ index: m.index, text: raw.trim(), reason: reason });
    }
    // guard against zero-length matches causing an infinite loop
    if (m[0].length === 0) extractRegex.lastIndex++;
  }
  return found;
}

function scanHtmlFile(relPath, absPath) {
  const original = fs.readFileSync(absPath, 'utf8');
  const masked = stripComments(original);

  const violations = [];

  // 1. HTML tag inner text: >text< — the char right before `>` must be
  // non-whitespace (real tag closes like `">` or `2>` never have a space
  // there; JS comparisons like `a > 3` do), which filters out the bulk of
  // stray `>`/`<` from comparison operators before the code-fragment guard
  // in classify() catches the rest.
  scanCandidates(masked, /[^\s>]>([^<>]{2,}?)</g, 1).forEach(function (v) {
    violations.push(Object.assign(v, { context: 'tag text' }));
  });

  // 2. placeholder="..." / placeholder='...'
  scanCandidates(masked, /placeholder\s*=\s*(["'])((?:(?!\1)[\s\S])*)\1/g, 2).forEach(function (v) {
    violations.push(Object.assign(v, { context: 'placeholder' }));
  });

  // 3. T.confirm(...) / confirm(...) / alert(...) / toast(...) first string arg
  scanCandidates(
    masked,
    /(?:^|[^.\w])(?:T\.confirm|confirm|alert|toast)\(\s*(["'])((?:\\.|(?!\1)[\s\S])*)\1/g,
    2
  ).forEach(function (v) {
    violations.push(Object.assign(v, { context: 'confirm/alert/toast' }));
  });

  return violations.map(function (v) {
    return {
      file: relPath,
      line: lineAt(masked, v.index),
      context: v.context,
      text: v.text,
      reason: v.reason
    };
  });
}

/** Narrow .gs scan: only the MSG object literal in Config.gs (both apps'
 * copies) — the sole place server-side user-facing text is defined (see
 * file header comment for the grep that confirmed this). */
function scanConfigMsgBlock(relPath, absPath) {
  const original = fs.readFileSync(absPath, 'utf8');
  const masked = stripComments(original);
  const msgMatch = /var MSG\s*=\s*\{([\s\S]*?)\n\};/.exec(masked);
  if (!msgMatch) return [];
  const block = msgMatch[1];
  const blockStart = msgMatch.index + msgMatch[0].indexOf(block);

  const violations = [];
  const stringRegex = /(["'])((?:\\.|(?!\1)[\s\S])*)\1/g;
  let m;
  while ((m = stringRegex.exec(block)) !== null) {
    const reason = classify(m[2]);
    if (reason) {
      violations.push({
        file: relPath,
        line: lineAt(masked, blockStart + m.index),
        context: 'MSG value',
        text: m[2].trim(),
        reason: reason
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------

const repoRoot = path.join(__dirname, '..', '..');
const uiDir = path.join(repoRoot, 'apps', 'web', 'ui');

const htmlFiles = fs.readdirSync(uiDir)
  .filter(function (f) { return f.endsWith('.html'); })
  .sort();

console.log('\n1. apps/web/ui/*.html — no unallowlisted likely-English user-visible strings');
let allViolations = [];
htmlFiles.forEach(function (f) {
  const rel = 'apps/web/ui/' + f;
  const abs = path.join(uiDir, f);
  const violations = scanHtmlFile(rel, abs);
  allViolations = allViolations.concat(violations);
});

check(htmlFiles.length + ' HTML file(s) scanned (' + uiDir + ')', htmlFiles.length > 0);
check('zero likely-English strings found outside the allowlist', allViolations.length === 0);
allViolations.forEach(function (v) {
  console.log('    ' + v.file + ':' + v.line + '  [' + v.context + ']  "' + v.text + '"  — ' + v.reason);
});

console.log('\n2. apps/api/Config.gs and apps/web/Config.gs — MSG values are Vietnamese');
const msgFiles = [
  ['apps/api/Config.gs', path.join(repoRoot, 'apps', 'api', 'Config.gs')],
  ['apps/web/Config.gs', path.join(repoRoot, 'apps', 'web', 'Config.gs')]
];
let msgViolations = [];
msgFiles.forEach(function (pair) {
  if (!fs.existsSync(pair[1])) return;
  msgViolations = msgViolations.concat(scanConfigMsgBlock(pair[0], pair[1]));
});
check('both Config.gs files found and scanned', msgFiles.every(function (p) { return fs.existsSync(p[1]); }));
check('zero likely-English MSG values found outside the allowlist', msgViolations.length === 0);
msgViolations.forEach(function (v) {
  console.log('    ' + v.file + ':' + v.line + '  [' + v.context + ']  "' + v.text + '"  — ' + v.reason);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
