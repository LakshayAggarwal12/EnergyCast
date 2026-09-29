import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field, inputClass } from "../components/ui";

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
    <div className="mx-auto max-w-sm pt-16 px-4">
      <Card title="Sign in">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
          <p className="text-sm text-muted">No account? <Link className="text-accent hover:underline" to="/register">Create one</Link></p>
        </form>
      </Card>
    </div>
  );
}
