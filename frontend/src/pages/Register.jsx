import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field, inputClass } from "../components/ui";

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
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
    <div className="mx-auto max-w-sm pt-16 px-4">
      <Card title="Create an account">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} required /></Field>
          <Field label="Email"><input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></Field>
          <Field label="Password" hint="At least 8 characters."><input className={inputClass} type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required /></Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create account"}</Button>
          <p className="text-sm text-muted">Already registered? <Link className="text-accent hover:underline" to="/login">Sign in</Link></p>
        </form>
      </Card>
    </div>
  );
}
