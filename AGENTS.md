# AGENTS.md — Project Context for AI Agents

**Project:** THIENTAN — Local Order & Inventory Management Website
**Status:** Milestones 0–1 signed off. Milestone 2 (order CRUD) built, awaiting live test.
**Last updated:** 2026-08-20

Read this file first. Then read `PROJECT_INSTRUCTION.md` (requirements, authoritative)
and `DETAILED_PLANS_OPTION_B_AND_C.md` (architecture alternatives).

---

## 1. What this project is

An internal web tool for a small Vietnamese business (1 Admin + 5–6 employees,
≤ 100 orders/month) to manage **orders**, **inventory**, **revenue statistics**,
and **exports** (CSV / XLSX / PDF), with a fine-grained per-user permission matrix.

It is **not** a public website. All UI text is **Vietnamese**.

---

## 2. Architecture — decided, do not re-open

**Option C data model, Option B deployment.** Two Apps Script projects:

```
Employee browser
   │  signs in + authorizes (once)
   ▼
THIENTAN-WEB   Execute as: USER ACCESSING   ← Session.getActiveUser() works here
   │  POST { secret, actor, action, payload }
   ▼
THIENTAN-API   Execute as: ME               ← opens the Restricted spreadsheet
   ▼
Private Google Sheets
```

Google will not give one deployment both visitor identity and private Sheet
access. The split is the whole point — do not merge the projects back together.
See `docs/IDENTITY.md`.

The `actor` email is trusted by the API **only** because the shared secret proves
the call came from THIENTAN-WEB, which read it from its own Session. A browser
never supplies its own identity.

---

## 3. Non-negotiable security rules

1. Google Sheets sharing stays **Restricted**. Never "Anyone with the link".
2. Web app deployment: **Execute as: Me** / **Who has access: Anyone with a Google account**.
   Switching to *Execute as: User accessing* does not merely break — it inverts the
   security model, because every employee would then need direct Sheet access and
   could bypass all permission checks. `getSpreadsheet_()` detects this and raises
   a Vietnamese message naming the setting.
3. The frontend must never contain Sheet IDs, keys, or raw data-access logic.
   Sheet IDs live in Script Properties, read server-side only.
4. **Every** server-side entry point begins with:
   ```
   const user = getCurrentUser_();          // Google identity → Users sheet
   requirePermission_(user, 'edit_order');  // throws if not allowed
   ```
   Every server function also ends in `_` so it is not reachable from
   `google.script.run`. Only `doGet`, `api*` and `setupMilestone1` may omit it —
   see `docs/CONVENTIONS.md`. This is not style; without it, any signed-in
   employee can call `readAll_('Users')` from the browser console.
   No exceptions. A function that returns or mutates data without this is a bug.
5. Permission checks are **never** client-side only. The client hides buttons for UX;
   the server decides.
6. Employees never get direct access to the underlying Sheets.
7. The API is anonymous-access, so the shared secret is the only thing between
   the internet and the data — and because the caller asserts `actor`, a leaked
   secret means impersonation of anyone, admin included. Rotation and revocation
   bound the damage; they do not remove it. Read `docs/SECURITY.md` before
   touching `Router.gs` or `Security.gs`.
8. `doPost` runs three guards in a fixed order: secret → security gate → actor
   and permission. Never reorder them, and never look up the action before the
   gate — a locked system must not reveal which actions exist.
7. Default visibility rule: a user sees only orders they created, unless they hold
   `view_all_orders`.

---

## 4. Repository layout

```
THIENTAN/
├── AGENTS.md · README.md · PROJECT_INSTRUCTION.md · DETAILED_PLANS_OPTION_B_AND_C.md
├── FILE THEO DOI DON HANG.xlsx        ← REFERENCE ONLY, never imported
├── apps/
│   ├── api/          THIENTAN-API — Execute as: Me. All data access.
│   │   ├── appsscript.json  Config.gs  SheetsRepo.gs  Auth.gs
│   │   ├── Permissions.gs   Router.gs  Setup.gs  Orders.gs
│   └── web/          THIENTAN-WEB — Execute as: User accessing. Knows the visitor.
│       ├── appsscript.json  Config.gs  Auth.gs  ApiClient.gs  Main.gs
│       └── ui/       Index · Styles · App · Views*
└── docs/
    ├── SETUP.md            ordered setup checklist — start here
    ├── SECURITY.md         threat model, limits, rotation runbook
    ├── IDENTITY.md         why there are two projects
    ├── DATA_MODEL.md · PERMISSIONS.md · EXCEL_REFERENCE.md
    ├── GLOSSARY_VI.md · CONVENTIONS.md · MILESTONES.md · OPEN_QUESTIONS.md
    ├── TASKS.md            milestone split into per-conversation tasks — read with MILESTONES.md
    └── CHECKLIST_M2_VI.md  Vietnamese acceptance checklist for Milestone 2
```

Each app is its own clasp project with its own `.clasp.json` and `rootDir: "."`.
Run clasp from **inside** `apps/api` or `apps/web`.

**Milestones 1 and 2 are implemented.** Milestone 1: `Config.gs`, `SheetsRepo.gs`,
`Auth.gs`, `Permissions.gs`, `Main.gs`, `Setup.gs`, UI shell. Milestone 2:
`apps/api/Orders.gs`, `setupMilestone2()`, and `apps/web/ui/ViewsOrders.html`.
`ViewsStats`, `ViewsInventory` and `ViewsAdmin` are still comment-only stubs.

---

## 5. File responsibilities

**apps/api** (runs as you)

| File | Responsibility |
|------|----------------|
| `Config.gs` | Sheet names, headers, permission vocabulary, Vietnamese messages, `BUILD` |
| `SheetsRepo.gs` | The **only** file touching `SpreadsheetApp`. `readAll_`, `findBy_`, `appendRecord_`, `updateRecord_`, `deleteRecord_` |
| `Auth.gs` | `loadUser_(email)` — actor email → Users row → permissions |
| `Permissions.gs` | `hasPermission_`, `requirePermission_`, ownership, field filtering |
| `Router.gs` | `doPost`, three guards in order, action registry, `readPublicConfig_` |
| `Security.gs` | Gate, fingerprint, rotate/revoke, audit log, expiry reminder |
| `Orders.gs` | Order CRUD, line reconciliation, VAT + totals, id allocation, invoice upsert |
| `Setup.gs` | `setupMilestone1()` / `setupMilestone2()` bootstrap |

**apps/web** (runs as the employee)

| File | Responsibility |
|------|----------------|
| `Config.gs` | `API_URL` / `SHARED_SECRET` / `DEV_MODE` keys, web-layer messages, `BUILD` |
| `Auth.gs` | `resolveActiveEmail_()` — the ONE place identity is read |
| `ApiClient.gs` | `apiCall_(action, payload)` — the only file that talks to the API |
| `Main.gs` | `doGet`, `apiGetSession`, build stamp, account links |
| `ui/*.html` | Vietnamese responsive shell; `ViewsOrders.html` owns the order screens |

A view file registers itself on `window` (`TTOrders`) and is routed to by
`VIEW_MODULES` in `App.html`. It talks to the server only through `window.TT`.

Rules:
- Business logic never calls `SpreadsheetApp` directly — always via `SheetsRepo.gs`.
- The **web** project must never gain a spreadsheet scope; adding one would change
  what employees consent to and defeat the split.
- The **api** project must never gain the `userinfo.email` scope. Without it every
  `Session.*` call there throws, which is exactly what we want: the API runs as the
  owner for everyone, so any identity it could read would be the owner's. Where
  setup needs an address, it reads the `ADMIN_EMAIL` script property.
  `setupMilestone1()` reports on this every time it runs.

Quick audit:
```bash
grep -n 'Session\.' apps/api/*.gs      # only the checkNoSessionUse_ probe should appear
grep -n 'spreadsheets' apps/web/appsscript.json   # must return nothing
```

---

## 6. Frontend conventions

- Apps Script **HTML Service**, single-page, `google.script.run` for all server calls.
- Vanilla JS. Chart.js via CDN for charts. No framework, no build step.
- Mobile-first responsive CSS. The Admin uses a PC; employees often use phones.
- All user-facing strings come from `docs/GLOSSARY_VI.md` — do not invent new
  Vietnamese wording ad hoc, and never ship English labels.
- Money is displayed as VND with thousand separators, no decimals (e.g. `11.949.000 ₫`).
- Dates display as `dd/MM/yyyy`.

---

## 7. How to behave on this project

- `PROJECT_INSTRUCTION.md` + `DETAILED_PLANS_OPTION_B_AND_C.md` + this file are
  the source of truth. Do not re-open settled decisions.
- Work **one milestone at a time** (`docs/MILESTONES.md`). After each milestone,
  produce a short Vietnamese-testable checklist so Phong can verify on real devices.

### Never build a whole milestone in one conversation

**Rule set by Phong on 2026-08-20. It applies to every agent, every milestone.**

A milestone built in a single sitting is hard to test, hard to review, and any
mistake inside it is expensive to find. So:

1. When a milestone starts, **split it into small tasks first** and write them into
   [`docs/TASKS.md`](docs/TASKS.md). Do not write feature code in that same
   conversation beyond what the split needs.
2. Each task must be small enough to finish, test and verify on its own — roughly
   one file or one behaviour, with its own way of being checked.
3. Then **stop and wait.** Phong says which task to do next, one per conversation.
   Do not run ahead into the next task because it looks easy or related.
4. At the end of a task: update its status in `docs/TASKS.md`, say plainly what can
   now be tested, and stop.
5. If a task turns out to be bigger than it looked, do not push through — split it
   again in `docs/TASKS.md` and ask which half to do.

Exception: a task that is meaningless alone (a constant its only consumer needs)
may be folded into the task that uses it. Say so when you do.
- Prefer simple, readable code. YAGNI / KISS. No clever abstractions.
- If a requirement is missing or ambiguous, check `docs/OPEN_QUESTIONS.md` first,
  then **ask Phong** — do not guess and do not silently invent business rules.
- The Excel file is **reference material only**. Real data will be entered by the
  Admin and users through the app. Never write an importer unless asked.
- Never commit `.clasp.json`, Sheet IDs, or any real customer data to the repo.

---

## 8. Identity: the open problem — read `docs/IDENTITY.md`

In an **Execute as: Me** deployment, `Session.getActiveUser().getEmail()` is often
an **empty string** for personal Gmail visitors. That is a real constraint with no
clean workaround, and it is currently **unresolved**.

**Never** paper over it with `ScriptApp.getIdentityToken()`. That token describes
the *effective* user — the owner — so it authenticates every visitor as the admin.
That bug shipped on 2026-08-15 and was caught in testing on 2026-08-17.

The rule: identity must **fail closed**. If we cannot prove who someone is, they
get nothing. An auth fallback that guesses wrong in the permissive direction is
worse than no fallback.

---

## 9. Current state

Milestones 0 and 1 are **signed off** (verified live 2026-08-18).

Milestone 2 is **written and offline-tested, not yet verified live**. Next action:
push `apps/api`, publish a new API version, run `setupMilestone2()` from the API
editor, push `apps/web`, publish, then work through the Milestone 2 checklist in
`docs/MILESTONES.md` — with two accounts, one of them on a phone.

The order schema is settled: Q1, Q3, Q4 and Q6 were answered on 2026-08-20 and are
recorded in `docs/OPEN_QUESTIONS.md`. **Do not reopen them**, and in particular do
not reintroduce `orderNo` / `customerPo` (Q3) or an order-level `invoiceNo` (Q4).

`Products` is still deliberately absent — it belongs to Milestone 5.
