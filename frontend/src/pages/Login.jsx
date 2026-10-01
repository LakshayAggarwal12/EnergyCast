import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, inputClass } from "../components/ui";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const u = await login(email, password);
      navigate(location.state?.from?.pathname || (u.role === "admin" ? "/admin" : "/dashboard"), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-bg">
      {/* Subtle technical grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(45,49,58,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45,49,58,0.4) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 0%, transparent 100%)",
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
            </svg>
            <span className="text-2xl font-bold tracking-tight text-ink">
              Energi<span className="text-accent">Cast</span>
            </span>
          </div>
          <p className="text-sm text-muted">Energy Intelligence Platform</p>
        </div>

        {/* Login card */}
        <div className="bg-surface border border-line rounded-xl p-8 shadow-2xl">
          <h1 className="text-base font-semibold text-ink mb-6">Sign in to your workspace</h1>

          <form onSubmit={submit} className="space-y-5">
            <Field label="Email address">
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                placeholder="analyst@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
                  </svg>
                  Sign in
                </>
              )}
            </Button>

            <p className="text-sm text-muted text-center">
              No account?{" "}
              <Link className="text-accent hover:text-accent-strong transition-colors" to="/register">
                Create one
              </Link>
            </p>
          </form>
        </div>

        <p className="text-center text-[10px] text-muted/50 mt-6 uppercase tracking-widest">
          Energy Forecasting Intelligence
        </p>
      </div>
    </div>
  );
}
