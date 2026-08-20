# Offline tests

Apps Script has no test framework, and these files are not one either. They load
the **real** `apps/api/Config.gs`, `Permissions.gs` and `Orders.gs` into a Node VM
with an in-memory spreadsheet that reproduces the Sheets semantics that matter:
1-based rows, and rows shifting up when one is deleted.

They cover the logic that is expensive to test by hand — VAT and total
arithmetic, line reconciliation on edit, id allocation, ownership scoping,
field filtering, and the validation messages.

They are **not** a substitute for the Vietnamese checklist in
`docs/MILESTONES.md`: nothing here proves that a real employee can save an order
from a real phone.

`orders-ui.test.js` does the same for `ui/ViewsOrders.html`: it runs the view
against a DOM stub and checks the HTML it produces is balanced, escaped, and
still contains the controls the checklist asks for. It proves the markup is
sane, not that the screen is usable — that is what a real phone is for.

```bash
node tools/offline-tests/orders-crud.test.js
node tools/offline-tests/orders-permissions.test.js
node tools/offline-tests/orders-ui.test.js
```

Exit code is non-zero if anything fails. Nothing in this folder is pushed by
clasp — each app's `rootDir` is its own directory.
