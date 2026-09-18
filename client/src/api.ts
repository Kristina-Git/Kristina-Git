export type Role = "CLIENT" | "DEALER" | "COMPLIANCE_OFFICER" | "ADMIN";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clientCode?: string | null;
  mfaEnabled?: boolean;
}

export interface LoginResult {
  token?: string;
  user?: CurrentUser;
  mfaRequired?: true;
  preAuthToken?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  createdById: string;
  instrumentSymbol: string;
  instrumentName?: string | null;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP";
  quantity: number;
  limitPrice?: number | null;
  currency: string;
  timeInForce: string;
  status: string;
  rejectionReason?: string | null;
  complianceFlag: boolean;
  complianceNotes?: string | null;
  executedPrice?: number | null;
  executedQuantity?: number | null;
  executedAt?: string | null;
  custodianName?: string | null;
  custodianReference?: string | null;
  retentionUntil: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; fullName: string; clientCode?: string | null };
  events?: OrderEvent[];
}

export interface OrderEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason?: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: Role };
}

export interface AuditEntry {
  id: string;
  sequence: number;
  entityType: string;
  entityId: string;
  action: string;
  actorRole: Role | null;
  ipAddress: string | null;
  timestamp: string;
  hash: string;
  prevHash: string;
  actor?: { id: string; fullName: string; email: string; role: Role } | null;
}

const BASE = "/api";

let authToken: string | null = localStorage.getItem("token");

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export function getToken() {
  return authToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json();
  return res.text() as unknown as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verifyMfa: (preAuthToken: string, code: string) =>
    request<{ token: string; user: CurrentUser }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ preAuthToken, code }),
    }),
  mfaSetup: () =>
    request<{ secret: string; otpauthUri: string; qrCodeDataUrl: string }>("/auth/mfa/setup", { method: "POST" }),
  mfaEnable: (code: string) =>
    request<{ mfaEnabled: true }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (password: string) =>
    request<{ mfaEnabled: false }>("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password }) }),
  me: () => request<CurrentUser>("/users/me"),
  clients: () => request<{ id: string; fullName: string; email: string; clientCode?: string }[]>("/users/clients"),

  listOrders: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Order[]>(`/orders${qs ? `?${qs}` : ""}`);
  },
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (data: Record<string, unknown>) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(data) }),
  acceptOrder: (id: string) => request<Order>(`/orders/${id}/accept`, { method: "POST" }),
  rejectOrder: (id: string, reason: string) =>
    request<Order>(`/orders/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  complianceApprove: (id: string, notes?: string) =>
    request<Order>(`/orders/${id}/compliance-approve`, { method: "POST", body: JSON.stringify({ notes }) }),
  executeOrder: (
    id: string,
    executedPrice: number,
    executedQuantity: number,
    custodianName?: string,
    custodianReference?: string
  ) =>
    request<Order>(`/orders/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ executedPrice, executedQuantity, custodianName, custodianReference }),
    }),
  cancelOrder: (id: string, reason?: string) =>
    request<Order>(`/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  flagOrder: (id: string, notes: string) =>
    request<Order>(`/orders/${id}/flag`, { method: "POST", body: JSON.stringify({ notes }) }),

  auditLog: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ total: number; page: number; pageSize: number; entries: AuditEntry[] }>(
      `/audit${qs ? `?${qs}` : ""}`
    );
  },
  verifyChain: () =>
    request<{ valid: boolean; totalEntries: number; brokenAtSequence: number | null; reason: string | null }>(
      "/audit/verify"
    ),
  downloadAuditCsv: async () => {
    const res = await fetch(`${BASE}/audit/export.csv`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!res.ok) throw new Error("Failed to export audit trail");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-trail-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
