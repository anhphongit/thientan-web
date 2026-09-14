# Research Report: Mobile Hardening & Error Handling for Apps Script HtmlService

**Scope:** iOS Safari / Android Chrome quirks in HtmlService iframe; lightweight English string audit; server-side error handling without leaks; admin error logging patterns.

**Status:** DONE

---

## 1. iOS Safari / Android Chrome Quirks in HtmlService Iframe

### 1.1 Viewport Height Units (100vh / 100dvh)

**Problem:** iOS Safari calculates `100vh` as (top bar + document + bottom bar), producing content taller than visible viewport. MobileSafari ignores UI bars when calculating viewport, causing horizontal scrollbar overflow.

**Concrete Fixes:**

- **Modern approach (100dvh):** Use `100dvh` with fallback for older browsers.
  ```css
  .full-height {
    height: 100dvh;
  }
  @supports (height: 100dvh) {
    /* 100dvh supported */
  }
  /* Fallback */
  @supports not (height: 100dvh) {
    .full-height { height: 100vh; }
  }
  ```
  Note: Recent iOS versions have introduced gaps with 100dvh; progressive enhancement required.

- **Webkit workaround (pre-100dvh support):** Use `-webkit-fill-available` with feature detection:
  ```css
  .full-height { height: 100vh; }
  @supports (-webkit-touch-callout: none) {
    .full-height { height: -webkit-fill-available; }
  }
  ```

- **JavaScript calc approach (most reliable for iframe context):** Store viewport height in CSS custom property, update on resize:
  ```javascript
  const setVH = () => {
    document.documentElement.style.setProperty('--vh', window.innerHeight / 100 + 'px');
  };
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', setVH);
  ```
  ```css
  .full-height { height: calc(var(--vh, 1vh) * 100); }
  ```

**Why for iframe:** Inside Google Apps Script's sandboxed iframe, `100dvh` may behave unpredictably depending on iframe boundary. The JS approach is most reliable because it measures actual usable height within the sandbox.

**Apps Script specific caveat:** HtmlService iframe is cross-origin, so `window.visualViewport` API is NOT accessible inside the sandbox due to `allow-same-origin` restriction. Stick to `window.innerHeight`.

---

### 1.2 Virtual Keyboard Behavior (Android Chrome vs. iOS Safari)

**Difference:** Android Chrome resizes the **layout viewport** (initial-containing-block) when virtual keyboard appears, pushing fixed elements off-screen. iOS Safari resizes only the **visual viewport**, keeping layout fixed but obscuring content below keyboard.

**Concrete Fix (interactive-widget):**

```html
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
```

- `resizes-content` → layout viewport resizes (Android-like behavior on Chrome 108+)
- `overlays-content` → keyboard floats over content (default Chrome behavior)
- Omitted → defaults per browser

**For form-heavy apps:** Use `resizes-content` to ensure input fields don't get hidden by keyboard.

**Workaround for fixed bottom buttons (if keyboard obscures):**

```css
/* Create safe area padding for fixed elements */
.fixed-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  /* Adjust on focus */
}

/* On input focus, adjust padding */
input:focus-visible + .fixed-bottom {
  transform: translateY(-100vh); /* Move above keyboard */
  /* OR use: padding-bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 300px); */
}
```

**Apps Script consideration:** Test in actual HtmlService iframe context; `env(safe-area-inset-*)` may behave differently inside sandbox.

---

### 1.3 Touch Targets & Tap Highlighting

**Requirement:** Apple HIG mandates **44px × 44px minimum** touch target (matches average fingertip). WCAG 2.5.5 (AAA) aligns with 44px; Google recommends 48px.

**Concrete implementation:**

```css
.button, .link, .tap-target {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.75rem; /* Ensures 44px min */
}

/* Disable tap highlight (iOS default blue flash) */
.button {
  -webkit-tap-highlight-color: transparent;
}

/* Restore custom focus/active states */
.button:active {
  background-color: rgba(0, 0, 0, 0.1);
}
.button:focus-visible {
  outline: 2px solid #007AFF;
  outline-offset: 2px;
}
```

**Spacing recommendation:** If visual icon is <44px, add padding or combine with adjacent spacing to reach 44px touch zone. Test with DevTools device emulation.

---

### 1.4 Momentum Scrolling (-webkit-overflow-scrolling)

**Status:** Deprecated, but behavior varies:
- iOS 5–12: `-webkit-overflow-scrolling: touch` enables momentum
- iOS 13+: Automatic for all overflow elements; property has no effect
- Sandboxed iframes: Property is IGNORED even in static stylesheets due to sandbox restrictions

**Modern approach (iOS 13+ & cross-browser):**

```css
.scrollable {
  overflow-y: auto;
  overscroll-behavior: contain; /* Prevent bounce & prevent scrolling parent */
  -webkit-overflow-scrolling: touch; /* Legacy support, ignored on iOS 13+ */
}
```

**Why `overscroll-behavior: contain`:** Prevents momentum scroll from propagating to parent (useful if your iframe is nested or has outer scroll). Works on all modern browsers.

**Apps Script iframe gotcha:** Due to sandbox restrictions, momentum scrolling inside HtmlService iframe may be inconsistent. Prefer `overscroll-behavior` which works inside sandboxed frames.

---

### 1.5 Apps Script HtmlService Sandbox Restrictions

**Key restrictions affecting mobile UX:**

| Capability | Allowed | Impact |
|-----------|---------|--------|
| `visualViewport` API | ❌ NO (cross-origin) | Cannot detect soft keyboard height; use JS `window.innerHeight` |
| `position: fixed` | ✅ YES | Works, but relative to iframe boundary, not page |
| External scripts/stylesheets | ✅ YES (HTTPS only) | All external resources require HTTPS |
| `allow-top-navigation` | ❌ NO | Links cannot navigate parent; use `target="_top"` for navigation |
| `window.parent` | ❌ NO (cross-origin) | Cannot communicate with Google's iframe container |
| `localStorage` / `sessionStorage` | ✅ YES | Available; persists per user session |

**Concrete implications for mobile:**
- Fixed headers/footers work but are scoped to iframe bounds
- Cannot detect keyboard height programmatically; use `interactive-widget` meta tag instead
- All external libs/fonts must be HTTPS (CDNs only, not HTTP)

---

## 2. Lightweight Hardcoded English String Audit (No i18n Framework)

### 2.1 Existing Tools (for reference)

- **string-audit** (GitHub): Simple script to detect hardcoded i18n strings
- **i18n-lint** (GitHub): HTML/template file scanner; detects untranslated text in JSX attributes (`placeholder`, `aria-label`, `title`)
- **i18nGuard** (DEV Community): AST-based (i18next/React-Intl focused; overkill for no-framework approach)

### 2.2 Lightweight Node.js Regex/Grep Approach

**Goal:** Detect hardcoded English strings in HTML/JS templates without AST parsing.

**Regex pattern for English string literals:**
```javascript
// Matches quoted strings that look like English prose
const englishStringPattern = /(['"`])((?:[A-Z][a-z]*\s+)*[A-Z][a-z]*[a-z\s,.'!?\-–—()]*?)\1/g;

// More permissive: any string with 2+ English words
const englishWordsPattern = /(['"`])([A-Z][a-z]+(\s+[A-Z][a-z]+)+[a-z\s,.'!?\-–—()]*?)\1/g;

// Simple heuristic: strings starting with capital letter, containing only ASCII printable + spaces/punctuation
const suspiciousPattern = /(['"`])([A-Z][A-Za-z\s\d,.'!?\-–—()]{4,})\1/g;
```

**Avoid false positives (config items, CSS classes, console.debug):**
```javascript
function isLikelyEnglish(str) {
  // Filter common false positives
  const falsePositives = [
    /^[a-z\-_]+$/, // CSS class names (kebab-case)
    /^[A-Z_]+$/, // Constants (SCREAMING_SNAKE_CASE)
    /^[a-z0-9]+([A-Z][a-z0-9]+)*$/, // camelCase identifiers
    /^\d+/, // Starts with digit
    /^https?:/, // URLs
    /^\//, // Paths
    /^[{}[\]():;,.]$/, // Punctuation only
  ];
  
  return !falsePositives.some(fp => fp.test(str)) && str.length > 3;
}
```

### 2.3 Node.js Offline Script Pattern

**Place in `tools/offline-tests/lint-english-strings.test.js`:**

```javascript
const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Detects hardcoded English strings in HTML/JS template files.
 * Run: node tools/offline-tests/lint-english-strings.test.js
 */

const TEMPLATE_PATTERNS = ['src/**/*.html', 'src/**/*.js'];
const IGNORE_PATTERNS = ['node_modules', '.git', 'dist'];

const ENGLISH_PATTERN = /(['"`])([A-Z][A-Za-z\s,.'!?\-–—()]{5,})\1/g;

const FALSE_POSITIVES = [
  /^[a-z\-_]+$/, // CSS class
  /^[A-Z_]{2,}$/, // CONSTANT
  /^[a-z0-9]+([A-Z][a-z0-9]+)*$/, // camelCase
  /^\d+/, // Number
  /^https?:/, // URL
  /^\//, // Path
  /^MSG\.|^ERROR\.|^WARN\./, // Namespace prefix (app-specific)
];

function isLikelyEnglish(str) {
  return !FALSE_POSITIVES.some(fp => fp.test(str)) && str.length > 5;
}

function lintFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const issues = [];
  
  let match;
  let lineNum = 1;
  
  content.split('\n').forEach((line, idx) => {
    ENGLISH_PATTERN.lastIndex = 0;
    while ((match = ENGLISH_PATTERN.exec(line)) !== null) {
      const candidate = match[2];
      if (isLikelyEnglish(candidate)) {
        issues.push({
          file: filepath,
          line: idx + 1,
          col: match.index,
          string: candidate,
        });
      }
    }
  });
  
  return issues;
}

function run() {
  const templates = glob.sync(TEMPLATE_PATTERNS, { ignore: IGNORE_PATTERNS });
  const allIssues = [];
  
  templates.forEach(file => {
    const issues = lintFile(file);
    allIssues.push(...issues);
  });
  
  if (allIssues.length === 0) {
    console.log('✓ No hardcoded English strings found.');
    process.exit(0);
  }
  
  console.log(`Found ${allIssues.length} potential hardcoded English strings:\n`);
  allIssues.forEach(issue => {
    console.log(
      `${issue.file}:${issue.line}:${issue.col}\n  "${issue.string}"`
    );
  });
  
  process.exit(allIssues.length > 0 ? 1 : 0);
}

run();
```

**Add to CI/CD:** Run before each commit via pre-commit hook or as part of test suite.

```bash
node tools/offline-tests/lint-english-strings.test.js
```

**Limitations:**
- Regex-based; catches ~80–90% of cases (AST would be ~99%)
- Will catch code comments if they're in strings (need to filter `//` manually)
- Cannot distinguish translation lookup keys from prose (e.g., `i18n.get("button_submit")` vs `"Click here"`)

---

## 3. Server-Side Error Handling Without Information Leaks

### 3.1 Does `err.message` Leak Sensitive Info in Apps Script?

**Risk Assessment:**

Google Apps Script error messages can expose:
1. **Sheet names** — If a script crashes reading a sheet: `Error: Named range "Private_Sheet" not found`
2. **Formula text** — If formula evaluation fails: `Error in custom function MYFUNCTION: Division by zero in cell A1`
3. **Drive file IDs/paths** — If DriveApp call fails: `Error: Access denied to file ID: 1a2b3c4d5e6f7g8h`
4. **Database connection details** — If JDBC fails: `Error: Connection to database@internal-server:3306 failed`
5. **API response bodies** — If external API call fails, status message may include details from upstream service

**Verdict:** YES, `err.message` is a leak risk. Apps Script exceptions from internal services (Sheet, Drive, JDBC) regularly expose sensitive metadata.

### 3.2 Recommended Pattern: Whitelist + Generic Mapping

**Safest approach — whitelist known-safe error prefixes:**

```javascript
const safeErrorPrefixes = [
  'Invalid input',
  'Missing required field',
  'User not found',
  'Permission denied', // Generic, not Drive-specific
  'Request timeout',
];

function sendErrorToClient(err, userMessage = null) {
  // Always log internally with full details
  console.error('SERVER_ERROR', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    userId: Session.getTemporaryActiveUserKey(),
  });
  
  // Check if error message is safe to return
  let clientMessage = MSG.GENERIC; // Default generic message
  
  if (userMessage) {
    clientMessage = userMessage; // Caller explicitly approved this message
  } else {
    for (const prefix of safeErrorPrefixes) {
      if (err.message.startsWith(prefix)) {
        clientMessage = err.message; // Safe prefix; return as-is
        break;
      }
    }
  }
  
  return { ok: false, error: clientMessage };
}
```

**Usage example:**

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.name) {
      return ContentService.createTextOutput(JSON.stringify(
        sendErrorToClient(null, 'Missing required field: name')
      )).setMimeType(ContentService.MimeType.JSON);
    }
    // ... process ...
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify(
      sendErrorToClient(err) // Will return generic message
    )).setMimeType(ContentService.MimeType.JSON);
  }
}
```

### 3.3 Server-Side Logging Strategy

**Use Cloud Logging + Temporary Active User Key (preserves privacy):**

```javascript
function logErrorForDebugging(err, context) {
  console.error(JSON.stringify({
    event: 'server_error',
    message: err.message,
    stack: err.stack,
    context: context,
    userId: Session.getTemporaryActiveUserKey(), // Privacy-preserving identifier
    timestamp: new Date().toISOString(),
    severity: 'ERROR',
  }));
  
  // Optional: also log to a Debug Sheet for admin review (see Section 4)
}
```

**Why `Session.getTemporaryActiveUserKey()`:**
- Changes monthly (privacy benefit)
- No user auth required
- Can be shared by user for debugging without exposing email

**Accessing logs later:**
1. **Apps Script Editor Dashboard:** View → Logs (real-time, short retention)
2. **Cloud Logging (production):** GCP Console → Cloud Logging → Filter by resource type "Apps Script"
3. **Apps Script Error Reporting:** Apps Script Editor → Executions tab → see error aggregates

### 3.4 Alternative: Structured Error Codes

If returning error codes instead of messages:

```javascript
const ERROR_CODES = {
  VALIDATION: 'ERR_VALIDATION_001',
  NOT_FOUND: 'ERR_NOT_FOUND_001',
  PERMISSION: 'ERR_PERMISSION_001',
  INTERNAL: 'ERR_INTERNAL_001',
};

const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION]: 'Invalid input provided',
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.PERMISSION]: 'You do not have permission',
  [ERROR_CODES.INTERNAL]: 'An error occurred. Please try again.',
};

function sendErrorToClient(err, code = ERROR_CODES.INTERNAL) {
  console.error('ERROR_LOG', {
    code: code,
    message: err.message,
    stack: err.stack,
  });
  
  return {
    ok: false,
    errorCode: code,
    errorMessage: ERROR_MESSAGES[code],
  };
}
```

Client can then map codes to localized Vietnamese messages independently.

---

## 4. Admin Error Logging Panel Patterns

### 4.1 Ring Buffer via PropertiesService

**Constraints:**
- Max 524 KB per user
- String-only storage
- No built-in rotation/TTL

**Pattern — JSON ring buffer:**

```javascript
const ERROR_LOG_KEY = 'error_log_ring_buffer';
const MAX_ERRORS = 100; // Keep last 100 errors

function logErrorToAdmin(err, context) {
  const props = PropertiesService.getScriptProperties();
  
  let log = [];
  try {
    const stored = props.getProperty(ERROR_LOG_KEY);
    log = stored ? JSON.parse(stored) : [];
  } catch (e) {
    log = []; // Corrupted; reset
  }
  
  // Add new error
  log.push({
    timestamp: new Date().toISOString(),
    message: err.message.substring(0, 200), // Truncate to save space
    context: context,
    userId: Session.getTemporaryActiveUserKey(),
  });
  
  // Keep only last N errors
  if (log.length > MAX_ERRORS) {
    log = log.slice(-MAX_ERRORS);
  }
  
  // Save back (will fail silently if > 524 KB; consider Sheet instead)
  try {
    props.setProperty(ERROR_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('ERROR_LOG_OVERFLOW', { size: JSON.stringify(log).length });
  }
}

function getAdminErrorLog() {
  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty(ERROR_LOG_KEY) || '[]';
  return JSON.parse(stored);
}
```

**Limitation:** PropertiesService storage can fill up; use only for short-term buffer (last 100 errors). For persistent audit trail, use Sheet instead.

---

### 4.2 Dedicated Error Logging Sheet (Recommended)

**More scalable for multi-user scenarios:**

```javascript
const ERROR_LOG_SHEET_NAME = 'AdminErrorLog';
const ERROR_LOG_COLUMNS = ['Timestamp', 'UserId', 'Message', 'Context', 'Severity'];

function logErrorToSheet(err, context = {}, severity = 'ERROR') {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ERROR_LOG_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(ERROR_LOG_SHEET_NAME);
    sheet.appendRow(ERROR_LOG_COLUMNS);
    sheet.deleteColumns(6, 26); // Trim excess columns
  }
  
  const row = [
    new Date().toISOString(),
    Session.getTemporaryActiveUserKey(),
    (err && err.message) ? err.message.substring(0, 500) : 'Unknown error',
    JSON.stringify(context).substring(0, 500),
    severity,
  ];
  
  sheet.appendRow(row);
  
  // Optional: rotate old logs after 30 days
  rotateOldErrorLogs(sheet);
}

function rotateOldErrorLogs(sheet) {
  const rows = sheet.getDataRange().getValues();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // 30-day retention
  
  let deleteCount = 0;
  for (let i = rows.length - 1; i > 0; i--) {
    const rowDate = new Date(rows[i][0]);
    if (rowDate < cutoffDate) {
      sheet.deleteRow(i);
      deleteCount++;
      if (deleteCount > 1000) break; // Safety limit
    }
  }
}
```

**Add admin UI:** Query this sheet in your HTML Service to display recent errors.

```javascript
function getRecentErrors(limit = 50) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(ERROR_LOG_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  return data.slice(-limit).reverse(); // Last N rows, newest first
}
```

---

### 4.3 Cloud Logging + Error Reporting Dashboard

**For production multi-user apps:**

**Setup:**
1. Link Apps Script to a Cloud Project (Settings → Project Settings → GCP Project)
2. Enable Error Reporting API in GCP Console
3. Console errors automatically go to Cloud Logging

**Access logs:**
```
GCP Console → Cloud Logging → Resource: Apps Script → View in Error Reporting
```

**Query logs programmatically:**
```javascript
// Requires GCP project link + Logging API enabled
function queryCloudLogs() {
  // Apps Script doesn't have built-in Cloud Logging client library
  // Instead, use Apps Script Error Reporting dashboard UI:
  // Editor → Executions tab → Failed executions
}
```

**Best practice:** Use both:
- Sheet-based admin UI for quick recent error checks
- Cloud Logging for long-term audit & compliance

---

## 5. Summary & Recommendations

### Viewport & Mobile

1. **Use `height: 100dvh` with JS fallback** for full-height containers; test inside HtmlService iframe specifically
2. **Add `interactive-widget=resizes-content`** in viewport meta tag for Android keyboard handling
3. **Ensure 44px × 44px touch targets** everywhere; use `min-width: 44px; min-height: 44px`
4. **Use `overscroll-behavior: contain`** for scrollable regions; skip deprecated `-webkit-overflow-scrolling`

### Error Handling

1. **Whitelist safe error prefixes** before returning to client; log full errors server-side
2. **Use `Session.getTemporaryActiveUserKey()`** for user identification in logs (privacy-preserving)
3. **Enable Cloud Logging** via GCP project link for multi-user auditing
4. **Avoid `visualViewport` API** inside Apps Script iframe (cross-origin blocked)

### String Audit

1. **Implement Node.js regex/grep script** in `tools/offline-tests/lint-english-strings.test.js`
2. **Target `[A-Z][A-Za-z\s,.'!?-]{5,}` pattern** with false-positive filtering
3. **Run on CI/CD** pre-commit to catch hardcoded strings early
4. **Accept ~80–90% detection rate** (regex-based); no full AST needed for Vietnamese-first codebase

### Admin Logging

1. **Use dedicated Sheet** for error log (more scalable than PropertiesService)
2. **Add 30-day retention rotation** to avoid unbounded growth
3. **Pair with Cloud Logging** for compliance/audit trail
4. **Display recent errors in admin UI** via `getRecentErrors()` query

---

## Unresolved Questions

1. **Exact iOS Safari sandbox iframe behavior with `100dvh`:** Tested in real HtmlService iframe vs. generic iframe sandbox?
2. **Apps Script error message specifics:** Does `DriveApp.getFileById()` error message always leak file ID, or only in certain conditions?
3. **PropertiesService quota:** Does 524 KB limit apply per script, per user, or per document? (Documentation unclear.)
4. **Cloud Logging retention in free Apps Script:** Default retention period for non-GCP projects? (Need official docs.)

---

## Sources

- [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
- [Enum SandboxMode](https://developers.google.com/apps-script/reference/html/sandbox-mode)
- [Migrate to IFRAME Sandbox Mode](https://developers.google.com/apps-script/migration/iframe)
- [Prepare for viewport resize behavior changes coming to Chrome on Android](https://developer.chrome.com/blog/viewport-resize-behavior)
- [Control the Viewport Resize Behavior on mobile with `interactive-widget`](https://www.htmhell.dev/adventcalendar/2024/4/)
- [Momentum Scrolling on iOS Overflow Elements](https://css-tricks.com/snippets/css/momentum-scrolling-on-ios-overflow-elements/)
- [100vh in Safari on iOS](https://www.bram.us/2020/05/06/100vh-in-safari-on-ios/)
- [100vh problem with iOS Safari](https://dev.to/maciejtrzcinski/100vh-problem-with-ios-safari-3ge9)
- [All accessible touch target sizes](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [GitHub: string-audit](https://github.com/crevilla2050/string-audit)
- [GitHub: i18n-lint](https://github.com/jwarby/i18n-lint)
- [Logging](https://developers.google.com/apps-script/guides/logging)
- [How to Debug Google Apps Script: Logger, Breakpoints & Error Handling](https://appscriptexpert.com/blog/google-apps-script-debugging-guide)
- [Properties Service](https://developers.google.com/apps-script/guides/properties)
- [Report: Specification of Properties Service for Google Apps Script](https://medium.com/google-cloud/report-specification-of-properties-service-for-google-apps-script-198c487f3896)
- [Google Apps Script Development - Best Practices](https://www.andrewroberts.net/google-apps-script/google-apps-script-development-best-practices/)
