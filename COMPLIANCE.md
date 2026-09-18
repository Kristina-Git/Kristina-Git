# Regulatory design notes — CIMA (Cayman Islands)

**This document explains which technical controls this system implements and which general
regulatory themes they're designed to support. It is not legal advice, and this codebase is
not, by itself, "compliant with CIMA regulation" — no software is, in isolation. Whether a
specific deployment of this system meets your firm's actual obligations depends on your
licence type, your policies and procedures, your outsourcing/vendor arrangements, and a
compliance/legal review by qualified counsel in the Cayman Islands. Treat everything below as
an engineering starting point, not a compliance sign-off.**

CIMA supervises securities investment business primarily under the **Securities Investment
Business Act (SIBA)** and imposes AML/CFT obligations under the **Anti-Money Laundering
Regulations (AMLRs)**, alongside sector-specific rules (e.g. the Mutual Funds Act for fund
administrators). A firm's actual retention periods, reporting duties, and control requirements
depend on which of these regimes apply to it and on CIMA's rules, statements of guidance, and
any conditions attached to its specific licence — none of which this system can determine for
you.

## What this system implements, and why

### 1. Immutable, tamper-evident audit trail

Every state-changing action (order created, accepted, routed to compliance, approved,
rejected, executed, cancelled, flagged; login success/failure) writes one row to a hash-chained
`AuditLog` table, inside the same database transaction as the change itself. Rows are never
updated or deleted by the application. `GET /audit/verify` independently recomputes the chain
and reports whether any historical entry has been altered.

**Why:** regulated firms are generally expected to keep accurate, complete, and reliable
business records, and to be able to demonstrate that those records haven't been tampered with.
A conventional audit log that can be edited by anyone with database access doesn't support
that; a hash chain gives you a verifiable, evidence-grade trail instead.

### 2. Segregation of duties / four-eyes control

- A dealer cannot accept an order they personally entered on a client's behalf.
- A compliance officer cannot approve an order entered by themselves.
- Client-submitted orders always require a *different* person (a dealer) to accept them, and
  execution and compliance approval are separate actions with separate role requirements.

**Why:** maker-checker controls are a standard expectation for firms conducting investment
business, reducing the risk of a single individual originating, approving, and executing a
transaction unchecked — relevant to both operational risk and AML controls.

### 3. Mandatory compliance review above a threshold

Orders at or above `COMPLIANCE_APPROVAL_THRESHOLD` (configurable; default notional $100,000),
and all `MARKET` orders (whose notional is unknown until fill), are routed to
`PENDING_COMPLIANCE_APPROVAL` and cannot be executed until a compliance officer signs off.

**Why:** supports a firm's own risk-based transaction monitoring and best-execution oversight
obligations. The specific threshold and criteria are a policy decision for your firm/counsel,
not a regulatory number baked into this codebase — treat the default as a placeholder to
replace with your own risk appetite and AML procedures.

### 4. Role-based access control

Four roles (`CLIENT`, `DEALER`, `COMPLIANCE_OFFICER`, `ADMIN`) gate every API endpoint. Clients
can only see and cancel their own orders. Only compliance/admin can view the system-wide audit
trail, flag orders for review, or export records.

**Why:** access to client records and transaction data should be restricted to those who need
it, and the compliance function should have independent visibility into all order activity
regardless of which dealer originated it.

### 5. Record retention, no hard deletes

Every order is stamped with `retentionUntil` = creation date + `RETENTION_YEARS` (default 7
years) at creation. No application code path hard-deletes an order, order event, or audit log
row; cancellation is a status transition, not a deletion.

**Why:** CIMA-regulated entities are generally required to retain business records for a
minimum period under SIBA and/or the AMLRs. **Confirm the correct retention period for your
specific licence and record type with your compliance officer/counsel** — this system uses 7
years as a conservative default, not a verified statutory figure for every scenario, and
different record types (e.g. transaction records vs. CDD/KYC records) can carry different
minimums.

### 6. Client identification fields

`User.clientCode` and `User.jurisdiction` provide a place to reference a client's due-diligence
identity and jurisdiction of residence/incorporation against your firm's KYC/CDD system.

**Why:** this is a reference hook, **not** a KYC/CDD engine. A real deployment needs to
integrate with (or build) proper customer due diligence, sanctions screening, and ongoing
monitoring — none of which this system attempts to provide.

## What this system does *not* do

- It does not perform KYC/CDD, sanctions/PEP screening, or ongoing AML transaction monitoring
  beyond the manual "flag for review" action.
- It does not implement CIMA regulatory reporting/filings (e.g. periodic returns).
- It does not implement best-execution price benchmarking — the compliance-approval threshold
  is a manual control, not an automated best-execution check.
- It stores JWTs client-side in `localStorage` for demo simplicity; a production deployment
  handling real client data should review session/token handling, transport security (TLS
  termination, HSTS), secrets management, and infrastructure hardening as part of a proper
  security review, separately from this document.
- Passwords use `bcryptjs`; production deployments should also add MFA for dealer/compliance/
  admin accounts, which this demo does not implement.

## Before relying on this in production

1. Have Cayman Islands counsel confirm which CIMA regime(s) apply to your licence and what
   your actual record-keeping, reporting, and AML obligations are.
2. Replace the default retention period, compliance threshold, and role model with your firm's
   actual policies and procedures.
3. Integrate real KYC/CDD and sanctions screening.
4. Run this through your own security review (the repo includes a `security-review` workflow
   you can run against the codebase) before handling real client data or real orders.
5. Migrate from SQLite to a production database (PostgreSQL) with proper backup, encryption at
   rest, and access controls.
