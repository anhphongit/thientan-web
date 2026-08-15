# AGENTS.md — Project Context for AI Agents

**Project:** THIENTAN — Local Order & Inventory Management Website
**Status:** Initialized (scaffold only — **no implementation yet**)
**Last updated:** 2026-08-15

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

**Option C — Google Apps Script + private Google Sheets.**

```
Browser (PC / mobile)
    ↓  Google account login
Apps Script Web App   (Execute as: Me)
    ↓  permission check: email → Users sheet
Private Google Sheets (Restricted sharing)
```

- No local server, no local JSON, no database.
- Google handles **authentication**. Apps Script handles **authorization**.
- Option B (local Node/Python server) is documented but **must not be implemented**
  unless Phong explicitly switches.

---

## 3. Non-negotiable security rules

1. Google Sheets sharing stays **Restricted**. Never "Anyone with the link".
2. Web app deployment: **Execute as: Me** / **Who has access: Anyone with a Google account**.
3. The frontend must never contain Sheet IDs, keys, or raw data-access logic.
   Sheet IDs live in Script Properties, read server-side only.
4. **Every** server-side entry point begins with:
   ```
   const user = getCurrentUser();          // Session.getActiveUser().getEmail() → Users sheet
   requirePermission(user, 'edit_order');  // throws if not allowed
   ```
   No exceptions. A function that returns or mutates data without this is a bug.
5. Permission checks are **never** client-side only. The client hides buttons for UX;
   the server decides.
6. Employees never get direct access to the underlying Sheets.
7. Default visibility rule: a user sees only orders they created, unless they hold
   `view_all_orders`.

---

## 4. Repository layout

```
THIENTAN/
├── AGENTS.md                          ← you are here
├── README.md                          ← human quickstart
├── PROJECT_INSTRUCTION.md             ← requirements (authoritative)
├── DETAILED_PLANS_OPTION_B_AND_C.md   ← architecture options
├── FILE THEO DOI DON HANG.xlsx        ← REFERENCE ONLY, never imported
├── .clasp.json.example                ← copy to .clasp.json, fill scriptId
├── .claspignore / .gitignore
├── src/
│   ├── appsscript.json                ← Apps Script manifest
│   ├── server/                        ← .gs files (stubs, comment-only today)
│   └── ui/                            ← .html files (stubs, comment-only today)
└── docs/
    ├── DATA_MODEL.md        sheet schemas + field types + ID rules
    ├── PERMISSIONS.md       the permission matrix and how it is enforced
    ├── EXCEL_REFERENCE.md   what the current Excel actually looks like
    ├── GLOSSARY_VI.md       Vietnamese UI wording (use these exact strings)
    ├── CONVENTIONS.md       code style, naming, error handling
    ├── SETUP.md             clasp + Apps Script + Sheets setup steps
    ├── MILESTONES.md        6 milestones, exit criteria, test checklists
    └── OPEN_QUESTIONS.md    unresolved decisions — ask before guessing
```

`src/server/*.gs` and `src/ui/*.html` currently contain **only header comments**
describing their intended responsibility. That is deliberate: this repo is
initialized, not implemented.

---

## 5. Server file responsibilities

| File | Responsibility |
|------|----------------|
| `server/Main.gs` | `doGet(e)` entry point, HTML service routing, `include()` helper |
| `server/Auth.gs` | `getCurrentUser()` — active email → Users row → permissions object |
| `server/Permissions.gs` | `hasPermission()`, `requirePermission()`, field-level filtering |
| `server/SheetsRepo.gs` | The **only** file that touches `SpreadsheetApp`. Generic read/write/append/find |
| `server/Orders.gs` | Order + OrderLine CRUD, status changes, own-orders filter |
| `server/Inventory.gs` | Product / stock CRUD |
| `server/Stats.gs` | Revenue aggregation by week / month / quarter / year |
| `server/Export.gs` | Build export payloads (CSV / XLSX / PDF) |
| `server/Admin.gs` | User management + permission matrix editing + backup helper |
| `server/Config.gs` | Sheet names, column maps, status list, Script Property keys |

Rule: business logic never calls `SpreadsheetApp` directly — it goes through
`SheetsRepo.gs`. This keeps permission enforcement and column mapping in one place.

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
- Prefer simple, readable code. YAGNI / KISS. No clever abstractions.
- If a requirement is missing or ambiguous, check `docs/OPEN_QUESTIONS.md` first,
  then **ask Phong** — do not guess and do not silently invent business rules.
- The Excel file is **reference material only**. Real data will be entered by the
  Admin and users through the app. Never write an importer unless asked.
- Never commit `.clasp.json`, Sheet IDs, or any real customer data to the repo.

---

## 8. Current state

Nothing is implemented. The next action is **Milestone 1 — Foundation**
(see `docs/MILESTONES.md`), which requires `docs/SETUP.md` to be completed by
Phong first (Apps Script project + Sheets created, IDs stored in Script Properties).
