import { Order } from "../api";
import StatusBadge from "./StatusBadge";

export default function OrderTable({
  orders,
  onSelect,
  selectedId,
  showClient = false,
}: {
  orders: Order[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
  showClient?: boolean;
}) {
  if (orders.length === 0) {
    return <p className="muted">No orders.</p>;
  }
  return (
    <table className="order-table">
      <thead>
        <tr>
          <th>Order #</th>
          {showClient && <th>Client</th>}
          <th>Instrument</th>
          <th>Side</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Limit price</th>
          <th>Status</th>
          <th>Submitted</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className={o.id === selectedId ? "selected" : ""} onClick={() => onSelect(o.id)}>
            <td>{o.orderNumber}</td>
            {showClient && <td>{o.client?.fullName ?? o.clientId}</td>}
            <td>{o.instrumentSymbol}</td>
            <td>{o.side}</td>
            <td>{o.orderType}</td>
            <td>{o.quantity}</td>
            <td>{o.limitPrice ?? "—"}</td>
            <td>
              <StatusBadge status={o.status} />
              {o.complianceFlag && <span className="flag-pill">Flagged</span>}
            </td>
            <td>{new Date(o.createdAt).toLocaleString()}</td>
            <td>
              <button type="button" onClick={() => onSelect(o.id)}>
                Details
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
