# Security model

Written 2026-08-18, after the question: *"could anyone call the API POST method
directly?"* — **yes, they can.** This document is the honest answer, the limits,
and the runbook.

---

## 1. What actually protects the data

```
anyone on the internet
      │  POST {secret, actor, action, payload}
      ▼
Guard 1  shared secret        ← proves the caller is THIENTAN-WEB
Guard 2  security gate        ← is that secret still blessed & unexpired?
Guard 3  actor + permissions  ← who are they, may they do this?
      ▼
Private spreadsheet
```

The API is deployed with **anonymous access**, so the URL is reachable by
anybody. Guard 1 is what stops them.

## 2. The limitation, stated plainly

**A leaked email is harmless. A leaked secret is total compromise.**

Because the caller asserts `actor`, anyone holding the secret can impersonate
*any* row in the `Users` sheet — including the admin — and read or change
everything.

No amount of rotation fixes this. Whatever the web app computes to authenticate
itself, an attacker with the same secret computes too. Signing the payload,
adding a nonce, hashing the actor: all of it is derived from the one secret, so
none of it adds a factor the attacker lacks.

Removing this weakness entirely means a different architecture — per-user OAuth
token verification (`IDENTITY.md` Option A) or Google Workspace (Option C).

**What Guard 2 buys is bounding the damage:**

| | Effect |
|---|---|
| Expiry (`rotationDays`, default 30) | a stolen secret dies on its own |
| Revocation via the sheet | the admin kills every session in seconds, from a phone |
| Fingerprint check | a secret that was never blessed is refused |
| `SecurityLog` | abuse becomes visible instead of silent |

That is defence in depth, not a fix. Treat the secret like a password.

## 3. Where the state lives, and why

The `Security` **sheet** — not Script Properties:

| key | meaning |
|-----|---------|
| `status` | `active`, or `revoked` to lock everything immediately |
| `secretFingerprint` | 12 chars of SHA-256 of the blessed secret. Written by `rotateSecret()`, never by hand |
| `rotatedAt` | last rotation date |
| `expiresAt` | after this date, all access denied |
| `rotationDays` | validity window, default 30 |
| `warnDays` | start nagging the admin this many days before expiry, default 7 |

A sheet, because **revocation must work from the Google Sheets app on a phone**,
with no laptop and no Apps Script editor. That is the emergency path.

The gate is **never cached** — a TTL would delay revocation, defeating the point.

## 4. Runbook

### Routine rotation (monthly)

```bash
openssl rand -base64 32
```

1. Paste the new value into `SHARED_SECRET` on **both** projects (API and WEB).
2. Open the **API** project → run `rotateSecret`.

Rotation happens in the editor, never through the web app: no secret ever passes
through a browser, and an expired system can still be repaired.

Between step 1 and step 2 the gate reports `mismatch` and access is denied — a
window of seconds. Do them together.

### Emergency: revoke now

Open the `Security` sheet, set `status` = `revoked`. Every request is refused on
the next call. No deploy, no editor, works from a phone.

To restore: set a fresh secret in both projects, then run `rotateSecret` (which
also flips `status` back to `active`).

### Check state at any time

Run `securityStatus` in the API editor. Prints state, dates, days remaining, and
the action needed if unhealthy.

### Expiry email (optional)

Run `installExpiryReminder` once. A daily 08:00 check emails `ADMIN_EMAIL` when
the key is inside the warning window or expired, and stays silent otherwise.

## 5. What each party sees when locked

| | Sees |
|---|---|
| Employee | *"Hệ thống đang tạm khoá để bảo mật. Vui lòng liên hệ quản trị viên."* — state only, no dates |
| Admin | The specific cause, plus a **Cách đổi khoá** dialog with the three steps |

`getSession` deliberately still answers while locked, so the app can explain
itself rather than look broken. Every other action is refused — including
unknown ones, which return the same "locked" message so a locked system does not
reveal which actions exist.

While healthy but inside `warnDays`, admins see an amber banner; employees see
nothing, because there is nothing they can do.

## 6. Audit log

`SecurityLog` records `bad_secret`, `unknown_action`, `gate_*`,
`secret_rotated`, `secret_revoked`.

Writes are throttled to one per event type per minute and the sheet is trimmed to
500 rows. Without that, the anonymous endpoint would let anyone flood the sheet
and burn the daily write quota — turning logging into a denial-of-service lever.

Check it after anything odd. Repeated `bad_secret` entries mean someone knows the
URL and is guessing.

## 7. Standing rules

1. Never commit the secret. Not in code, not in the repo, not in a screenshot.
2. Never send the secret over chat or email. Type it into both Script Properties.
3. Rotate monthly. The banner and the email exist so nobody has to remember.
4. Never expose a maintenance function through `getActions_()` — `guardSetup_()`
   asserts this and `setupMilestone1` fails loudly if it is ever violated.
5. If the secret may have leaked: revoke first, ask questions after. It costs
   minutes of downtime.
