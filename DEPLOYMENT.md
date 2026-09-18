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

There's no sign-up page (by design — order-entry accounts shouldn't be self-service). The only
way to create accounts right now is the seed script, which creates demo accounts with a
**publicly documented password** (`ChangeMe123!`, visible in this repo's `README.md`). That's
fine to run once to confirm the deployment works, but:

- **Do not leave the demo accounts active with real client data reachable.** Either change
  their passwords immediately after confirming the deploy works, deactivate them
  (`isActive: false` in the database), or delete them.
- Real user creation currently means running `server/src/seed.ts`-style logic yourself (or
  writing an admin "create user" endpoint, which doesn't exist yet) with real emails and
  strong, unique passwords.

To run the seed script against the deployed database, use Railway's **"Run a command"** /
shell feature on the app service (exact label may vary by Railway's current UI) with:

```
npm run seed --workspace=server
```

## Local development still works the same way

Local dev now needs a local Postgres instead of the SQLite file it used before — see
`server/.env.example` for a one-line `docker run` command if you don't want to install Postgres
directly. Everything else in `README.md`'s Quick Start is unchanged.
