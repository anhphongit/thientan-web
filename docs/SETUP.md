# Setup

One-time setup, done by Phong (the owner account). Nothing here is automated yet —
this is the checklist that must be finished before Milestone 1 can start.

Yes — **clasp** is Google's official CLI for Apps Script. It lets you keep the code
in this folder (and in git), then push it into the Apps Script project.

---

## 1. Google account

Use **one owner account** for everything: it owns the Spreadsheet, the Apps Script
project, and the deployment. Employees only ever get the web app URL.

---

## 2. Create the Spreadsheet

1. Create a new Google Spreadsheet, name it e.g. `THIENTAN - Dữ liệu`.
2. Create six tabs, exactly these names:
   `Users`, `Orders`, `OrderLines`, `Products`, `StatusHistory`, `Config`.
3. Add the header rows from [`DATA_MODEL.md`](DATA_MODEL.md) to row 1 of each tab.
4. **Sharing → Restricted.** Do not add employees. Do not use "Anyone with the link".
5. Copy the Spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`

Add yourself as the first user in the `Users` tab, with `active = TRUE` and a
permissions JSON that has every permission `true` (see `PERMISSIONS.md`).

---

## 3. Create the Apps Script project

1. Go to <https://script.google.com> → **New project**. Name it `THIENTAN`.
2. **Project Settings** → tick *"Show appsscript.json manifest file in editor"*.
3. **Project Settings → Script Properties** → add:

   | Property | Value |
   |----------|-------|
   | `SPREADSHEET_ID` | the ID from step 2 |
   | `ORDER_SEQ_YEAR` | `2026` |
   | `ORDER_SEQ_NEXT` | `1` |

   The Spreadsheet ID lives **only** here. Never in code, never in the frontend.
4. Copy the **Script ID** from Project Settings.

---

## 4. Install and connect clasp

```bash
# Node 18+ required
npm install -g @google/clasp

# log in with the owner Google account
clasp login

# in this folder:
cp .clasp.json.example .clasp.json
# then edit .clasp.json and paste the Script ID
```

Check the connection:

```bash
clasp status     # lists which files would be pushed
clasp push       # uploads src/ into the Apps Script project
clasp open       # opens the project in the browser
```

`rootDir` is `src`, so `src/server/Auth.gs` appears in the editor as `server/Auth`.

> If `clasp login` fails, enable the Apps Script API for your account at
> <https://script.google.com/home/usersettings>.

---

## 5. Deploy the web app

In the Apps Script editor: **Deploy → New deployment → Web app**

| Setting | Value |
|---------|-------|
| Execute as | **Me** (the owner account) |
| Who has access | **Anyone with a Google account** |

Copy the `/exec` URL — that is what employees open. Share it directly with them;
it is not a public page, they must sign in with a Google account that exists in the
`Users` sheet.

> ⚠️ Every code change needs **Deploy → Manage deployments → Edit → New version**
> before users see it. The `/dev` URL updates instantly but only works for the owner.

---

## 6. Verify before starting Milestone 1

- [ ] Spreadsheet exists with 6 correctly-named tabs and header rows
- [ ] Spreadsheet sharing is **Restricted**
- [ ] Owner is in the `Users` sheet with all permissions and `active = TRUE`
- [ ] `SPREADSHEET_ID` is in Script Properties
- [ ] `clasp push` works from this folder
- [ ] Web app deployed as *Execute as: Me* / *Anyone with a Google account*
- [ ] `.clasp.json` is git-ignored (it is, by default — do not remove that rule)

---

## 7. Daily workflow after setup

```bash
# edit files locally in this folder
clasp push          # push to Apps Script
# test on the /dev URL
# when a milestone is done: Deploy → Manage deployments → New version
```

Optional, but useful: `git init` in this folder so every milestone is a commit and
you can roll back.
