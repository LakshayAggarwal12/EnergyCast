import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, Badge, EmptyState, LoadingDots } from "../components/ui";
import { fmtDate, fmtNum, fmtStep } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function ForecastHistory() {
  const { isAdmin } = useAuth();
  const reduced = usePrefersReducedMotion();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.listForecasts(100).then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!items) return <LoadingDots label="Loading archive" />;

  const filtered =
    filter === "all" ? items :
    filter === "backtest" ? items.filter((f) => f.is_backtest) :
    items.filter((f) => !f.is_backtest);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: "var(--color-now)" }}>
            Archive
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Forecast history
          </h1>
        </div>
        <Link
          to="/forecast"
          className="font-mono text-[10px] uppercase tracking-wider px-5 py-2.5 transition-opacity hover:opacity-80"
          style={{ background: "var(--color-future)", color: "#081108", fontWeight: 600 }}
        >
          New forecast →
        </Link>
      </motion.div>

      {/* Filter pills */}
      {items.length > 0 && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex gap-1"
          style={{ border: "1px solid var(--color-line)", padding: 4, width: "fit-content" }}
        >
          {["all", "forecast", "backtest"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className="px-4 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all"
              style={{
                background: filter === k ? "var(--color-now)" : "transparent",
                color: filter === k ? "#080908" : "var(--color-muted)",
              }}
            >
              {k}
            </button>
          ))}
        </motion.div>
      )}

      {/* Table */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
      >
        {filtered.length === 0 ? (
          <EmptyState title="No forecasts in this filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th className="text-left">Created</th>
                  <th className="text-left">Dataset</th>
                  <th className="text-left hidden sm:table-cell">Model</th>
                  <th className="text-left">Horizon</th>
                  <th className="text-left">Type</th>
                  <th className="text-right hidden md:table-cell">MAE</th>
                  {isAdmin && <th className="text-left hidden lg:table-cell">User</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => (
                  <motion.tr
                    key={f.id}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: i * 0.025 }}
                    className="font-mono"
                    style={{ borderTop: "1px solid var(--color-line)" }}
                  >
                    <td style={{ color: "var(--color-muted)", fontSize: 11 }}>{fmtDate(f.created_at)}</td>
                    <td style={{ color: "var(--color-ink)", fontSize: 12 }}>{f.dataset_name}</td>
                    <td className="hidden sm:table-cell" style={{ color: "var(--color-muted)", fontSize: 11 }}>{f.model_name}</td>
                    <td style={{ fontSize: 11 }}>{fmtStep(f.horizon * f.step_minutes)}</td>
                    <td>
                      <Badge tone={f.is_backtest ? "warn" : "ok"}>
                        {f.is_backtest ? "backtest" : "forecast"}
                      </Badge>
                    </td>
                    <td className="text-right hidden md:table-cell" style={{ color: "var(--color-muted)", fontSize: 11 }}>
                      {f.is_backtest ? fmtNum(f.backtest_mae) : "-"}
                    </td>
                    {isAdmin && (
                      <td className="hidden lg:table-cell" style={{ color: "var(--color-muted)", fontSize: 11 }}>
                        {f.user_name}
                      </td>
                    )}
                    <td className="text-right">
                      <Link
                        className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-now)" }}
                        to={`/forecasts/${f.id}`}
                      >
                        View →
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
