import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, Panel, inputClass } from "../components/ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const reduced = usePrefersReducedMotion();
  const [name, setName]       = useState(user?.name     || "");
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [error, setError]     = useState("");
  const [ok, setOk]           = useState("");
  const [busy, setBusy]       = useState(false);

  if (!user) return null;

  const save = async (e) => {
    e.preventDefault();
    setError(""); setOk(""); setBusy(true);
    try {
      const body = {};
      if (name.trim() && name.trim() !== user.name) body.name = name.trim();
      if (next) { body.new_password = next; body.current_password = current; }
      if (!Object.keys(body).length) {
        setError("Change your name or password first.");
        setBusy(false);
        return;
      }
      await updateProfile(body);
      setOk("Profile updated.");
      setCurrent(""); setNext("");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-lg space-y-6"
    >
      {/* Header */}
      <div>
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1"
          style={{ color: "var(--color-now)" }}
        >
          Identity
        </div>
        <h1
          className="text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {user.name}
        </h1>
        <p className="font-mono text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>
          {user.email}
          <span
            className="ml-2 border px-1.5 py-0.5 uppercase tracking-wider text-[9px]"
            style={{
              color: user.role === "admin" ? "var(--color-now)" : "var(--color-future)",
              borderColor: user.role === "admin" ? "rgba(200,168,108,0.3)" : "rgba(122,184,122,0.3)",
              background: user.role === "admin" ? "rgba(200,168,108,0.06)" : "rgba(122,184,122,0.06)",
            }}
          >
            {user.role}
          </span>
        </p>
      </div>

      {/* Form */}
      <Panel kicker="Account" title="Update credentials">
        <form onSubmit={save} className="space-y-4">
          <Field label="Display name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              id="profile-name"
            />
          </Field>
          <Field label="Current password">
            <input
              className={inputClass}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              id="profile-current-password"
            />
          </Field>
          <Field label="New password" hint="Leave blank to keep the current password.">
            <input
              className={inputClass}
              type="password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              id="profile-new-password"
            />
          </Field>

          {error && <Alert>{error}</Alert>}
          {ok    && <Alert tone="ok">{ok}</Alert>}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="danger" onClick={logout}>
              Sign out
            </Button>
          </div>
        </form>
      </Panel>
    </motion.div>
  );
}
