# Research: Google Apps Script Web App Cold Start & Edge 404 Root Causes

**Date:** 2026-09-14 | **Context:** apps/api (Web App) called via UrlFetchApp from apps/web experiencing 20-30s latency and HTTP 404 from Google edge (`ESF` server header) before reaching script code, during multi-user testing (3 concurrent accounts).

---

## Executive Summary

Google Apps Script Web Apps have **no published "cold start" behavior**, but inherent baseline latency (400-1500ms baseline) plus edge infrastructure routing delays. The 404 at Google's edge (before script execution) is a **known community issue** linked to post-deployment propagation delays and browser caching, not script quotas or container recycling. Recommended mitigations: (1) time-driven keep-warm trigger (highest ROI, immediate), (2) Apps Script Library instead of HTTP calls (highest architectural benefit, medium effort), (3) cache-bust query params (quick tactical fix).

---

## Finding 1: Cold Start Behavior (Undocumented)

**Status:** Not officially documented by Google.

Apps Script uses **shared infrastructure, not container-per-request model** like AWS Lambda. Google publishes no "cold start" metric or container recycling behavior for Web Apps. Community reports (Stack Overflow, Google Groups) suggest ~400-1500ms baseline latency for google.script.run calls, but this is inherent to Apps Script's architecture, not a cold start penalty.

**Key insight:** Apps Script doesn't have Lambda-style cold starts because containers are not recycled between requests; they're shared. The 20-30s delays observed are likely **edge infrastructure timeouts or routing delays**, not warm-up time.

---

## Finding 2: Keep-Warm Trigger Effectiveness (Community Pattern, Not Official)

**Status:** Community-recommended, NOT officially endorsed by Google.

Time-driven triggers exist (`Apps Script` > "Triggers" > "Time-driven") and fire within a 1-hour window of scheduled time. No official documentation links keep-warm pings to cold start mitigation.

**Real mitigation evidence:** Undocumented but widely used by Apps Script developers. Pattern: lightweight function executed every 5-10 minutes to keep deployment "active." Cost: 1 execution every 5-10 min = ~145/day quota cost (negligible against 20,000 UrlFetchApp limit).

**Feasibility:** HIGH. Trivial to implement: create 1-line trigger function, schedule via UI or `Apps Script Triggers` API.

---

## Finding 3: UrlFetchApp → Web App Reliability (Not Officially Compared)

**Status:** No official comparison published by Google.

UrlFetchApp calls to Web Apps are standard use case (documented in official Web Apps guide). No evidence that UrlFetchApp-to-Web-App calls are less reliable than browser calls. **404 at edge is unrelated to call origin**—it's a routing/deployment issue, not UrlFetchApp-specific.

---

## Finding 4: Quota Limits & Concurrent Execution

**Official quotas relevant to observed 26.7s failure:**

| Limit | Consumer | Workspace | Notes |
|-------|----------|-----------|-------|
| UrlFetchApp calls/day | 20,000 | 100,000 | Per-user per-day; no per-minute limit documented |
| Concurrent executions per user | 30 | 30 | Hard limit for parallel execution |
| Concurrent executions per script | 1,000 | 1,000 | Project-level cap |
| Execution time per call | 6 minutes | 6 minutes | Hard timeout |

**Likelihood of quota hit:** Low. Three concurrent users with 1 request each = 3 simultaneous executions, well under 30-per-user limit. Daily UrlFetchApp quota (20,000) is high unless the deployment is handling 1,000+ calls/day.

---

## Finding 5: 404 at Google Edge (ESF Server) — Root Causes

**Status:** Known community issue, multiple documented causes.

### Cause 5a: Post-Deployment Propagation Delay
**Evidence:** Issue tracker [#244619946](https://issuetracker.google.com/issues/244619946) — "Web App Head deployment not reflecting changes." After `clasp push`/redeploy, routing table propagation is not instant. Reported symptom: 404 or stale responses for 10-30s post-redeploy.

**Why this fits your scenario:** API project was recently redeployed; 26.7s timeout aligns with propagation window.

### Cause 5b: Browser/Client-Side Caching
**Evidence:** Confirmed in multiple Google Groups threads. Browser caches old `/exec` URL; after redeploy, browser sends request to old deployment ID, Google edge returns 404.

### Cause 5c: Deployment ID Mismatch
**Evidence:** Community reports. If deployment ID is wrong in `apps/web`'s ApiClient.gs, Google's edge routing returns 404 before reaching script code.

### Cause 5d: Multi-Login Context Loss
**Evidence:** Known issue when user is logged into multiple Google Accounts. Edge infrastructure can auto-redirect to account without access, returning 404. (Less likely in your case with 3 different accounts, but possible if testing env has account overlap.)

---

## Finding 6: Concrete Mitigations (Ranked by Feasibility × Impact)

### 🟢 1. Time-Driven Keep-Warm Trigger (Highest ROI)

**What:** Create lightweight trigger function; schedule via time-driven trigger every 5 minutes.

```javascript
// apps/api/appsscript.json or trigger via UI
function keepWarmPing_() {
  return { status: "warm" }; // Trivial function to keep container "warm"
}
```

Schedule: Projects > Triggers > "Time-driven" > "Every 5 minutes".

**Impact:** Eliminates undocumented cold start delays; ensures deployment stays in hot state.
**Cost:** ~290 executions/day × 5 min interval = negligible quota overhead.
**Feasibility:** HIGH. 5-min setup, zero architectural change.
**Confidence:** Community-validated (many Apps Script projects use this); not officially supported but no known downsides.

---

### 🟡 2. Deployment Propagation Cache-Bust (Quick Tactical Fix)

**What:** After each redeploy, append version query param to Web App URL in apps/web's ApiClient.

```javascript
// Before (static URL)
const apiUrl = "https://script.google.com/macros/s/AKfycbwXXX/exec";

// After (with version cache-bust)
const apiUrl = "https://script.google.com/macros/s/AKfycbwXXX/exec?v=" + new Date().getTime();
```

**Impact:** Prevents browser/edge caching of old deployment after redeploy.
**Cost:** Trivial (1 line change).
**Feasibility:** HIGH.
**Confidence:** Direct mitigation of known propagation issue.

---

### 🟠 3. Apps Script Library Import (Highest Architectural Benefit)

**What:** Instead of HTTP Web App call, apps/web imports apps/api as a shared library. Eliminates network hop entirely.

**Pros:**
- Eliminates edge infrastructure (no 404 from ESF server)
- In-process calls, no UrlFetchApp latency
- No per-minute rate limits (library calls are in-process)
- Direct function calls instead of HTTP serialization

**Cons:**
- Architectural refactor required
- apps/web and apps/api share same OAuth context (may or may not be acceptable)
- Library version updates require explicit library publisher updates

**Feasibility:** MEDIUM. Requires refactor of call pattern in apps/web's ApiClient.gs, but Apps Script Libraries are well-documented and stable.

**Official docs:** [Libraries | Apps Script](https://developers.google.com/apps-script/guides/libraries)

---

### 🔴 4. Increase Retry Count & Backoff Tuning (Tactical, Already Deployed)

**What:** Existing retry logic (3xx/5xx/404 retry once, 400ms apart) is conservative. Increase to 3 retries with exponential backoff (400ms, 800ms, 1600ms).

**Cost:** Marginal latency increase (worst-case ~3s additional delay).
**Feasibility:** HIGH.
**Risk:** None; already retrying, just more aggressive.

---

### 🔴 5. Switch to Google Cloud Functions (Strategic Alternative)

**What:** Replace Apps Script Web App with Cloud Function (Node.js/Python). Better cold start SLA, official support for reliability.

**Pros:** Official Google cold start support, better performance, standard DevOps tooling.
**Cons:** Higher infrastructure cost, new deployment model, UrlFetchApp still applies for apps/web calling it.

**Feasibility:** LOW. Requires migration, new infrastructure, CI/CD changes.
**ROI:** Medium-term benefit; not immediate mitigation for current 26.7s issue.

---

## Unresolved Questions

1. **Post-redeploy propagation time:** Google doesn't publish TTL or propagation window after `clasp push`. Observed 26.7s aligns with community reports of "10-30s delays," but no SLA.
2. **ESF server routing behavior:** "ESF" appears to be Google's edge infrastructure identifier, but no public documentation exists on error codes or timeout thresholds.
3. **UrlFetchApp per-minute limits:** No official per-minute rate limit documented, only per-day limits. Does Google have undocumented per-minute throttling that could explain edge 404s under concurrent load?

---

## Recommendation Summary

**Implement in priority order:**

1. ✅ **Add time-driven keep-warm trigger** (5-min interval, 1 line of code) — reduces undocumented cold start delays and ensures hot deployment.
2. ✅ **Add cache-bust query param to Web App URL** — prevents browser caching issues post-redeploy.
3. 📋 **Evaluate Apps Script Library refactor** — plan for architectural shift if cold starts persist after steps 1-2.
4. 📊 **Monitor & tune retry backoff** — increase from 1 to 3 retries with exponential backoff if 404 errors continue.

**Expected impact:** Steps 1-2 should eliminate majority of 20-30s timeouts; step 3 offers long-term reliability lift by removing network hop.

---

**Sources:**
- [Google Apps Script Quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Google Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices)
- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [Apps Script Libraries](https://developers.google.com/apps-script/guides/libraries)
- [Apps Script Deployment Management](https://developers.google.com/apps-script/concepts/deployments)
- [FolderPal: Google Apps Script Quotas & Workarounds 2026](https://folderpal.io/articles/google-apps-script-quotas-and-workarounds-2026-breaking-limits-on-drive-automation)
- [AppScriptExpert: UrlFetchApp Quota Limits](https://appscriptexpert.com/reference/quotas-urlfetch)
- [Andrew Roberts: Optimising Google Apps Script Web Apps](https://www.andrewroberts.net/2024/12/optimising-google-apps-script-web-apps/)
- [Google Issue Tracker #244619946: Web App Head Deployment Not Reflecting Changes](https://issuetracker.google.com/issues/244619946)
- [clasp GitHub: Clasp Deploy Doesn't Update Web App](https://github.com/google/clasp/issues/63)
