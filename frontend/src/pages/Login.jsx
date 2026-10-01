import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, inputClass } from "../components/ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
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
      navigate(
        location.state?.from?.pathname || (u.role === "admin" ? "/admin" : "/dashboard"),
        { replace: true }
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="workstation flex min-h-screen flex-col items-center justify-center px-4"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/* Background temporal timeline */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(90deg, transparent, var(--color-past) 25%, var(--color-now) 50%, var(--color-future) 75%, transparent)",
          opacity: 0.2,
          transform: "translateY(-50%)",
        }}
      />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid var(--color-line)",
          background: "var(--color-surface)",
          padding: "40px 36px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Corner accent */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: 40, height: 40,
          borderTop: "2px solid var(--color-now)",
          borderLeft: "2px solid var(--color-now)",
          opacity: 0.6,
        }} />
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 40, height: 40,
          borderBottom: "2px solid var(--color-future)",
          borderRight: "2px solid var(--color-future)",
          opacity: 0.4,
        }} />

        {/* Temporal axis */}
        <div className="axis-rail mb-8">
          <span className="zone-past">Past</span>
          <span className="now" style={{ color: "var(--color-now)" }}>Now</span>
          <span className="zone-future text-right">Future</span>
        </div>

        {/* Brand */}
        <h1
          className="text-[26px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          Energi<span style={{ color: "var(--color-now)" }}>Cast</span>
        </h1>
        <p
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em]"
          style={{ color: "var(--color-muted)" }}
        >
          Energy Forecasting Workstation
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              id="login-email"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              id="login-password"
            />
          </Field>

          {error && <Alert>{error}</Alert>}

          <Button type="submit" disabled={busy} className="w-full mt-2">
            {busy ? "Authenticating…" : "Enter workstation"}
          </Button>

          <p className="text-sm pt-1" style={{ color: "var(--color-muted)" }}>
            No account?{" "}
            <Link
              to="/register"
              style={{ color: "var(--color-now)" }}
              className="hover:opacity-80 transition-opacity"
            >
              Register
            </Link>
          </p>
        </form>
      </motion.div>

      {/* Version label */}
      <p
        className="absolute bottom-6 font-mono text-[9px] uppercase tracking-[0.22em]"
        style={{ color: "var(--color-muted)", opacity: 0.4 }}
      >
        EnergiCast · Energy Intelligence Platform
      </p>
    </div>
  );
}
