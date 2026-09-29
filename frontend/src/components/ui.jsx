export const Card = ({ title, action, children, className = "" }) => (
  <section className={`bg-surface border border-line rounded-lg ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const tones = {
  ok: "bg-green-50 text-ok border-green-200",
  warn: "bg-amber-50 text-warn border-amber-200",
  bad: "bg-red-50 text-bad border-red-200",
  info: "bg-slate-100 text-muted border-line",
};

export const Badge = ({ tone = "info", children }) => (
  <span className={`inline-block px-2 py-0.5 text-xs rounded border ${tones[tone]}`}>{children}</span>
);

export const Alert = ({ tone = "bad", children }) => (
  <div role={tone === "bad" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
);

export const Button = ({ variant = "primary", className = "", ...props }) => {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong disabled:opacity-50",
    secondary: "bg-surface text-ink border border-line hover:bg-bg disabled:opacity-50",
    danger: "bg-surface text-bad border border-red-200 hover:bg-red-50 disabled:opacity-50",
  };
  return <button className={`px-3.5 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed ${styles[variant]} ${className}`} {...props} />;
};

export const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="block mb-1 font-medium">{label}</span>
    {children}
    {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
  </label>
);

export const inputClass = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm";

const STATUS_TONE = {
  uploaded: "info", configured: "info", validated: "warn", processed: "ok", published: "ok",
  rejected: "bad", queued: "info", running: "warn", completed: "ok", failed: "bad", trained: "ok",
};
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || "info"}>{status}</Badge>;
