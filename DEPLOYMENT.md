# Deploying to Railway

This gets you a real, public URL for the app — no local installs needed to use it once it's
deployed. It runs as a single Railway service (the Express API also serves the built React
app) plus a managed Postgres database.

**Before doing this for real client use**, read `COMPLIANCE.md` — specifically the licensing
note at the top. This walkthrough gets the software running; it doesn't address whether your
firm is licensed to operate it.

## 1. Create the project

In the Railway dashboard: **New Project → Deploy from GitHub repo**. If prompted, connect your
GitHub account. Select `Kristina-Git/Kristina-Git`, and when asked for a branch, choose
`claude/trade-order-system-audit-qbi2w9` (or whichever branch has since become the default).

Railway will detect `railway.json` at the repo root and use it to build and start the app —
you shouldn't need to configure build/start commands manually.

## 2. Add a Postgres database

In the same project: **New → Database → Add PostgreSQL**. Railway provisions it and exposes a
connection string as a variable on that database service — you never type a password in
yourself.

## 3. Wire the database to the app

Click your **app service** (not the Postgres one) → **Variables** tab → add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Reference the Postgres service's connection variable (Railway offers this as an autocomplete/reference when you start typing — look for something like `${{Postgres.DATABASE_URL}}`) rather than pasting a literal string. |
| `JWT_SECRET` | A long random string (40+ characters). This signs login sessions — treat it like a password. |
| `COMPLIANCE_APPROVAL_THRESHOLD` | `100000` (or your firm's actual threshold — see `COMPLIANCE.md` §3) |

## 4. Deploy

Trigger a deploy (Railway usually does this automatically after step 1, and again whenever you
push to the branch). Build runs `npm install && npm run build` (builds both the client and
server); on boot it runs `npx prisma migrate deploy` (applies the database schema) and then
starts the server.

## 5. Get a public URL

By default a new Railway service isn't exposed to the internet. Under the app service →
**Settings → Networking**, generate a domain (Railway gives you a free `*.up.railway.app`
subdomain, or you can attach your own). That URL is what you open in a browser — the same app,
same login page, running for real instead of in a screenshot.

## 6. Create your first users

**Dealer/compliance/admin accounts** still need to go through the seed script, or you add them
by hand for now (there's no "create staff account" UI yet — only client accounts have one).
Run the seed script once via Railway's **"Run a command"** / shell feature on the app service
(exact label may vary by Railway's current UI):

```
npm run seed --workspace=server
```

This creates demo accounts with a **publicly documented password** (`ChangeMe123!`, visible in
this repo's `README.md`) — fine to confirm the deployment works, but:

- **Do not leave the demo accounts active with real client data reachable.** Change their
  passwords, deactivate them (`isActive: false`), or delete them once you've set up real staff
  accounts.

**Client accounts** have a real onboarding flow: once logged in as a dealer/compliance/admin,
use the **"Clients"** page to create accounts one at a time or in bulk (paste a spreadsheet).
See `README.md`'s "Client onboarding" section for details. Each new client gets a one-time
invite link to set their own password — no passwords are ever emailed, even temporary ones.

To have those invites emailed automatically instead of just shown in the UI for manual
sharing, add SMTP variables to the app service (any provider works — Gmail app password,
SendGrid, Postmark, Resend, etc.):

| Variable | Value |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.sendgrid.net` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | your SMTP username/API key identifier |
| `SMTP_PASS` | your SMTP password/API key |
| `SMTP_FROM` | e.g. `Cayman Trade Order System <no-reply@yourdomain.com>` |

Without these, nothing breaks — invite links are just shown in the UI instead of auto-emailed.

## Local development still works the same way

Local dev now needs a local Postgres instead of the SQLite file it used before — see
`server/.env.example` for a one-line `docker run` command if you don't want to install Postgres
directly. Everything else in `README.md`'s Quick Start is unchanged.
