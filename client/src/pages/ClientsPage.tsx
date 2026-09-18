import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { api, ClientAccount, InviteResult } from "../api";
import { useAuth } from "../context/AuthContext";

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

function AddClientForm({ onCreated }: { onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.createClient({
        fullName,
        email,
        clientCode: clientCode || undefined,
        jurisdiction: jurisdiction || undefined,
      });
      setResult(res);
      setFullName("");
      setEmail("");
      setClientCode("");
      setJurisdiction("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="order-form" onSubmit={onSubmit}>
        <h3>Add a client</h3>
        <div className="form-grid">
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Client code (optional)
            <input value={clientCode} onChange={(e) => setClientCode(e.target.value)} />
          </label>
          <label>
            Jurisdiction (optional)
            <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Cayman Islands" />
          </label>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create client account"}
        </button>
      </form>

      {result && (
        <div className="verify-banner ok" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <strong>{result.fullName}</strong> account created.{" "}
          {result.emailed
            ? "An invite email was sent automatically."
            : result.emailWarning
              ? `Email sending failed (${result.emailWarning}) -- share this link with them yourself:`
              : "Email isn't configured, so share this link with them yourself:"}
          {!result.emailed && result.inviteUrl && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code className="mono">{result.inviteUrl}</code>
              <CopyLink url={result.inviteUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BulkImport({ onCreated }: { onCreated: () => void }) {
  const [csv, setCsv] = useState("fullName,email,clientCode,jurisdiction\n");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ created: InviteResult[]; rowErrors: { row: number; error: string }[] } | null>(
    null
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.bulkImportClients(csv);
      setResults(res);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3>Bulk import clients</h3>
      <p className="muted">
        Paste rows from a spreadsheet (copy straight out of Excel/Sheets, or a CSV file's contents). First row must
        be headers: <code>fullName</code>, <code>email</code>, and optionally <code>clientCode</code>,{" "}
        <code>jurisdiction</code>. Up to 500 rows.
      </p>
      <form onSubmit={onSubmit}>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
        />
        {error && <div className="error-banner">{error}</div>}
        <div className="action-row">
          <button type="submit" disabled={busy}>
            {busy ? "Importing…" : "Import clients"}
          </button>
        </div>
      </form>

      {results && (
        <div>
          {results.rowErrors.length > 0 && (
            <div className="error-banner" style={{ marginBottom: 12 }}>
              {results.rowErrors.map((e) => (
                <div key={e.row}>
                  Row {e.row}: {e.error}
                </div>
              ))}
            </div>
          )}
          <table className="order-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Invite link</th>
              </tr>
            </thead>
            <tbody>
              {results.created.map((r, i) => (
                <tr key={i}>
                  <td>{r.fullName ?? "—"}</td>
                  <td>{r.email}</td>
                  <td>
                    {r.error ? (
                      <span style={{ color: "var(--danger)" }}>{r.error}</span>
                    ) : r.emailed ? (
                      "Emailed"
                    ) : (
                      "Created"
                    )}
                  </td>
                  <td>{!r.error && !r.emailed && r.inviteUrl && <CopyLink url={r.inviteUrl} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientAccount[]>([]);

  async function refresh() {
    setClients(await api.clients(true));
  }

  useEffect(() => {
    refresh();
  }, []);

  const canBulkImport = user?.role === "COMPLIANCE_OFFICER" || user?.role === "ADMIN";

  return (
    <div className="dashboard two-col">
      <div>
        <AddClientForm onCreated={refresh} />
        {canBulkImport && <BulkImport onCreated={refresh} />}
      </div>
      <div>
        <section>
          <h3>All clients</h3>
          <table className="order-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Code</th>
                <th>Jurisdiction</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.fullName}</td>
                  <td>{c.email}</td>
                  <td>{c.clientCode ?? "—"}</td>
                  <td>{c.jurisdiction ?? "—"}</td>
                  <td>
                    {!c.isActive ? (
                      <span className="status-badge" style={{ "--badge-color": "#5a5a5a" } as CSSProperties}>
                        Deactivated
                      </span>
                    ) : c.activated ? (
                      <span className="status-badge" style={{ "--badge-color": "#127a3b" } as CSSProperties}>
                        Active
                      </span>
                    ) : (
                      <span className="status-badge" style={{ "--badge-color": "#9a6b00" } as CSSProperties}>
                        Pending activation
                      </span>
                    )}
                  </td>
                  <td>
                    <button type="button" onClick={() => api.downloadOrdersCsv({ clientId: c.id })}>
                      Export trades
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
