import type { CSSProperties } from "react";

const COLORS: Record<string, string> = {
  PENDING_REVIEW: "#9a6b00",
  ACCEPTED: "#0a6bb5",
  PENDING_COMPLIANCE_APPROVAL: "#b5450a",
  COMPLIANCE_APPROVED: "#0a6bb5",
  EXECUTED: "#127a3b",
  REJECTED: "#a11f1f",
  CANCELLED: "#5a5a5a",
  EXPIRED: "#5a5a5a",
};

export default function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? "#5a5a5a";
  return (
    <span className="status-badge" style={{ "--badge-color": color } as CSSProperties}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
