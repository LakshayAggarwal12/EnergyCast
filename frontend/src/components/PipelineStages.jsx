import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const STAGES = [
  { key: "uploaded",   label: "Drop dataset",        icon: "↓" },
  { key: "configured", label: "Configure",            icon: "⚙" },
  { key: "validating", label: "Validating...",       icon: "⏳" },
  { key: "validated",  label: "Validated",            icon: "✓" },
  { key: "processing", label: "Processing...",        icon: "⏳" },
  { key: "processed",  label: "Ready for training",  icon: "◈" },
  { key: "published",  label: "Published",            icon: "★" },
];

export default function PipelineStages({ status, rejected }) {
  const reduced = usePrefersReducedMotion();
  const idx = rejected ? -1 : STAGES.findIndex((s) => s.key === status);
  const publishedAll = status === "published";

  return (
    <div>
      {/* Stage track */}
      <div className="grid border" style={{ borderColor: "var(--color-line)", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` }}>
        {STAGES.map((s, i) => {
          const done    = publishedAll ? true : idx > i;
          const current = s.key === status && !rejected;
          const failed  = rejected && (s.key === "validated" || s.key === "validating");

          const stageColor = failed   ? "var(--color-bad)"
            : current ? "var(--color-now)"
            : done    ? "var(--color-future)"
            : "var(--color-muted)";

          return (
            <div
              key={s.key}
              className="px-3 py-4 relative"
              style={{
                borderRight: i < STAGES.length - 1 ? "1px solid var(--color-line)" : "none",
                background: current ? "rgba(200,168,108,0.05)"
                  : done ? "rgba(122,184,122,0.03)"
                  : "var(--color-surface)",
              }}
            >
              {/* Active indicator bar at top */}
              {current && (
                <motion.div
                  layoutId="pipeline-active"
                  className="absolute top-0 inset-x-0 h-0.5"
                  style={{ background: "var(--color-now)", boxShadow: "0 0 8px var(--color-now-glow)" }}
                />
              )}
              {done && !current && (
                <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: "var(--color-future)", opacity: 0.5 }} />
              )}

              {/* Step number + icon */}
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className="font-mono text-[8px] uppercase"
                  style={{ color: "var(--color-muted)", opacity: 0.6 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ color: stageColor, fontSize: 12 }}>{s.icon}</span>
              </div>

              {/* Label */}
              <div
                className="font-mono text-[10px] uppercase tracking-wide"
                style={{ color: stageColor }}
              >
                {s.label}
              </div>

              {/* Running indicator */}
              {current && (
                <div className="mt-1 flex gap-0.5">
                  <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                  <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                  <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
