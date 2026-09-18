# Cayman Trade Order System

A trade order management platform where clients submit trade orders, dealers and compliance
officers action them through a segregated-duties workflow, and every action is recorded in an
immutable, tamper-evident audit trail. It's designed around the regulatory themes CIMA
(Cayman Islands Monetary Authority) applies to licensed securities investment business —
see [`COMPLIANCE.md`](./COMPLIANCE.md) for the mapping and important legal caveats.

## Stack

- **Server**: Node.js, TypeScript, Express, Prisma ORM, SQLite (swap to PostgreSQL for
  production by changing one line in `server/prisma/schema.prisma`), JWT auth, zod validation,
  TOTP-based MFA (`otplib` + `qrcode`).
- **Client**: React 18, TypeScript, Vite, React Router.
- **Tests**: Vitest + Supertest (order lifecycle, RBAC, audit chain integrity, MFA flow).

## Project layout

```
server/   Express API, Prisma schema/migrations, business logic, tests
client/   React single-page app (client / dealer / compliance dashboards)
```

## Quick start

```bash
npm install                      # installs both workspaces

cd server
cp .env.example .env
npx prisma migrate deploy        # creates prisma/dev.db and applies migrations
npm run seed                     # seeds demo users (see below)
npm run dev                      # http://localhost:4000

# in a second terminal
cd client
npm run dev                      # http://localhost:5173 (proxies /api -> :4000)
```

### Demo accounts

All seeded with password `ChangeMe123!`:

| Email                              | Role               |
| ----------------------------------- | ------------------ |
| `client1@caymantrade.example`       | Client              |
| `client2@caymantrade.example`       | Client              |
| `dealer@caymantrade.example`        | Dealer              |
| `dealer2@caymantrade.example`       | Dealer              |
| `compliance@caymantrade.example`    | Compliance Officer  |
| `admin@caymantrade.example`         | Admin               |

### Running tests

```bash
cd server
npm test
```

Tests cover: the full order lifecycle (submission → acceptance → execution), the mandatory
compliance-approval path for large/market orders, four-eyes (maker-checker) enforcement,
role-based access restrictions, retention-date stamping, the two-step MFA login/enrollment
flow, and — critically — hash-chain audit log integrity, including a test that directly
tampers with a historical row and confirms `verifyChain()` detects it.

## How it works

### Order lifecycle (segregation of duties / "four-eyes")

```
CLIENT submits
     │
     ▼
PENDING_REVIEW ──(dealer rejects)──────────────────────► REJECTED
     │
     │ dealer accepts (must not be the order's own creator)
     ▼
 ┌───┴────────────────────────────────────────┐
 │ notional < threshold & priced               │ notional ≥ threshold, OR a
 │                                              │ MARKET order (notional unknown)
 ▼                                              ▼
ACCEPTED                          PENDING_COMPLIANCE_APPROVAL
 │                                              │ compliance officer approves
 │                                              │ (must not be the order's own creator)
 │                                              ▼
 │                                    COMPLIANCE_APPROVED
 │                                              │
 └──────────────────┬───────────────────────────┘
                     │ dealer executes
                     ▼
                 EXECUTED

Any non-terminal state can also move to CANCELLED (client, on their own order; or dealer/compliance).
```

Actual execution happens outside this system, on the custodian's own trading platform — the
"execute" step here is the dealer recording what the custodian filled (price, quantity, and
optionally the custodian's name + trade confirmation reference) once it's done, closing the
loop between the client's instruction and the custodian's own record.

Every transition writes both a per-order `OrderEvent` (fast lifecycle history shown in the UI)
and a system-wide, hash-chained `AuditLog` entry (see below) in the *same database transaction*
as the state change — so a mutation can never happen without being audited.

### The audit trail

`server/src/audit/auditService.ts` implements an append-only, hash-chained log:

- Every entry stores `sha256(previous entry's hash + this entry's own content hash)`.
- Rows are never updated or deleted by application code.
- `GET /audit/verify` (compliance/admin only) walks the entire chain from genesis and
  recomputes every hash, returning `{ valid, brokenAtSequence, reason }`. Altering, deleting,
  or reordering any historical row — even directly in the database, bypassing the API — makes
  this fail deterministically at the point of tampering. This is the same class of technique
  as a blockchain's hash chain, applied to a conventional relational audit log, and it's the
  server-side counterpart to the "Verify chain integrity" button in the compliance UI.
- `GET /audit` supports filtering (entity, actor, action, date range) and pagination;
  `GET /audit/export.csv` produces a downloadable export for a regulatory inspection or
  internal review.

### Multi-factor authentication

Any account can enroll TOTP-based MFA from the "Security" page (scan the QR code with any
standard authenticator app). Once enabled, `POST /auth/login` returns `{ mfaRequired: true,
preAuthToken }` instead of a session token; the client then calls `POST /auth/mfa/verify` with
that token and a 6-digit code to get a real session. The pre-auth token is short-lived (5 min),
carries no role, and is rejected by every other authenticated endpoint — it's only good for
completing the MFA challenge. Enrollment, enable, disable, and every MFA login attempt are
audit-logged. MFA is currently opt-in, not enforced for any role — see `COMPLIANCE.md` §7.

### Roles

| Role                 | Can do                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `CLIENT`              | Submit their own orders, view/cancel their own orders                  |
| `DEALER`               | Enter orders on a client's behalf, accept/reject, execute               |
| `COMPLIANCE_OFFICER`   | Approve/reject orders routed for compliance review, flag any order for AML/best-execution review, view the full audit trail |
| `ADMIN`                | Superset of the above, for operational/administrative use               |

## Configuration

See `server/.env.example`. Notably `COMPLIANCE_APPROVAL_THRESHOLD` (default `100000`) — the
notional value at or above which an order requires compliance sign-off before execution; any
`MARKET` order (notional unknown until fill) always requires it too.
