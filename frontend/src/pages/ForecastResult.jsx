import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { Alert, Badge, LoadingDots, MetricTile, Panel } from "../components/ui";
import ForecastChart from "../components/ForecastChart";
import { fmtNum, fmtStep } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const stamp = (s) => String(s).replace("T", " ").slice(0, 16);

function toCsv(f) {
  return [
    ["timestamp", "predicted", "actual"],
    ...f.values.map((v) => [stamp(v.timestamp), v.predicted, v.actual ?? ""]),
  ]
    .map((r) => r.join(","))
    .join("\n");
}

export default function ForecastResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const [f, setF] = useState(null);
  const [maxH, setMaxH] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getForecast(id).then((row) => {
      setF(row);
      api.forecastInfo(row.dataset_id).then((info) => setMaxH(info.horizon.max_steps)).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [id]);

  const handleHorizonChange = async (newHorizon) => {
    if (!f || busy) return;
    setBusy(true);
    try {
      const body = { dataset_id: f.dataset_id, horizon: newHorizon, enabled_features: f.enabled_features };
      if (f.is_backtest) body.origin = String(f.origin).replace("T", " ").slice(0, 19);
      const next = await api.createForecast(body);
      navigate(`/forecasts/${next.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (error) return <Alert>{error}</Alert>;
  if (!f) return <LoadingDots label="Loading forecast" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          to="/forecasts"
          className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-60"
          style={{ color: "var(--color-muted)" }}
        >
          ← History
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {f.dataset_name}
            </h1>
            <p className="mt-1 font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
              {f.model?.name}
              {" · "}
              +{fmtStep(f.horizon * f.step_minutes)}
              {" · after "}
              {stamp(f.origin)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={f.is_backtest ? "warn" : "ok"}>
              {f.is_backtest ? "backtest" : "forecast"}
            </Badge>
            {busy && (
              <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-now)" }}>
                Regenerating…
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Backtest metrics */}
      {f.is_backtest && f.metrics && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="grid gap-3 sm:grid-cols-4"
        >
          <MetricTile kicker="MAE"  value={fmtNum(f.metrics.mae)} glow />
          <MetricTile kicker="RMSE" value={fmtNum(f.metrics.rmse)} />
          <MetricTile kicker="MAPE" value={f.metrics.mape == null ? "n/a" : `${fmtNum(f.metrics.mape, 1)}%`} />
          <MetricTile kicker="R²"   value={fmtNum(f.metrics.r2)} />
        </motion.div>
      )}

      {/* Features used */}
      {f.enabled_features?.length > 0 && (
        <p className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
          Features: {f.enabled_features.map((ft, i) => (
            <span key={ft}>
              {i > 0 && <span style={{ color: "var(--color-line-2)", margin: "0 4px" }}>·</span>}
              <span style={{ color: "var(--color-ink)" }}>{ft}</span>
            </span>
          ))}
        </p>
      )}

      {/* Forecast tunnel chart */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <ForecastChart
          history={f.history}
          values={f.values}
          label={f.target_column || "value"}
          onHorizonChange={handleHorizonChange}
          maxHorizon={maxH}
        />
      </motion.div>

      {error && <Alert>{error}</Alert>}

      {/* Point values table */}
      <Panel
        kicker="Table"
        title="Point values"
        action={
          <button
            type="button"
            className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-70"
            style={{ color: "var(--color-now)" }}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([toCsv(f)], { type: "text/csv" }));
              Object.assign(document.createElement("a"), { href: url, download: `forecast-${f.id}.csv` }).click();
              URL.revokeObjectURL(url);
            }}
          >
            ↓ CSV
          </button>
        }
      >
        <div className="max-h-80 overflow-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Time</th>
                <th className="text-right">Forecast</th>
                {f.is_backtest && <>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Error</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {f.values.map((v) => (
                <tr key={v.timestamp} className="font-mono tabular-nums">
                  <td style={{ color: "var(--color-muted)" }}>{stamp(v.timestamp)}</td>
                  <td className="text-right" style={{ color: "var(--color-future)" }}>{fmtNum(v.predicted)}</td>
                  {f.is_backtest && (
                    <>
                      <td className="text-right" style={{ color: "var(--color-ink)" }}>{fmtNum(v.actual)}</td>
                      <td className="text-right" style={{ color: v.actual == null ? "var(--color-muted)" : Math.abs(v.predicted - v.actual) > 0.1 ? "var(--color-warn)" : "var(--color-ok)" }}>
                        {v.actual == null ? "n/a" : fmtNum(v.predicted - v.actual)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
