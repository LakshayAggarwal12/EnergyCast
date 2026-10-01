/* Panel: bordered section panel */
export const Panel = ({ kicker, title, action, children, className = "" }) => (
  <section
    className={`border ${className}`}
    style={{
      borderColor: "var(--color-line)",
      background: "var(--color-surface)",
    }}
  >
    {(kicker || title || action) && (
      <header
        className="flex items-end justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      >
        <div>
          {kicker && (
            <div
              className="font-mono text-[9px] uppercase tracking-[0.24em]"
              style={{ color: "var(--color-muted)", marginBottom: title ? 2 : 0 }}
            >
              {kicker}
            </div>
          )}
          {title && (
            <h2 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {title}
            </h2>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

/* Badge: small status pill */
const tones = {
  ok:   { color: "var(--color-ok)",   border: "rgba(122,184,122,0.35)",  bg: "rgba(122,184,122,0.08)"  },
  warn: { color: "var(--color-warn)", border: "rgba(200,168,108,0.35)", bg: "rgba(200,168,108,0.08)" },
  bad:  { color: "var(--color-bad)",  border: "rgba(194,74,58,0.35)",   bg: "rgba(194,74,58,0.08)"   },
  info: { color: "var(--color-muted)",border: "var(--color-line)",      bg: "transparent"             },
};

export const Badge = ({ tone = "info", className = "", children }) => {
  const s = tones[tone] || tones.info;
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${className}`}
      style={{ color: s.color, borderColor: s.border, background: s.bg }}
    >
      {children}
    </span>
  );
};

/* Alert: feedback message box */
export const Alert = ({ tone = "bad", children }) => {
  const s = tones[tone] || tones.bad;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className="border px-3 py-2.5 text-sm"
      style={{ color: s.color, borderColor: s.border, background: s.bg }}
    >
      {children}
    </div>
  );
};

/* Button */
export const Button = ({ variant = "primary", className = "", ...props }) => {
  const styles = {
    primary: {
      background: "var(--color-future)",
      color: "#081108",
      border: "1px solid transparent",
    },
    secondary: {
      background: "transparent",
      color: "var(--color-ink)",
      border: "1px solid var(--color-line)",
    },
    danger: {
      background: "transparent",
      color: "var(--color-bad)",
      border: "1px solid rgba(194,74,58,0.4)",
    },
  };
  return (
    <button
      className={`px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={styles[variant] || styles.primary}
      {...props}
    />
  );
};

/* Field label wrapper */
export const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span
      className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.2em]"
      style={{ color: "var(--color-muted)" }}
    >
      {label}
    </span>
    {children}
    {hint && (
      <span className="mt-1 block text-xs" style={{ color: "var(--color-muted)" }}>
        {hint}
      </span>
    )}
  </label>
);

/* Common input class string for use in JSX */
export const inputClass =
  "w-full border px-3 py-2 text-sm outline-none transition-colors duration-150" +
  " bg-[var(--color-bg)] text-[var(--color-ink)] border-[var(--color-line)]" +
  " focus:border-[var(--color-now)]";

/* Status → badge tone map */
const STATUS_TONE = {
  uploaded:   "info",
  configured: "info",
  validated:  "warn",
  processed:  "ok",
  published:  "ok",
  rejected:   "bad",
  queued:     "info",
  running:    "warn",
  completed:  "ok",
  failed:     "bad",
  trained:    "ok",
};
export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] || "info"}>{status}</Badge>
);

/* Card alias */
export const Card = ({ title, action, children, className = "" }) => (
  <Panel title={title} action={action} className={className}>
    {children}
  </Panel>
);

/* EmptyState */
export function EmptyState({ title, detail }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
      style={{ border: "1px dashed var(--color-line-2)" }}
    >
      {/* Temporal icon */}
      <div className="mb-4 flex items-center gap-2 opacity-30">
        <span style={{ width: 32, height: 1, background: "var(--color-past)", display: "inline-block" }} />
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--color-now)", letterSpacing: "0.22em", textTransform: "uppercase" }}
        >
          ◇
        </span>
        <span style={{ width: 32, height: 1, background: "var(--color-future)", display: "inline-block" }} />
      </div>
      <p className="font-semibold text-sm" style={{ color: "var(--color-ink)" }}>{title}</p>
      {detail && (
        <p className="mt-1.5 text-xs max-w-sm" style={{ color: "var(--color-muted)" }}>{detail}</p>
      )}
    </div>
  );
}

/* LoadingDots */
export function LoadingDots({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-3 py-4" style={{ color: "var(--color-muted)" }}>
      <div className="flex gap-1">
        <span className="load-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
        <span className="load-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
        <span className="load-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

/* PageHeader */
export function PageHeader({ kicker, title, action, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div>
        {kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: "var(--color-now)" }}>
            {kicker}
          </div>
        )}
        {title && (
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight" style={{ color: "var(--color-ink)" }}>
            {title}
          </h1>
        )}
        {children}
      </div>
      {action && <div className="shrink-0 mt-1">{action}</div>}
    </div>
  );
}

/* MetricTile: large number display */
export function MetricTile({ kicker, value, sub, glow = false, className = "" }) {
  return (
    <div
      className={`border p-4 ${className}`}
      style={{
        borderColor: glow ? "rgba(200,168,108,0.25)" : "var(--color-line)",
        background: glow ? "rgba(200,168,108,0.04)" : "var(--color-surface)",
        boxShadow: glow ? "0 0 24px rgba(200,168,108,0.08)" : "none",
      }}
    >
      {kicker && (
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] mb-2" style={{ color: "var(--color-muted)" }}>
          {kicker}
        </div>
      )}
      <div
        className="metric-value"
        style={{ color: glow ? "var(--color-now)" : "var(--color-ink)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
