import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AuditEntry, Order } from "../api";
import OrderTable from "../components/OrderTable";
import OrderDetail from "../components/OrderDetail";
import AuditTable from "../components/AuditTable";

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState("PENDING_COMPLIANCE_APPROVAL");

  async function refresh() {
    const list = await api.listOrders(filter ? { status: filter } : {});
    setOrders(list);
    if (selected) setSelected(await api.getOrder(selected.id));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function select(id: string) {
    setSelected(await api.getOrder(id));
  }

  return (
    <div className="dashboard two-col">
      <div>
        <section>
          <div className="section-header">
            <h3>Compliance queue</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING_COMPLIANCE_APPROVAL">Pending compliance approval</option>
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="EXECUTED">Executed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <OrderTable orders={orders} onSelect={select} selectedId={selected?.id} showClient />
        </section>
      </div>
      <div>{selected && <OrderDetail order={selected} onChanged={refresh} />}</div>
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [verify, setVerify] = useState<{ valid: boolean; totalEntries: number; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await api.auditLog(action ? { action } : {});
    setEntries(result.entries);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  async function runVerify() {
    setBusy(true);
    try {
      setVerify(await api.verifyChain());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-header">
        <h3>System audit trail</h3>
        <div className="audit-actions">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            <option value="ORDER_CREATED">Order created</option>
            <option value="ORDER_ACCEPTED">Order accepted</option>
            <option value="ORDER_ROUTED_TO_COMPLIANCE">Routed to compliance</option>
            <option value="ORDER_COMPLIANCE_APPROVED">Compliance approved</option>
            <option value="ORDER_EXECUTED">Order executed</option>
            <option value="ORDER_REJECTED">Order rejected</option>
            <option value="ORDER_CANCELLED">Order cancelled</option>
            <option value="ORDER_FLAGGED_FOR_REVIEW">Flagged for review</option>
            <option value="LOGIN_SUCCESS">Login success</option>
            <option value="LOGIN_FAILURE">Login failure</option>
          </select>
          <button onClick={runVerify} disabled={busy}>
            {busy ? "Verifying…" : "Verify chain integrity"}
          </button>
          <button onClick={() => api.downloadAuditCsv()}>Export CSV</button>
        </div>
      </div>
      {verify && (
        <div className={verify.valid ? "verify-banner ok" : "verify-banner bad"}>
          {verify.valid
            ? `Chain intact — ${verify.totalEntries} entries verified, no tampering detected.`
            : `TAMPERING DETECTED: ${verify.reason}`}
        </div>
      )}
      <AuditTable entries={entries} />
    </section>
  );
}

export default function ComplianceDashboard({ tab }: { tab: "orders" | "audit" }) {
  return (
    <div>
      <div className="tab-bar">
        <Link to="/compliance" className={tab === "orders" ? "active" : ""}>
          Orders
        </Link>
        <Link to="/compliance/audit" className={tab === "audit" ? "active" : ""}>
          Audit trail
        </Link>
      </div>
      {tab === "orders" ? <OrdersTab /> : <AuditTab />}
    </div>
  );
}
