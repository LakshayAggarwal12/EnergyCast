import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, inputClass } from "../components/ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await register(form.name, form.email, form.password);
      navigate("/dashboard", { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div
      className="workstation flex min-h-screen flex-col items-center justify-center px-4"
      style={{ position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0, right: 0,
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

        <div className="axis-rail mb-8">
          <span className="zone-past">Past</span>
          <span style={{ color: "var(--color-now)" }}>Now</span>
          <span className="zone-future text-right">Future</span>
        </div>

        <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Energi<span style={{ color: "var(--color-now)" }}>Cast</span>
        </h1>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
          Create analyst account
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={set("name")} required id="reg-name" placeholder="Your name" />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={set("email")} required id="reg-email" placeholder="you@example.com" />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required id="reg-password" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy} className="w-full mt-2">
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-sm pt-1" style={{ color: "var(--color-muted)" }}>
            Already registered?{" "}
            <Link to="/login" style={{ color: "var(--color-now)" }} className="hover:opacity-80 transition-opacity">
              Sign in
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
