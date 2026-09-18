import { CSSProperties, FormEvent, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function SecuritySettings() {
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [enrolling, setEnrolling] = useState<{ secret: string; otpauthUri: string; qrCodeDataUrl: string } | null>(
    null
  );
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  if (!user) return null;

  async function startEnrollment() {
    setError(null);
    setBusy(true);
    try {
      setEnrolling(await api.mfaSetup());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start MFA setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.mfaEnable(code);
      setEnrolling(null);
      setCode("");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.mfaDisable(password);
      setShowDisable(false);
      setPassword("");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <section style={{ maxWidth: 480 }}>
        <h3>Two-factor authentication</h3>
        {error && <div className="error-banner">{error}</div>}

        {user.mfaEnabled ? (
          <>
            <p>
              <span className="status-badge" style={{ "--badge-color": "#127a3b" } as CSSProperties}>
                Enabled
              </span>
            </p>
            <p className="muted">
              Your account requires a 6-digit code from an authenticator app at login, in addition to your
              password.
            </p>
            {!showDisable && (
              <button disabled={busy} onClick={() => setShowDisable(true)}>
                Disable two-factor authentication
              </button>
            )}
            {showDisable && (
              <form className="inline-form" onSubmit={confirmDisable}>
                <label>
                  Confirm your password
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
                </label>
                <button type="submit" disabled={busy || !password}>
                  {busy ? "Disabling…" : "Confirm disable"}
                </button>
              </form>
            )}
          </>
        ) : enrolling ? (
          <form className="inline-form" onSubmit={confirmEnable} style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <p className="muted">
              Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter
              the secret manually, then confirm with a generated code.
            </p>
            <img src={enrolling.qrCodeDataUrl} alt="MFA enrollment QR code" style={{ background: "white", padding: 8, borderRadius: 8 }} />
            <p className="mono muted">{enrolling.secret}</p>
            <label>
              6-digit code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                required
              />
            </label>
            <div className="action-row">
              <button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Confirming…" : "Confirm and enable"}
              </button>
              <button type="button" onClick={() => setEnrolling(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p>
              <span className="status-badge" style={{ "--badge-color": "#9a6b00" } as CSSProperties}>
                Not enabled
              </span>
            </p>
            <p className="muted">
              Add an extra layer of protection to your account with a time-based one-time code from an
              authenticator app. Recommended for dealer, compliance, and admin accounts.
            </p>
            <button disabled={busy} onClick={startEnrollment}>
              Set up two-factor authentication
            </button>
          </>
        )}
      </section>
    </div>
  );
}
