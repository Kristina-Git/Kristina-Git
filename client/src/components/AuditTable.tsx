import { AuditEntry } from "../api";

export default function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="muted">No audit entries match this filter.</p>;
  return (
    <table className="order-table audit-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Timestamp</th>
          <th>Entity</th>
          <th>Action</th>
          <th>Actor</th>
          <th>IP</th>
          <th>Hash</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{e.sequence}</td>
            <td>{new Date(e.timestamp).toLocaleString()}</td>
            <td>
              {e.entityType} <span className="muted">{e.entityId.slice(0, 8)}</span>
            </td>
            <td>{e.action}</td>
            <td>{e.actor ? `${e.actor.fullName} (${e.actor.role.replace("_", " ")})` : "system"}</td>
            <td>{e.ipAddress ?? "—"}</td>
            <td className="mono" title={e.hash}>
              {e.hash.slice(0, 10)}…
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
