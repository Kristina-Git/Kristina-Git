import { CSSProperties, useState } from "react";
import { api, Order } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "./StatusBadge";

export default function OrderDetail({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [complianceNotes, setComplianceNotes] = useState("");
  const [execPrice, setExecPrice] = useState(order.limitPrice ? String(order.limitPrice) : "");
  const [execQty, setExecQty] = useState(String(order.quantity));
  const [custodianName, setCustodianName] = useState("");
  const [custodianReference, setCustodianReference] = useState("");
  const [showExecute, setShowExecute] = useState(false);
  const [flagNotes, setFlagNotes] = useState("");
  const [showFlag, setShowFlag] = useState(false);
  const [agreedFeePercent, setAgreedFeePercent] = useState("");
  const [showFeeRequest, setShowFeeRequest] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [showDispute, setShowDispute] = useState(false);

  if (!user) return null;
  const role = user.role;

  async function run(action: () => Promise<Order>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const canCancel =
    ["PENDING_REVIEW", "ACCEPTED", "PENDING_COMPLIANCE_APPROVAL", "COMPLIANCE_APPROVED"].includes(order.status) &&
    (role !== "CLIENT" || order.clientId === user.id);

  return (
    <div className="order-detail">
      <div className="order-detail-header">
        <div>
          <h3>
            {order.orderNumber} <StatusBadge status={order.status} />
          </h3>
          <p className="muted">
            {order.side} {order.quantity} {order.instrumentSymbol} @{" "}
            {order.orderType === "MARKET" ? "market" : order.limitPrice} {order.currency} · {order.timeInForce}
          </p>
        </div>
      </div>

      <dl className="detail-grid">
        <dt>Client</dt>
        <dd>{order.client?.fullName ?? order.clientId}</dd>
        <dt>Record retention until</dt>
        <dd>{new Date(order.retentionUntil).toLocaleDateString()}</dd>
        {order.executedAt && (
          <>
            <dt>Executed</dt>
            <dd>
              {order.executedQuantity} @ {order.executedPrice} on {new Date(order.executedAt).toLocaleString()}
            </dd>
          </>
        )}
        {order.custodianName && (
          <>
            <dt>Custodian</dt>
            <dd>
              {order.custodianName}
              {order.custodianReference ? ` — ref ${order.custodianReference}` : ""}
            </dd>
          </>
        )}
        {order.rejectionReason && (
          <>
            <dt>Rejection reason</dt>
            <dd>{order.rejectionReason}</dd>
          </>
        )}
        {order.complianceFlag && (
          <>
            <dt>Compliance flag</dt>
            <dd>{order.complianceNotes}</dd>
          </>
        )}
        {order.feeConfirmationStatus !== "NONE" && (
          <>
            <dt>Fee confirmation</dt>
            <dd>
              Agreed fee {order.agreedFeePercent}% —{" "}
              <span
                className="status-badge"
                style={
                  {
                    "--badge-color":
                      order.feeConfirmationStatus === "CONFIRMED"
                        ? "#127a3b"
                        : order.feeConfirmationStatus === "DISPUTED"
                          ? "#a11f1f"
                          : "#9a6b00",
                  } as CSSProperties
                }
              >
                {order.feeConfirmationStatus}
              </span>
              {order.feeConfirmationNote && ` — "${order.feeConfirmationNote}"`}
            </dd>
          </>
        )}
      </dl>

      {error && <div className="error-banner">{error}</div>}

      <div className="action-row">
        {role === "DEALER" && order.status === "PENDING_REVIEW" && (
          <button disabled={busy} onClick={() => run(() => api.acceptOrder(order.id))}>
            Accept
          </button>
        )}
        {["DEALER", "COMPLIANCE_OFFICER"].includes(role) &&
          ["PENDING_REVIEW", "PENDING_COMPLIANCE_APPROVAL"].includes(order.status) && (
            <button disabled={busy} onClick={() => setShowReject((v) => !v)}>
              Reject
            </button>
          )}
        {role === "COMPLIANCE_OFFICER" && order.status === "PENDING_COMPLIANCE_APPROVAL" && (
          <button
            disabled={busy}
            onClick={() => run(() => api.complianceApprove(order.id, complianceNotes || undefined))}
          >
            Approve
          </button>
        )}
        {role === "DEALER" && ["ACCEPTED", "COMPLIANCE_APPROVED"].includes(order.status) && (
          <button disabled={busy} onClick={() => setShowExecute((v) => !v)}>
            Execute
          </button>
        )}
        {canCancel && (
          <button disabled={busy} onClick={() => run(() => api.cancelOrder(order.id))}>
            Cancel
          </button>
        )}
        {role === "COMPLIANCE_OFFICER" && !order.complianceFlag && (
          <button disabled={busy} onClick={() => setShowFlag((v) => !v)}>
            Flag for review
          </button>
        )}
        {role === "COMPLIANCE_OFFICER" && order.status === "EXECUTED" && order.feeConfirmationStatus !== "PENDING" && (
          <button disabled={busy} onClick={() => setShowFeeRequest((v) => !v)}>
            {order.feeConfirmationStatus === "NONE" ? "Request fee confirmation" : "Re-request fee confirmation"}
          </button>
        )}
        {role === "CLIENT" && order.clientId === user.id && order.feeConfirmationStatus === "PENDING" && (
          <>
            <button
              disabled={busy}
              onClick={() => run(() => api.respondToFeeConfirmation(order.id, true))}
            >
              Confirm {order.agreedFeePercent}% fee
            </button>
            <button disabled={busy} onClick={() => setShowDispute((v) => !v)}>
              Dispute fee
            </button>
          </>
        )}
      </div>

      {showReject && (
        <div className="inline-form">
          <label>
            Rejection reason
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </label>
          <button
            disabled={busy || !rejectReason}
            onClick={() =>
              run(() => api.rejectOrder(order.id, rejectReason)).then(() => {
                setShowReject(false);
                setRejectReason("");
              })
            }
          >
            Confirm reject
          </button>
        </div>
      )}

      {role === "COMPLIANCE_OFFICER" && order.status === "PENDING_COMPLIANCE_APPROVAL" && (
        <div className="inline-form">
          <label>
            Approval notes (optional)
            <input value={complianceNotes} onChange={(e) => setComplianceNotes(e.target.value)} />
          </label>
        </div>
      )}

      {showExecute && (
        <div className="inline-form">
          <label>
            Executed price
            <input value={execPrice} onChange={(e) => setExecPrice(e.target.value)} type="number" step="any" />
          </label>
          <label>
            Executed quantity
            <input value={execQty} onChange={(e) => setExecQty(e.target.value)} type="number" step="any" />
          </label>
          <label>
            Custodian
            <input
              value={custodianName}
              onChange={(e) => setCustodianName(e.target.value)}
              placeholder="e.g. Apex Custody Ltd"
            />
          </label>
          <label>
            Custodian confirmation ref
            <input
              value={custodianReference}
              onChange={(e) => setCustodianReference(e.target.value)}
              placeholder="e.g. TCN-88213"
            />
          </label>
          <button
            disabled={busy || !execPrice || !execQty}
            onClick={() =>
              run(() =>
                api.executeOrder(
                  order.id,
                  Number(execPrice),
                  Number(execQty),
                  custodianName || undefined,
                  custodianReference || undefined
                )
              ).then(() => setShowExecute(false))
            }
          >
            Confirm execution
          </button>
        </div>
      )}

      {showFlag && (
        <div className="inline-form">
          <label>
            Flag notes
            <input value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} />
          </label>
          <button
            disabled={busy || !flagNotes}
            onClick={() =>
              run(() => api.flagOrder(order.id, flagNotes)).then(() => {
                setShowFlag(false);
                setFlagNotes("");
              })
            }
          >
            Confirm flag
          </button>
        </div>
      )}

      {showFeeRequest && (
        <div className="inline-form">
          <label>
            Agreed fee (%)
            <input
              value={agreedFeePercent}
              onChange={(e) => setAgreedFeePercent(e.target.value)}
              type="number"
              min="0"
              max="100"
              step="any"
              placeholder="e.g. 5"
            />
          </label>
          <button
            disabled={busy || !agreedFeePercent}
            onClick={() =>
              run(() => api.requestFeeConfirmation(order.id, Number(agreedFeePercent))).then(() => {
                setShowFeeRequest(false);
                setAgreedFeePercent("");
              })
            }
          >
            Send to client
          </button>
        </div>
      )}

      {showDispute && (
        <div className="inline-form">
          <label>
            Reason for dispute
            <input value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} />
          </label>
          <button
            disabled={busy || !disputeNote}
            onClick={() =>
              run(() => api.respondToFeeConfirmation(order.id, false, disputeNote)).then(() => {
                setShowDispute(false);
                setDisputeNote("");
              })
            }
          >
            Submit dispute
          </button>
        </div>
      )}

      <h4>Lifecycle audit trail</h4>
      <ul className="timeline">
        {order.events?.map((ev) => (
          <li key={ev.id}>
            <span className="timeline-time">{new Date(ev.createdAt).toLocaleString()}</span>
            <span className="timeline-status">
              {ev.fromStatus ? `${ev.fromStatus.replace(/_/g, " ")} → ` : ""}
              {ev.toStatus.replace(/_/g, " ")}
            </span>
            <span className="timeline-actor">
              {ev.actor.fullName} ({ev.actor.role.replace("_", " ")})
            </span>
            {ev.reason && <span className="timeline-reason">{ev.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
