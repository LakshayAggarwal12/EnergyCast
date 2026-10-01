import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Badge, Card } from "../components/ui";
import ForecastChart from "../components/ForecastChart";
import { fmtNum, fmtStep } from "../services/format";

const stamp = (s) => String(s).replace("T", " ").slice(0, 16);

function toCsv(f) {
  const rows = [
    ["timestamp", "predicted", "actual"],
    ...f.values.map((v) => [stamp(v.timestamp), v.predicted, v.actual ?? ""]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

const MetricBox = ({ label, value, unit = "" }) =>
  value != null ? (
    <div className="bg-[#090a0f] border border-line rounded-lg px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted font-medium">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-ink mt-0.5">
        {typeof value === "number" ? value.toFixed(3) : value}
        {unit && <span className="text-sm text-muted ml-0.5">{unit}</span>}
      </div>
    </div>
  ) : null;

export default function ForecastResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    api.getForecast(id).then(setF).catch((e) => setError(e.message));
  }, [id]);

  const handleHorizonChange = async (newHorizon) => {
    if (!f || isUpdating) return;
    setIsUpdating(true);
    try {
      const body = {
        dataset_id: f.dataset_id,
        horizon: newHorizon,
        enabled_features: f.enabled_features,
      };
      if (f.is_backtest) {
        body.origin = String(f.origin).replace("T", " ").slice(0, 19);
      }
      const newForecast = await api.createForecast(body);
      navigate(`/forecasts/${newForecast.id}`);
    } catch (err) {
      setError("Failed to generate new forecast: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const download = () => {
    if (!f) return;
    const url = URL.createObjectURL(new Blob([toCsv(f)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `forecast-${f.id}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Alert>{error}</Alert>
    </div>
  );

  if (!f) return (
    <div className="mx-auto max-w-6xl px-6 py-10 flex items-center gap-3 text-muted">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Loading forecast data…
    </div>
  );

  const horizonHrs = Math.round(f.horizon * f.step_minutes / 60);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6 animate-fade-in">

      {/* Breadcrumb + Header */}
      <div className="space-y-2">
        <Link to="/forecasts" className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Forecast history
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {f.dataset_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-muted">
              <span className="font-mono text-xs bg-[#090a0f] border border-line px-2 py-0.5 rounded">
                {f.model?.name ?? "—"}
              </span>
              <span>·</span>
              <span>+{horizonHrs}h horizon</span>
              <span>·</span>
              <span>starts after {stamp(f.origin)}</span>
              <Badge tone={f.is_backtest ? "warn" : "ok"}>
                {f.is_backtest ? "backtest" : "forecast"}
              </Badge>
            </div>
          </div>

          {/* Model metadata strip */}
          {f.model && (
            <div className="flex items-center gap-4 text-xs text-muted bg-surface border border-line rounded-lg px-4 py-2.5 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-wider">Model</div>
                <div className="font-mono text-ink font-medium">{f.model.name}</div>
              </div>
              <div className="h-8 w-px bg-line" />
              <div>
                <div className="text-[10px] uppercase tracking-wider">Version</div>
                <div className="text-ink font-medium">v{f.model.version}</div>
              </div>
              <div className="h-8 w-px bg-line" />
              <div>
                <div className="text-[10px] uppercase tracking-wider">Category</div>
                <div className="text-ink font-medium capitalize">{f.model.category?.replace("_", " ")}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Backtest accuracy metrics */}
      {f.is_backtest && f.metrics && (
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest font-medium text-muted">
            Backtest accuracy — {f.metrics.n} comparison points
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricBox label="MAE" value={f.metrics.mae} />
            <MetricBox label="RMSE" value={f.metrics.rmse} />
            <MetricBox label="MAPE" value={f.metrics.mape} unit="%" />
            {f.metrics.r2 != null && <MetricBox label="R²" value={f.metrics.r2} />}
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
            </svg>
            <h2 className="text-sm font-semibold text-ink">Forecast Timeline</h2>
          </div>
          {isUpdating && (
            <span className="flex items-center gap-2 text-xs text-accent">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Regenerating…
            </span>
          )}
        </div>
        <div className={`p-5 transition-opacity duration-300 ${isUpdating ? "opacity-40" : ""}`}>
          <ForecastChart
            history={f.history}
            values={f.values}
            label={f.target_column || "value"}
            onHorizonChange={handleHorizonChange}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Point Values</h2>
          <button
            onClick={download}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-strong transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface border-b border-line">
              <tr>
                <th className="text-left text-[10px] uppercase tracking-widest text-muted px-4 py-2.5 font-medium">Timestamp</th>
                <th className="text-right text-[10px] uppercase tracking-widest text-muted px-4 py-2.5 font-medium">Forecast</th>
                {f.is_backtest && (
                  <>
                    <th className="text-right text-[10px] uppercase tracking-widest text-muted px-4 py-2.5 font-medium">Actual</th>
                    <th className="text-right text-[10px] uppercase tracking-widest text-muted px-4 py-2.5 font-medium">Error</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {f.values.map((v) => (
                <tr key={v.timestamp} className="hover:bg-accent/[0.03] transition-colors tabular-nums">
                  <td className="px-4 py-2 font-mono text-muted">{stamp(v.timestamp)}</td>
                  <td className="px-4 py-2 text-right font-mono text-accent font-medium">{fmtNum(v.predicted)}</td>
                  {f.is_backtest && (
                    <>
                      <td className="px-4 py-2 text-right font-mono text-ink">{fmtNum(v.actual)}</td>
                      <td className={`px-4 py-2 text-right font-mono ${
                        v.actual == null ? "text-muted" :
                        Math.abs(v.predicted - v.actual) / (Math.abs(v.actual) || 1) > 0.1 ? "text-bad" : "text-muted"
                      }`}>
                        {v.actual == null ? "n/a" : fmtNum(v.predicted - v.actual)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
