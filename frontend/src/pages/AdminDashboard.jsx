import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { Alert, LoadingDots, MetricTile, StatusBadge } from "../components/ui";
import { fmtDate } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function AdminDashboard() {
  const reduced = usePrefersReducedMotion();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingDots label="Loading control room" />;

  const s = data.datasets_by_status || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <div
            className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1"
            style={{ color: "var(--color-now)" }}
          >
            Control Room
          </div>
          <h1
            className="text-[28px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            Dataset pipeline
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
            All numbers are live from the backend. No values are fabricated.
          </p>
        </div>
        <Link
          to="/admin/datasets"
          className="font-mono text-[10px] uppercase tracking-wider px-5 py-2.5 transition-opacity hover:opacity-80"
          style={{ background: "var(--color-future)", color: "#081108", fontWeight: 600 }}
        >
          Ingest CSV →
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="grid gap-3 sm:grid-cols-4"
      >
        <MetricTile kicker="Total datasets"   value={String(data.datasets_total)} glow />
        <MetricTile kicker="Processed"        value={String(s.processed || 0)} />
        <MetricTile kicker="Published"        value={String(s.published  || 0)} />
        <MetricTile kicker="Trained models"   value={String(data.trained_models)} />
      </motion.div>

      {/* Pipeline status bar */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.14 }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-wider mb-3"
          style={{ color: "var(--color-muted)" }}
        >
          Pipeline overview
        </div>
        <div
          className="grid sm:grid-cols-5 border"
          style={{ borderColor: "var(--color-line)" }}
        >
          {[
            { key: "uploaded",   label: "Ingested",    count: s.uploaded   || 0 },
            { key: "validated",  label: "Validated",   count: s.validated  || 0 },
            { key: "processed",  label: "Processed",   count: s.processed  || 0 },
            { key: "published",  label: "Published",   count: s.published  || 0 },
            { key: "trained",    label: "Models",      count: data.trained_models || 0 },
          ].map((item, i) => (
            <div
              key={item.key}
              className="px-4 py-4"
              style={{
                borderRight: i < 4 ? "1px solid var(--color-line)" : "none",
                background: item.count > 0 ? "rgba(122,184,122,0.03)" : "var(--color-surface)",
              }}
            >
              <div
                className="font-mono text-[9px] uppercase tracking-wider mb-2"
                style={{ color: "var(--color-muted)" }}
              >
                {String(i + 1).padStart(2, "0")} · {item.label}
              </div>
              <div
                className="text-[22px] font-semibold"
                style={{ color: item.count > 0 ? "var(--color-future)" : "var(--color-muted)" }}
              >
                {item.count}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent training runs */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-wider mb-3"
          style={{ color: "var(--color-muted)" }}
        >
          Recent training runs
        </div>
        <div style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
          {data.recent_runs.length === 0 ? (
            <div className="px-4 py-6 text-sm" style={{ color: "var(--color-muted)" }}>
              No training runs yet.
            </div>
          ) : (
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th className="text-left">Dataset</th>
                  <th className="text-left">Version</th>
                  <th className="text-left hidden sm:table-cell">Started</th>
                  <th className="text-left">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    style={{ borderTop: "1px solid var(--color-line)" }}
                  >
                    <td style={{ color: "var(--color-ink)" }}>Dataset {r.dataset_id}</td>
                    <td className="font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>v{r.version}</td>
                    <td className="hidden sm:table-cell font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right">
                      <Link
                        to={`/admin/datasets/${r.dataset_id}/models`}
                        className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-now)" }}
                      >
                        View →
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
