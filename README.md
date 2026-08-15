# THIENTAN — Quản lý Đơn hàng & Tồn kho

Internal web tool for managing orders, inventory and revenue statistics for a small
Vietnamese business. Built on **Google Apps Script + private Google Sheets**.

- Users: 1 Admin + 5–6 employees
- Volume: ≤ 100 orders / month
- UI language: Vietnamese
- Works on PC and mobile browsers

---

## Status

**Initialized — no code written yet.**

This repository currently contains project context, documentation, and an empty
scaffold. Implementation starts at Milestone 1.

---

## Getting started

1. Read [`docs/SETUP.md`](docs/SETUP.md) — create the Google Sheets, the Apps Script
   project, and install `clasp`.
2. Read [`AGENTS.md`](AGENTS.md) — architecture, security rules, file map.
3. Follow [`docs/MILESTONES.md`](docs/MILESTONES.md) — build one milestone at a time.

## Documentation map

| Document | What's in it |
|----------|--------------|
| [`PROJECT_INSTRUCTION.md`](PROJECT_INSTRUCTION.md) | Requirements — the source of truth |
| [`DETAILED_PLANS_OPTION_B_AND_C.md`](DETAILED_PLANS_OPTION_B_AND_C.md) | Architecture options (C is chosen) |
| [`AGENTS.md`](AGENTS.md) | Context for AI agents working on this repo |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Sheet schemas, field types, ID rules |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) | Permission matrix and enforcement |
| [`docs/EXCEL_REFERENCE.md`](docs/EXCEL_REFERENCE.md) | How the business tracks orders today |
| [`docs/GLOSSARY_VI.md`](docs/GLOSSARY_VI.md) | Vietnamese UI wording |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Code style and patterns |
| [`docs/SETUP.md`](docs/SETUP.md) | One-time setup steps |
| [`docs/MILESTONES.md`](docs/MILESTONES.md) | Build plan with exit criteria |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Decisions still needed from Phong |

## Reference data

`FILE THEO DOI DON HANG.xlsx` is the spreadsheet the business uses today. It is kept
here **for reference only** — to shape the data model and to make exports feel
familiar. It is never imported. Live data is entered through the app.
