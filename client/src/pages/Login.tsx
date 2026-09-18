import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, completeMfaLogin } = useAuth();
  const [email, setEmail] = useState("client1@caymantrade.example");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.preAuthToken) {
        setPreAuthToken(result.preAuthToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await completeMfaLogin(preAuthToken!, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  if (preAuthToken) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={onSubmitCode}>
          <h1>Two-factor verification</h1>
          <p className="muted">Enter the 6-digit code from your authenticator app.</p>
          <label>
            Authentication code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="123456"
              required
            />
          </label>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" className="link-button" onClick={() => setPreAuthToken(null)}>
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmitPassword}>
        <h1>Sign in</h1>
        <p className="muted">Trade order management &amp; audit trail platform</p>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="demo-hint">
          <strong>Demo accounts</strong> (password <code>ChangeMe123!</code>):
          <ul>
            <li>client1@caymantrade.example — Client</li>
            <li>dealer@caymantrade.example — Dealer</li>
            <li>compliance@caymantrade.example — Compliance Officer</li>
          </ul>
        </div>
      </form>
    </div>
  );
}
