import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmtNum } from "../services/format";
import { Badge, StatusBadge } from "./ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const CATEGORY_COLORS = {
  baseline:       { bar: "var(--color-past)",   glow: "rgba(92,107,94,0.3)"  },
  statistical:    { bar: "var(--color-warn)",    glow: "rgba(200,168,108,0.3)" },
  ml:             { bar: "var(--color-future)",  glow: "rgba(122,184,122,0.3)" },
  default:        { bar: "var(--color-muted)",   glow: "rgba(107,125,108,0.2)" },
};

function getColor(m) {
  return CATEGORY_COLORS[m.category] || CATEGORY_COLORS.default;
}

export default function ModelLab({ models = [], best, onPublish, onUnpublish, busyId }) {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(null);

  const scored = useMemo(
    () => models.filter((m) => m.metrics?.validation?.mae != null || m.metrics?.test?.mae != null),
    [models],
  );
  const maxMae = Math.max(
    0.0001,
    ...scored.map((m) => m.metrics?.validation?.mae || m.metrics?.test?.mae || 0),
  );

  if (!models.length) {
    return (
      <p className="font-mono text-sm py-4" style={{ color: "var(--color-muted)" }}>
        No trained models yet. Start a training run to populate the lab.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bar chart visualization */}
      <div>
        <div
          className="font-mono text-[9px] uppercase tracking-wider mb-3"
          style={{ color: "var(--color-muted)" }}
        >
          Validation MAE comparison - lower is better
        </div>
        <div
          className="flex items-end gap-1.5 px-3 pb-3 pt-8"
          style={{
            border: "1px solid var(--color-line)",
            background: "var(--color-bg)",
            height: 160,
          }}
        >
          {models.map((m, i) => {
            const mae    = m.metrics?.validation?.mae ?? m.metrics?.test?.mae;
            const h      = mae == null ? 8 : Math.max(12, 120 * (1 - mae / maxMae) + 12);
            const isBest = best && best.model_name === m.model_name;
            const col    = getColor(m);
            const isOpen = open === m.id;

            return (
              <motion.button
                key={m.id}
                type="button"
                onClick={() => setOpen(isOpen ? null : m.id)}
                className="relative flex-1 transition-all duration-200"
                style={{
                  height: h,
                  background: isOpen || isBest
                    ? `${col.bar}25`
                    : `${col.bar}14`,
                  borderTop: `2px solid ${col.bar}`,
                  boxShadow: isOpen ? `0 0 12px ${col.glow}` : "none",
                  cursor: "pointer",
                }}
                title={m.model_name}
                whileHover={{ scaleY: 1.04 }}
                transition={{ duration: 0.15 }}
              >
                {isBest && (
                  <span
                    className="absolute -top-5 inset-x-0 text-center font-mono text-[7px] uppercase"
                    style={{ color: "var(--color-now)" }}
                  >
                    ★ best
                  </span>
                )}
                <span
                  className="absolute inset-x-0 -top-4 text-center truncate font-mono text-[8px] uppercase"
                  style={{ color: "var(--color-muted)" }}
                >
                  {m.model_name.replace(/_/g, " ")}
                </span>
              </motion.button>
            );
          })}
        </div>
        <div
          className="font-mono text-[9px] pt-1"
          style={{ color: "var(--color-muted)", opacity: 0.7 }}
        >
          Bar height = inverse validation MAE from API. Click a bar for details.
        </div>
      </div>

      {/* Model list */}
      <div style={{ border: "1px solid var(--color-line)" }}>
        {models.map((m, i) => {
          const t      = m.metrics?.test;
          const isBest = best && best.model_name === m.model_name;
          const isOpen = open === m.id;
          const col    = getColor(m);

          return (
            <div key={m.id} style={{ borderTop: i > 0 ? "1px solid var(--color-line)" : "none" }}>
              {/* Row header */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                style={{
                  background: isOpen ? "var(--color-surface-2)" : "transparent",
                }}
                onClick={() => setOpen(isOpen ? null : m.id)}
              >
                {/* Category indicator */}
                <span
                  style={{
                    width: 3,
                    height: 20,
                    background: col.bar,
                    flexShrink: 0,
                    boxShadow: `0 0 8px ${col.glow}`,
                  }}
                />
                <span
                  className="font-medium text-sm flex-1 truncate"
                  style={{ color: "var(--color-ink)" }}
                >
                  {m.model_name}
                </span>
                <StatusBadge status={m.status} />
                {isBest && <Badge tone="ok">best</Badge>}
                <span
                  className="ml-auto font-mono text-[10px] hidden sm:block"
                  style={{ color: "var(--color-muted)" }}
                >
                  MAE {fmtNum(t?.mae)} · RMSE {fmtNum(t?.rmse)}
                </span>
                <span
                  className="font-mono text-[9px]"
                  style={{ color: "var(--color-muted)" }}
                >
                  {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduced ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-4"
                      style={{ borderTop: "1px solid var(--color-line)", background: "var(--color-surface-2)" }}
                    >
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Version</div>
                        <div style={{ color: "var(--color-ink)" }}>{m.version}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Category</div>
                        <div style={{ color: col.bar }}>{m.category}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Val MAE</div>
                        <div style={{ color: "var(--color-ink)" }}>{fmtNum(m.metrics?.validation?.mae)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>Train time</div>
                        <div style={{ color: "var(--color-ink)" }}>{m.training_seconds ? `${fmtNum(m.training_seconds, 1)}s` : "-"}</div>
                      </div>

                      {/* Publish / Unpublish actions */}
                      {onPublish && m.status === "trained" && (
                        <button
                          type="button"
                          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                          disabled={!!busyId}
                          onClick={() => onPublish(m)}
                          style={{
                            border: "1px solid rgba(122,184,122,0.4)",
                            color: "var(--color-future)",
                            background: "rgba(122,184,122,0.06)",
                          }}
                        >
                          {busyId === m.id ? "Publishing…" : "Publish →"}
                        </button>
                      )}
                      {onUnpublish && m.status === "published" && (
                        <button
                          type="button"
                          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                          disabled={!!busyId}
                          onClick={() => onUnpublish(m)}
                          style={{
                            border: "1px solid rgba(194,74,58,0.4)",
                            color: "var(--color-bad)",
                            background: "rgba(194,74,58,0.06)",
                          }}
                        >
                          Unpublish
                        </button>
                      )}

                      {m.error_message && (
                        <p
                          className="sm:col-span-4 text-xs"
                          style={{ color: "var(--color-bad)" }}
                        >
                          {m.error_message}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
