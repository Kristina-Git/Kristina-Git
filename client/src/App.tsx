import { Navigate, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ClientDashboard from "./pages/ClientDashboard";
import DealerDashboard from "./pages/DealerDashboard";
import ComplianceDashboard from "./pages/ComplianceDashboard";
import SecuritySettings from "./pages/SecuritySettings";

function homeFor(role: string | undefined) {
  if (role === "CLIENT") return "/client";
  if (role === "DEALER") return "/dealer";
  if (role === "COMPLIANCE_OFFICER" || role === "ADMIN") return "/compliance";
  return "/login";
}

function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <span className="brand-mark">CT</span>
        <div>
          <div className="brand-title">Cayman Trade Order System</div>
          <div className="brand-subtitle">CIMA-aligned order management &amp; audit trail</div>
        </div>
      </div>
      <nav className="navbar-links">
        <Link to={homeFor(user.role)}>Dashboard</Link>
        {(user.role === "COMPLIANCE_OFFICER" || user.role === "ADMIN") && <Link to="/compliance/audit">Audit Trail</Link>}
        <Link to="/security">
          Security {!user.mfaEnabled && <span className="flag-pill">2FA off</span>}
        </Link>
      </nav>
      <div className="navbar-user">
        <span>
          {user.fullName} <em>({user.role.replace("_", " ")})</em>
        </span>
        <button onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}

function RequireRole({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />
          <Route
            path="/client"
            element={
              <RequireRole roles={["CLIENT"]}>
                <ClientDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/dealer"
            element={
              <RequireRole roles={["DEALER", "ADMIN"]}>
                <DealerDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/compliance"
            element={
              <RequireRole roles={["COMPLIANCE_OFFICER", "ADMIN"]}>
                <ComplianceDashboard tab="orders" />
              </RequireRole>
            }
          />
          <Route
            path="/compliance/audit"
            element={
              <RequireRole roles={["COMPLIANCE_OFFICER", "ADMIN"]}>
                <ComplianceDashboard tab="audit" />
              </RequireRole>
            }
          />
          <Route
            path="/security"
            element={
              <RequireRole roles={["CLIENT", "DEALER", "COMPLIANCE_OFFICER", "ADMIN"]}>
                <SecuritySettings />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to={loading ? "/login" : homeFor(user?.role)} replace />} />
        </Routes>
      </main>
    </div>
  );
}
