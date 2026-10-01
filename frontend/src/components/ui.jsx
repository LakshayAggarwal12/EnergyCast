export const Card = ({ title, action, children, className = "" }) => (
  <section className={`bg-surface border border-line rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <h2 className="font-medium text-accent-strong">{title}</h2>
        {action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const tones = {
  ok: "bg-[#10b981]/10 text-ok border-[#10b981]/30",
  warn: "bg-[#f59e0b]/10 text-warn border-[#f59e0b]/30",
  bad: "bg-[#ef4444]/10 text-bad border-[#ef4444]/30",
  info: "bg-surface text-muted border-line",
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
    danger: "bg-surface text-bad border border-[#ef4444]/30 hover:bg-[#ef4444]/10 disabled:opacity-50",
  };
  return <button className={`px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`} {...props} />;
};

export const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="block mb-1 font-medium">{label}</span>
    {children}
    {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
  </label>
);

export const inputClass = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm transition-colors duration-200 focus:border-accent focus:ring-1 focus:ring-accent";

const STATUS_TONE = {
  uploaded: "info", configured: "info", validated: "warn", processed: "ok", published: "ok",
  rejected: "bad", queued: "info", running: "warn", completed: "ok", failed: "bad", trained: "ok",
};
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || "info"}>{status}</Badge>;
