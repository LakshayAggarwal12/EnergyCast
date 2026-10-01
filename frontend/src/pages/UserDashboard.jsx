import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { Alert } from "../components/ui";
import { fmtDate } from "../services/format";

const MetricPill = ({ label, value, unit = "" }) => (
  value != null ? (
    <div className="bg-[#090a0f] rounded px-2.5 py-1.5 text-center">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-ink tabular-nums">{typeof value === 'number' ? value.toFixed(2) : value}{unit}</div>
    </div>
  ) : null
);

const DatasetCard = ({ d }) => {
  const t = d.published_model?.test_metrics || {};
  const hasMetrics = t.mae != null || t.rmse != null || t.mape != null;
  const dateRange = d.start_timestamp && d.end_timestamp
    ? `${String(d.start_timestamp).slice(0, 10)} → ${String(d.end_timestamp).slice(0, 10)}`
    : null;

  return (
    <article className="bg-surface border border-line rounded-lg p-5 space-y-4 transition-all duration-200 hover:border-accent/40 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink group-hover:text-accent transition-colors">{d.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="text-xs text-muted uppercase tracking-wide">{d.energy_type}</span>
            {d.frequency && (
              <>
                <span className="text-line">·</span>
                <span className="text-xs font-mono text-muted">{d.frequency}</span>
              </>
            )}
            {dateRange && (
              <>
                <span className="text-line">·</span>
                <span className="text-xs text-muted font-mono">{dateRange}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-xs font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded">
          {d.published_model?.model_name}
        </div>
      </div>

      {/* Model info */}
      <div className="text-xs text-muted">
        Model v{d.published_model?.version} &nbsp;·&nbsp; {d.published_model?.category}
        &nbsp;·&nbsp; <span className="text-ok">Published</span>
      </div>

      {/* Metrics */}
      {hasMetrics && (
        <div className="grid grid-cols-3 gap-2">
          <MetricPill label="MAE" value={t.mae} />
          <MetricPill label="RMSE" value={t.rmse} />
          <MetricPill label="MAPE" value={t.mape} unit="%" />
        </div>
      )}

      <Link
        to={`/forecast?dataset=${d.id}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent hover:bg-accent-strong text-white text-sm font-semibold rounded-md transition-all duration-200 active:scale-[0.98]"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
        </svg>
        Generate Forecast
      </Link>
    </article>
  );
};

const ForecastRow = ({ f }) => {
  const horizonHrs = Math.round(f.horizon * f.step_minutes / 60);
  return (
    <li className="py-3 flex items-center justify-between gap-4 group">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-1.5 h-6 rounded-full flex-shrink-0 ${f.is_backtest ? "bg-warn" : "bg-accent"}`} />
        <div className="min-w-0">
          <Link
            to={`/forecasts/${f.id}`}
            className="text-sm font-medium text-ink hover:text-accent transition-colors block truncate"
          >
            {f.dataset_name}
          </Link>
          <div className="text-xs text-muted">
            {f.is_backtest ? "Backtest" : "Forecast"} · +{horizonHrs}h
            {f.is_backtest && f.backtest_mae != null && ` · MAE ${f.backtest_mae.toFixed(2)}`}
          </div>
        </div>
      </div>
      <span className="text-xs text-muted font-mono flex-shrink-0">{fmtDate(f.created_at)}</span>
    </li>
  );
};

export default function UserDashboard() {
  const [datasets, setDatasets] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.availableDatasets().then(setDatasets).catch((e) => setError(e.message));
    api.listForecasts(5).then(setRecent).catch(() => {});
  }, []);

  if (error) return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Alert>{error}</Alert>
    </div>
  );

  if (!datasets) return (
    <div className="mx-auto max-w-5xl px-6 py-10 flex items-center gap-3 text-muted">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Loading forecasting workspace…
    </div>
  );

  const ready = datasets.filter((d) => d.published_model);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Forecasting Workspace
        </h1>
        <p className="text-sm text-muted">
          Select an energy dataset to generate a time-series forecast.
          Models are trained and published by an administrator.
        </p>
      </div>

      {/* Available Datasets */}
      {ready.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg px-6 py-12 text-center">
          <svg className="w-10 h-10 text-muted/40 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p className="text-sm font-medium text-muted">No published models yet</p>
          <p className="text-xs text-muted/70 mt-1">An administrator needs to train and publish a model first.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest text-muted font-medium">
              Available Datasets ({ready.length})
            </h2>
            <Link to="/forecast" className="text-xs text-accent hover:text-accent-strong transition-colors">
              Advanced forecast →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {ready.map((d) => <DatasetCard key={d.id} d={d} />)}
          </div>
        </>
      )}

      {/* Recent Forecasts */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Recent Forecasts</h2>
          <Link className="text-xs text-accent hover:text-accent-strong transition-colors" to="/forecasts">
            View all →
          </Link>
        </div>
        <div className="px-5">
          {recent.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-sm text-muted">No forecasts generated yet.</div>
              <div className="text-xs text-muted/60 mt-1">Choose a dataset above to run your first forecast.</div>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((f) => <ForecastRow key={f.id} f={f} />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
