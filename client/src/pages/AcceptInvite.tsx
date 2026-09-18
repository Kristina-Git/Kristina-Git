import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [invitee, setInvitee] = useState<{ email: string; fullName: string } | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .checkInvite(token)
      .then(setInvitee)
      .catch((err) => setInvalidReason(err instanceof Error ? err.message : "Invalid invite"))
      .finally(() => setChecking(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.acceptInvite(token!, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="loading">Checking invite link…</p>
        </div>
      </div>
    );
  }

  if (invalidReason) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invite link invalid</h1>
          <div className="error-banner">{invalidReason}</div>
          <p className="muted">Contact whoever set up your account for a new link.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Account activated</h1>
          <p className="muted">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Set your password</h1>
        <p className="muted">
          Welcome, {invitee?.fullName}. Set a password for <strong>{invitee?.email}</strong> to activate your
          account.
        </p>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required />
        </label>
        <label>
          Confirm password
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" minLength={8} required />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Activating…" : "Activate account"}
        </button>
      </form>
    </div>
  );
}
