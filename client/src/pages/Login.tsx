import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("client1@caymantrade.example");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
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
