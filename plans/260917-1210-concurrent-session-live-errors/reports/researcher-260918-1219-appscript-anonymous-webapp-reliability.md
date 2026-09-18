# Google Apps Script Anonymous Web App Reliability Research

**Report Date:** 2026-09-18  
**Research Scope:** External documentation, issue trackers, and community reports only  
**Prepared for:** Debugging production failures in dual-project Apps Script deployment

---

## Executive Summary

**Is this known?** YES — partially. Google's official documentation does not describe ANYONE_ANONYMOUS deployments as less reliable. However:

- The **302 redirect flow** required by Apps Script web apps is documented and can cause response delivery issues if not handled correctly (clients must follow redirects or manually chain two requests)
- **Response delivery delays and 404 errors under load are not officially documented** as a known limitation, but appear as recurring community reports across multiple forums dating back several years
- **Consumer vs. Workspace account reliability** for concurrent execution is **identical by quota** (30 concurrent per user), but consumer accounts have significantly lower daily quotas for UrlFetch (20k/day vs 100k/day)
- **ANYONE_ANONYMOUS access control has documented edge cases** where users are still prompted to login despite the setting

**Is there a documented cause?** PARTIAL:
- The 302 redirect mechanics are fully documented, but the specific scenario of "backend completes quickly, caller gets delayed 404/302" is not explicitly addressed in official docs
- Response delivery delays may be related to load-shedding at Google's edge infrastructure (ESF = Google Front End), but this is inferred, not confirmed

**Is there a known fix?** NO universal fix documented. Partial mitigations exist:
- Explicit redirect handling in client code (followRedirects parameter, manual Location header extraction)
- Upgrading to Workspace domain for higher quotas and better support
- Migrating API layer to Cloud Run or Cloud Functions
- Implementing exponential backoff + retry in UrlFetchApp clients

---

## Question 1: ANYONE_ANONYMOUS vs Authenticated Deployments — Reliability Difference

**Status:** NOT CONFIRMED by official docs; SINGLE REPORT by community  
**Confidence:** Low — Observational only

### Official Documentation Finding

Google's [Web Apps guide](https://developers.google.com/apps-script/guides/web) distinguishes between:
- **"Execute the app as me"** — Script runs as owner regardless of caller identity
- **"Execute the app as user accessing the web app"** — Script runs under caller's identity

The documentation does NOT discuss "ANYONE_ANONYMOUS" vs "ANYONE" or differentiate reliability by access control setting.

### Community Reports

**Finding:** Single anecdotal report from Google Drive Community forum (2020)  
- Title: ["published app script web app can't be reached by anonymous users"](https://support.google.com/drive/thread/57559393/published-app-script-web-app-can-t-be-reached-by-anonymous-users?hl=en)
- Report: Web app deployed with "Anyone, even anonymous" access still prompts users to login
- Resolution: Not definitively resolved in the thread; possible browser cache/multi-account interference

**Finding:** Forum discussion on [ANYONE_ANONYMOUS deployment](https://groups.google.com/g/google-apps-script-community/c/owFeX5fTcyo) (2024)  
- Issue: Users reported that "Anyone, even anonymous" setting is sometimes missing as a deployment option
- Cause: Appears related to Google Workspace domain policies (admins can restrict ANYONE access)

**Key Takeaway:** There is evidence that ANYONE_ANONYMOUS deployments can have edge cases (not reliably "always allow" in all scenarios), but no systematic evidence that they fail under concurrency while ANYONE (requires login) succeeds.

---

## Question 2: "Exception: Address Unavailable" from UrlFetchApp

**Status:** PARTIALLY CONFIRMED by community; NOT in official docs  
**Confidence:** Medium — Consistent interpretation across forums

### What It Means

**Finding:** "Address unavailable" indicates the target server is unreachable or unresponsive.  
Source: [Google Apps Script Community Forum - Address Unavailable](https://groups.google.com/g/adwords-scripts/c/5xSmFDP7Bos)

Breakdown:
- **Not an HTTP response code** — It's a thrown exception from the UrlFetchApp runtime
- **Occurs when:** Target URL returns no response at all (not even an error page)
- **Not handled by `muteHttpExceptions: true`** — That parameter only suppresses HTTP error responses (4xx, 5xx); does not catch network-level failures

### Root Causes

1. **DNS resolution failure** — Domain not resolvable
2. **Connection refused** — Target IP:port not accepting connections
3. **Google IP blocked by target server** — Many servers block Google's IP ranges to prevent scraping
4. **Network timeout** — No TCP handshake within timeout window (~60s for UrlFetchApp)
5. **Firewall/routing issues** — Packets dropped between Google's edge and target

### Official Guidance

Google's [URL Fetch API docs](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app) do not explicitly document "Address unavailable" exception. Community solutions recommend:

```javascript
try {
  var response = UrlFetchApp.fetch(url);
} catch (e) {
  Logger.log("Network error: " + e.toString());
  // Implement retry with exponential backoff
}
```

**Key Takeaway:** "Address unavailable" is a **network-level failure, not a Google Apps Script quota/platform issue**. In your scenario, this suggests transient connectivity or load-shedding at Google's edge (ESF), not a bug in apps/api itself.

---

## Question 3: Concurrent Execution Quotas — Consumer vs Workspace (Official)

**Status:** CONFIRMED by official documentation  
**Confidence:** High — Official source

### Official Quotas

From [Google Apps Script Quotas documentation](https://developers.google.com/apps-script/guides/services/quotas):

| Metric | Consumer Gmail | Workspace | Notes |
|--------|---|---|---|
| **Simultaneous executions per user** | 30 | 30 | **IDENTICAL** |
| **Simultaneous executions per script** | 1,000 | 1,000 | **IDENTICAL** |
| **Execution time per run** | 6 minutes | 30 minutes | Workspace 5x higher |
| **Daily UrlFetch calls** | 20,000 | 100,000 | Workspace 5x higher |
| **Daily trigger runtime** | 90 minutes | 6 hours (360 minutes) | Workspace 4x higher |

### Critical Finding

The **30 concurrent executions per user limit is identical for consumer and Workspace accounts**. This contradicts any hypothesis that consumer accounts have lower concurrency quota — they don't.

However, the Executions dashboard only shows **currently running executions**. Once an execution completes, it's no longer counted against the limit.

### Web App Access and Quotas

Documentation does **not specify separate quota tiers for ANYONE_ANONYMOUS vs ANYONE access**. The concurrent execution limit is user-based (the owner, if "Execute as me" is set), not access-control-based.

### Implication for Your Scenario

Peak of **12 concurrent executions well under the 30-per-user limit** is not a quota breach. However, the daily UrlFetch quota (20k for consumer) could be exhausted under high volume — each retry attempt counts as a separate UrlFetch call.

**Key Takeaway:** The quota explanation doesn't fit. Concurrency is not the bottleneck at 12/30.

---

## Question 4: Community Reports — Same Symptom Cluster

**Status:** MULTIPLE CONFIRMATIONS; not explicitly under concurrent load  
**Confidence:** Medium — Symptom overlap; context differs slightly

### Core Issue: 302 Redirect Handling

**Finding:** WELL DOCUMENTED  
Source: [Kanshi Tanaike Medium article](https://medium.com/google-cloud/understanding-flow-of-request-to-web-apps-created-by-google-apps-script-ac49e80f7c6b) + [GitHub Gist](https://gist.github.com/tanaikech/131ba814a1f6012fd6a5ffe11789971f)

**The flow (confirmed across all sources):**
1. **Request 1:** Client POSTs to `https://script.google.com/macros/s/{deploymentId}/exec`
2. **Response 1:** Server returns HTTP 302 with `Location: https://script.googleusercontent.com/macros/echo?user_content_key=...`
3. **Request 2:** Client must GET to the redirect URL (NOT POST — POST causes 405 Method Not Allowed)
4. **Response 2:** The actual response from `doPost`/`doGet` is returned

**Critical Detail:** If the client doesn't follow the redirect (or doesn't follow it correctly with GET), it receives the 302 itself or a bare 404 from Google's edge.

### Delayed Response Reports

**Finding:** Indirect evidence from DEV Community + community forums

Sources:
- [DEV Community: "You're Probably Using curl Wrong"](https://dev.to/googleworkspace/youre-probably-using-curl-wrong-with-your-google-apps-script-web-app-1ed8) — discusses 302 redirect handling issues
- [Google Apps Script Community: "Web App concurrent user limitations"](https://groups.google.com/g/google-apps-script-community/c/qUUGk6G1AnA) — mentions "if multiple users edit simultaneously or external webhooks fire rapidly into a web app, you will quickly breach the 'simultaneous executions' limits, which operate like a firewall"

**Key Finding:** The "firewall" (concurrent execution limit) acts as load-shedding. When 30 concurrent executions are reached, new requests are queued/rejected. However, your executions dashboard shows only 12 concurrent, so this shouldn't trigger.

### 404 Under Load

**Finding:** Reported but not systematically documented  
Sources:
- [Google Apps Script Community: "Apps Script webapp started redirecting to 404"](https://groups.google.com/g/google-apps-script-community/c/1xrlqlkGEQ0)
- [Spreadsheet.dev: "Apps Script deployed as a Web App returns 404 error"](https://spreadsheet.dev/apps-script-deployed-as-web-app-returns-404-error)

Common causes identified (but NOT under concurrency):
- URL contains `/u/1/` path (multi-account session issue)
- URL missing domain path for G Suite/Workspace deployments
- Authentication state (rare: users logged into multiple accounts triggering wrong session)

**None of these match your scenario** (single-user console, same deployment URL).

### Response Timeout (30-190s) — No Direct Reports

**Finding:** NOT found in community forums with exact symptoms  
Closest matches:
- [DEV Community: "Cold start times lasting several seconds"](https://dev.to/stack_c285afb2fa0bef/google-apps-script-quota-limits-2026-every-error-every-fix-2p87) for scripts using libraries (but not 30-190s)
- General [UrlFetchApp timeout reports](https://groups.google.com/g/google-apps-script-community/c/kaq3aJ69RRI) mention a hard 60-second timeout, but not "request waits 30-190s then times out"

**Key Takeaway:** Your specific symptom (backend done in 2s, caller doesn't receive response for 30-190s, then gets 404/302) is NOT a documented or widely reported issue. This suggests either:
1. A rare edge case in Google's edge infrastructure (ESF load-shedding or replication lag)
2. An undocumented behavior specific to ANYONE_ANONYMOUS + consumer account combination
3. A transient infrastructure issue that resolved itself

---

## Question 5: Alternative Architectures — Single Owner API, Multiple Callers

**Status:** PARTIALLY CONFIRMED by official docs + community  
**Confidence:** Medium

### Documented Alternatives

#### Google Cloud Run (Recommended for new projects)

Source: [Google Developers Blog: "How can App Engine users take advantage of Cloud Functions?"](https://developers.googleblog.com/2022/04/how-can-app-engine-users-take-advantage-of-cloud-functions.html)

**Advantages:**
- Runs serverless containerized code (Docker), not just JavaScript/GAS
- Scales independently, higher concurrency
- Better error reporting and monitoring
- Full Google Cloud integration

**Disadvantages:**
- Requires Google Cloud project (not free; minimal costs but not zero)
- Loses tight integration with Google Sheets/Docs (must use Google APIs explicitly)
- Learning curve for containerization

#### Google Cloud Functions

**Status:** NOT recommended as direct Apps Script replacement  
Source: [Quora: "Is Google Cloud Functions a full alternative?"](https://www.quora.com/Is-Google-Cloud-Functions-a-full-alternative-of-Google-apps-script/)

- Limited overlap with Apps Script
- Apps Script excels at G Suite automation; Cloud Functions does not
- Better for webhooks/event-driven tasks

#### Google Workspace Domain Migration

**Implicit in community reports**  
- Upgrade to Workspace domain → consumer account quotas disappear
- Enables service accounts (can run API under different identity while maintaining Workspace Sheet access)
- More reliable (higher concurrency, higher daily quotas, better support)

### Community-Identified Patterns

**Workaround: Middleware/Proxy Layer**  
Source: [Medium: "Tips on building reliable, secure & scalable architecture"](https://medium.com/google-developer-experts/tips-on-building-a-reliable-secure-scalable-architecture-using-google-apps-script-615afd4d4066)

Recommendation: Do NOT run the API layer directly as Apps Script Web App if scaling needed.
- Use Apps Script for UI/Google Sheets sync only
- Run API layer on Cloud Run or similar
- Apps Script calls backend API (same as your apps/web does now, but orchestrated)

**Lock Service for Concurrency**  
Source: [Official Apps Script documentation](https://developers.google.com/apps-script/guides/services/quotas)

If keeping Apps Script as API layer:
- Use `LockService` to serialize access to shared resources
- Prevents simultaneous writes, but doesn't solve response delivery issues

### Key Takeaway

No "magic solution" exists short of migrating to Workspace or replacing Apps Script API layer with Cloud Run. The single-owner identity constraint + consumer account is an inherent limitation.

---

## Question 6: Script-to-Script UrlFetchApp vs Browser Calls

**Status:** NOT DOCUMENTED by Google; no differentiation found  
**Confidence:** Very Low — Absence of evidence

### Official Guidance

Google's [UrlFetchApp documentation](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app) does NOT differentiate between:
- Script-to-script calls (Apps Script calling Apps Script Web App)
- Browser calls (user's browser calling Apps Script Web App)
- External client calls (Python, curl, etc.)

### What IS Documented

**Scope Requirement:**  
Script-to-script requires `https://www.googleapis.com/auth/script.external_request` scope (authorized by default in Apps Script).

**Redirect Handling:**  
The 302 redirect flow applies universally. Examples in Kanshi Tanaike's documentation use curl and manual requests, suggesting the flow is identical regardless of client origin.

**UrlFetchApp Reliability:**  
- Hard 60-second timeout (cannot change)
- No built-in retry mechanism
- `muteHttpExceptions: true` handles HTTP error responses, not network failures
- Source: [Justin Poehnelt's UrlFetchApp Guide](https://justin.poehnelt.com/posts/definitive-guide-to-urlfetchapp/)

### Implication

If the response delivery issue occurred only for script-to-script calls and not browser calls, that would suggest:
1. A difference in how Google routes requests (unlikely — both should hit same infrastructure)
2. A bug in UrlFetchApp's response handling (not documented)
3. A difference in how the two clients handle 302 redirects

**No evidence supports any of these.** The 302 redirect handling should be identical.

**Key Takeaway:** No official documentation differentiates reliability by client type. The issue likely affects both browser and script-to-script equally, but script-to-script may expose it more obviously because there's no browser-level redirect handling to mask it.

---

## Unresolved Questions

1. **Why does a 30-190 second delay occur between backend completion (confirmed ~2s execution) and response arrival at caller?**
   - Hypothesis: Google Front End (ESF) load-shedding or response replication lag under concurrent load, but NOT documented
   - No Google documentation addresses this specific symptom

2. **Why is the delayed response a bare 404/302 from ESF, not from apps/api's doPost?**
   - Hypothesis: Google's edge layer times out waiting for the response from the backend, returns a generic error instead of proxying the real response
   - Suggests edge infrastructure issue, not Apps Script quota/platform limit

3. **Is there a documented or undocumented difference in reliability for ANYONE_ANONYMOUS vs ANYONE access?**
   - One anecdotal report of ANYONE_ANONYMOUS prompting for login; no systematic comparison
   - Official docs do not address reliability by access control setting

4. **Does the consumer account (personal Gmail) have any undocumented concurrency or response delivery limitations?**
   - Officially: identical to Workspace (30 concurrent per user)
   - Observed: symptoms only on consumer account (not tested on Workspace in production)
   - Workspace upgrade is a valid next diagnostic step

5. **Could this be a known issue fixed in a recent Apps Script platform update?**
   - Research cutoff: February 2025 (Claude knowledge cutoff)
   - Recent community reports from mid-2024 discuss similar symptoms
   - Google Issue Tracker issues exist but require authentication to view full details

---

## Sources Cited

### Official Google Documentation
- [Google Apps Script Quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Google Apps Script Web Apps Guide](https://developers.google.com/apps-script/guides/web)
- [UrlFetchApp Reference](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
- [Apps Script Troubleshooting](https://developers.google.com/apps-script/guides/support/troubleshooting)

### Community Reports & Explainers
- [Kanshi Tanaike: Understanding Flow of Requests to Apps Script Web Apps (Medium)](https://medium.com/google-cloud/understanding-flow-of-request-to-web-apps-created-by-google-apps-script-ac49e80f7c6b)
- [Kanshi Tanaike: GitHub Gist with Request Flow Details](https://gist.github.com/tanaikech/131ba814a1f6012fd6a5ffe11789971f)
- [Google Apps Script Community Forum: Web App Concurrent User Limitations](https://groups.google.com/g/google-apps-script-community/c/qUUGk6G1AnA)
- [Google Apps Script Community Forum: Published Web App Can't Be Reached by Anonymous Users](https://support.google.com/drive/thread/57559393/published-app-script-web-app-can-t-be-reached-by-anonymous-users?hl=en)
- [Google Apps Script Community Forum: 302 Redirect Issues](https://groups.google.com/g/google-apps-script-community/c/QvOdHm06yu4)
- [DEV Community: "You're Probably Using curl Wrong" (redirect handling)](https://dev.to/googleworkspace/youre-probably-using-curl-wrong-with-your-google-apps-script-web-app-1ed8)
- [Spreadsheet.dev: Apps Script Deployed as Web App Returns 404 Error](https://spreadsheet.dev/apps-script-deployed-as-web-app-returns-404-error)
- [Medium: Tips on Building Reliable, Secure & Scalable Architecture](https://medium.com/google-developer-experts/tips-on-building-a-reliable-secure-scalable-architecture-using-google-apps-script-615afd4d4066)
- [DEV Community: Google Apps Script Quota Limits 2026](https://dev.to/stack_c285afb2fa0bef/google-apps-script-quota-limits-2026-every-error-every-fix-2p87)
- [Justin Poehnelt: UrlFetchApp Guide](https://justin.poehnelt.com/posts/definitive-guide-to-urlfetchapp/)

### Google Issue Tracker (authentication required for details)
- [Issue 160622846: Web Apps deployed as "Me" / "Anyone, even anonymous"](https://issuetracker.google.com/issues/160622846)
- [Issue 160665120: Web-app publish issues](https://issuetracker.google.com/issues/160665120)
- [Issue 68670522: Container-bound script is not reachable (404)](https://issuetracker.google.com/issues/68670522)

---

## Recommendation Summary

**For immediate triage:**
1. **Test on Workspace account** in production-equivalent load to rule out consumer-account limitation
2. **Add explicit redirect handling** in apps/web UrlFetchApp call: set `followRedirects: false`, manually extract Location header, verify second request uses GET (not POST)
3. **Monitor ESF error rate** via Google Cloud Logging if enabled, to confirm edge-infrastructure errors

**For longer-term:**
1. Migrate API layer to Cloud Run if scaling beyond current concurrency (decouples from single Apps Script owner identity)
2. Upgrade to Workspace domain if long-term reliance on Apps Script (removes consumer quota constraints)

**Not viable:**
- There is no documented "fix" for ANYONE_ANONYMOUS unreliability — the issue is not confirmed as a known platform limitation
- Retrying at the UrlFetchApp level alone will not solve response delivery delays originating at Google's edge

---

## Extension (2026-09-18, later pass) — tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script Deep Dive

**Research Method:** Fetched and analyzed Kanshi Tanaike's authoritative repository on Apps Script Web Apps, including the README, v1 documentation, GitHub issues, and the linked Gist on request flow mechanics. Tanaike is a well-known Google Apps Script expert and contributor; his work is treated as primary source material on GAS platform behavior.

---

### Q1: Does the repo explain the specific 302-redirects-back-to-the-same-/exec-URL pattern observed in your failures?

**Status:** NOT FOUND — The repo documents the OPPOSITE behavior  
**Confidence:** High — Tanaike's documentation is explicit and detailed

**Finding:**

Tanaike's Gist and v1 README clearly document that the 302 redirect target for Web Apps is **always** `https://script.googleusercontent.com/macros/echo?user_content_key=...`, NOT a redirect back to the `/exec` URL.

Exact quote (Gist):
> "The values, which you want to send to the Web Apps, are required to be included in the 1st request to the Web Apps URL." [Stage 1 returns 302 with Location pointing to the echo URL]

**Critical Detail Tanaike Emphasizes:**
> "in the case of the Web Apps, it is required to request with the GET method to the redirect URL for both `doGet` and `doPost`."

The documentation provides explicit curl examples showing the flow ends at the `echo?user_content_key=...` URL, not redirecting back to `/exec`.

**Implication for Your Symptom:**

The 302 redirects back to the SAME `/exec` URL that you're observing is **not documented as standard behavior by Tanaike**. This suggests:
1. A Google infrastructure anomaly (edge caching returning a stale redirect chain?)
2. Possible interaction with your ANYONE_ANONYMOUS + consumer account combo that Tanaike's documentation doesn't cover
3. The Location header you're receiving is being misinterpreted (though you have concrete logs, so this is less likely)

**Recommendation:** Add explicit logging of the Location header value in `postJsonToApi_()` to confirm whether it's truly pointing back to `/exec` or if there's a parsing issue.

---

### Q2: Does it document reliability issues specific to ANYONE_ANONYMOUS or script-to-script UrlFetchApp calls?

**Status:** NOT DOCUMENTED — ANYONE_ANONYMOUS is mentioned as neutral option, no reliability caveats  
**Confidence:** High — The repo explicitly lists all 5 deployment scenarios without reliability warnings

**Finding:**

Tanaike's v1 README documents all five deployment combinations (based on "Execute as" × "Access level"):
- "Execute as Me + Only myself"
- "Execute as Me + Anyone" (requires access token)
- **"Execute as Me + Anyone, even anonymous"** (no token needed)
- "Execute as User + Only myself"
- "Execute as User + Anyone"

For each scenario, the documentation specifies authorization requirements, but there is **NO mention of ANYONE_ANONYMOUS being less reliable, timing out more frequently, or having edge cases related to response delivery**.

The only "edge case" noted about ANYONE_ANONYMOUS in community reports (cited in original report) was that some users still get prompted for login despite the setting—a **behavioral quirk, not a reliability issue under load**.

**Script-to-Script Reliability:**

The repo provides `UrlFetchApp` examples for calling Web Apps, including:
```javascript
var params = {
  method: "POST",
  payload: { key1: "value1" },
  muteHttpExceptions: true,
};
var res = UrlFetchApp.fetch(url, params);
```

**Critically, there is NO discussion of:**
- Retry logic or exponential backoff
- Idempotency patterns
- Timeout handling (beyond noting the hard 60-second limit)
- Reliability differences between script-to-script vs browser calls
- Any caveats about calling from one Apps Script Web App to another

**Key Finding:**

The repo documents `muteHttpExceptions: true` for handling HTTP error responses (4xx, 5xx), but does NOT discuss how to handle the scenario you're experiencing: "backend completes successfully, but caller's UrlFetchApp call hangs 30-190 seconds then fails."

**Implication:**

The absence of reliability patterns in Tanaike's authoritative guide suggests either:
1. This is a rare edge case (your experience contradicts the assumption that it works reliably)
2. Developers are expected to implement their own retry/reliability layer (which you have, but it causes duplicate execution)
3. The script-to-script call pattern itself may have undocumented failure modes at Google's infrastructure layer

---

### Q3: Does it document a reliable pattern for inter-Apps-Script Web App calls that avoids the 302/redirect issues?

**Status:** NOT DOCUMENTED — Repo focuses on Web Apps only, does not discuss alternatives  
**Confidence:** High — Repo explicitly avoids comparing with Libraries or other approaches

**Finding:**

The repository title and scope is "taking-advantage-of-Web-Apps" — it does not discuss:
- **Google Apps Script Libraries** as an alternative to Web Apps
- **Apps Script API** or how to use it from another Apps Script project
- When to use Libraries vs Web Apps
- How one Apps Script project should call another (besides the obvious: HTTP via Web App)

This is a significant absence: Tanaike, despite his expertise, does not recommend using Libraries instead of Web Apps for inter-script communication. His repo focuses entirely on the Web App pattern.

**Related Finding:**

There is an open GitHub issue (#3) from Feb 2025: **"Post to webapp with service_account still not working :("** — This issue remains unanswered, suggesting that calling Apps Script Web Apps from outside (including from service accounts) is still problematic and not well-solved.

**Implication:**

If Tanaike's repo—the most authoritative public resource on Apps Script Web Apps—does not suggest Libraries as an alternative, it likely means:
1. Libraries are not considered an appropriate substitute for Web Apps in his model (Libraries require project sharing, are less flexible for HTTP endpoints)
2. The Web App pattern is considered the standard way to do inter-script communication, despite its documented limitations

This suggests your **current architecture (two Web Apps calling each other via HTTP) is the "right" pattern according to community consensus**, but reliability is not guaranteed.

---

### Q4: Does it discuss executeAs/access combinations and which are more reliable for server-to-server calls?

**Status:** NOT DISCUSSED — No reliability comparison provided  
**Confidence:** High — Documentation lists all combinations but no reliability guidance

**Finding:**

Tanaike's documentation clearly lists the 5 deployment combinations and their access requirements, but does NOT:
- Rank them by reliability
- Suggest which is best for server-to-server calls
- Warn against any specific combination for high-concurrency or automated scenarios

**What IS Documented:**

Access token requirements:
> "at least one Drive API scope must be included in the access token" (even for non-Drive Web Apps)

This applies to non-anonymous deployments. For ANYONE_ANONYMOUS, no access token is needed.

**Your Current Setup:**
- `apps/api`: "Execute as Me" + "Anyone, even anonymous" — allows unauthenticated calls
- `apps/web`: "Execute as User accessing the web app" + "Anyone" — requires auth tokens for non-owner access

**Key Missing Guidance:**

Tanaike does not state whether "Execute as Me" is more or less reliable under server-to-server load than "Execute as User accessing the web app." The documentation implies both should work the same way from an HTTP perspective.

---

### Q5: Does it discuss retry/idempotency patterns for Web App callers?

**Status:** ABSENT — No retry patterns documented  
**Confidence:** Very High — Explicit search of all documentation sections

**Finding:**

Tanaike's entire documentation makes **zero mention** of:
- Retry logic
- Exponential backoff
- Request deduplication
- Idempotency keys
- How to make duplicate-safe calls to Web Apps

**The Only Reliability Mention:**

One error message is documented: "Service invoked too many times in a short time: exec qps. Try Utilities.sleep(1000) between calls."

This is **not a retry pattern**; it's a request to space out sequential calls to the SAME script (e.g., triggering the same action repeatedly). It does NOT address:
- What to do if a call to a remote Web App fails
- How to safely retry without causing duplicate execution
- How to detect whether a previous request actually succeeded (especially if the response was delayed or lost)

**Implication:**

Tanaike's repo, despite being authoritative, does NOT provide a documented solution to your exact problem: **retrying a failed UrlFetchApp call to another Web App without causing server-side duplicate execution.**

This suggests the problem is:
1. **Not common enough** to be a well-documented pattern in the community
2. **Architectural** — the Web App pattern itself doesn't provide idempotency guarantees at the platform level

---

### Q6: ANYONE_ANONYMOUS platform behavior beyond prior knowledge?

**Status:** MINOR NEW DETAIL  
**Confidence:** Medium — Inferential, not explicitly stated

**Finding:**

Tanaike documents that Web Apps require explicit access token usage in one context:

> "This URL can only be accessed by users who have edit access to the script." (referring to the `/dev` endpoint)

For deployed Web Apps, the `/dev` endpoint (latest code, not versioned) **requires tokens even if the main deployment is ANYONE_ANONYMOUS**.

**New Detail:** The deployment variant (ANYONE_ANONYMOUS vs ANYONE) affects the **main URL** (`/exec`), but the **development URL** (`/dev`) has independent authorization rules. This is not directly relevant to your production issue (you're using `/exec`), but suggests Google's authorization model for Web App URLs is more granular than a simple per-deployment setting.

**Implication:** The fact that authorization is URL-specific (not just deployment-specific) suggests Google's infrastructure does some URL-level routing and filtering, which could theoretically interact with concurrent load in unexpected ways.

---

### Q7: Is the current architecture (two separate Web App deployments) fundamentally wrong?

**Status:** NOT ADDRESSED — Repo does not critique the Web App pattern  
**Confidence:** High — This is an explicit absence; the repo exists to advocate FOR Web Apps

**Finding:**

Tanaike's repository is titled "taking-advantage-of-Web-Apps" — it's designed to show how to leverage Web Apps effectively. It does NOT:
- Critique the Web App pattern
- Suggest when NOT to use Web Apps
- Recommend Libraries as an alternative for inter-script communication
- Suggest any "better" architectural pattern

By omission, this suggests Tanaike considers the Web App pattern **the standard, recommended approach** for inter-script communication, despite its documented limitations.

**Community Consensus (Indirect):**

The fact that issue #3 ("Post to webapp with service_account") remains open and unanswered (Feb 2025) suggests that even the maintainer considers service-account-to-Web-App calls a "nice to have" rather than a core use case. The core pattern is still **human/script-to-Web-App via HTTP**.

**Implication:**

Your architecture is **not wrong by Tanaike's standards**. However, the lack of reliability patterns in his documentation suggests this pattern has **inherent limitations that are accepted as trade-offs** for the benefits of HTTP-accessible endpoints.

---

## Updated Unresolved Questions

*Previous questions remain unresolved; these are NEW questions arising from the Tanaike repo review:*

6. **Why does Tanaike's documentation specify that the 302 redirect target is always `script.googleusercontent.com/macros/echo`, but you're observing redirects back to the same `/exec` URL?**
   - Hypothesis: Redirect chain loop or edge caching anomaly specific to your deployment
   - Action: Log the actual Location header value to verify

7. **If Tanaike doesn't document retry/idempotency patterns, how do developers safely retry failed Web App calls without duplicate execution?**
   - His documentation explicitly avoids this topic, suggesting either it's not a solved problem, or each developer is expected to implement their own solution
   - Your current implementation (retry on response body mismatch) is ad-hoc; Tanaike provides no guidance on idempotent patterns

8. **Is the service account + Web App limitation (issue #3, unresolved) related to your ANYONE_ANONYMOUS + consumer account reliability issues?**
   - The open issue suggests there's a class of authentication/authorization problems with Apps Script Web Apps that remain unresolved at the platform level

---

## Updated Sources Cited

**From tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script:**

- **Repository Main README:** [github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script)
- **v1/README.md:** Comprehensive guide to Web Apps deployment scenarios, access control, CORS handling, concurrency limits, and implementation examples
- **Gist on Request Flow:** [gist.github.com/tanaikech/131ba814a1f6012fd6a5ffe11789971f](https://gist.github.com/tanaikech/131ba814a1f6012fd6a5ffe11789971f) — Explicit documentation that 302 redirects target `script.googleusercontent.com/macros/echo`, and that POST requests must use GET on the redirect
- **GitHub Issue #3:** ["Post to webapp with service_account still not working :("](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/issues/3) — Open since Feb 2025, indicates service account calls to Web Apps are not reliable/documented

**Key Insight from Tanaike's Work:**

The absence of reliability/retry patterns in Tanaike's authoritative documentation suggests this is either a **rare problem** (your experience contradicts the assumption), or **an accepted trade-off** in the Web App pattern that developers are expected to handle themselves.
