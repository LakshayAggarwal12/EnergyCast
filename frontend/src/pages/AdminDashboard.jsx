import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { Alert, StatusBadge } from "../components/ui";
import { fmtDate } from "../services/format";

const StatCard = ({ label, value, sub, accent = false }) => (
  <div className={`bg-surface border rounded-lg px-5 py-4 space-y-1 transition-all duration-200 hover:border-accent/40 ${accent ? "border-accent/30" : "border-line"}`}>
    <div className="text-[11px] uppercase tracking-widest text-muted font-medium">{label}</div>
    <div className={`text-3xl font-bold tabular-nums tracking-tight ${accent ? "text-accent" : "text-ink"}`}>
      {value ?? "—"}
    </div>
    {sub && <div className="text-xs text-muted">{sub}</div>}
  </div>
);

const RunRow = ({ r }) => (
  <li className="py-3 flex items-center justify-between gap-4 group">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${
        r.status === "completed" ? "bg-ok" :
        r.status === "running" ? "bg-warn animate-pulse" :
        r.status === "failed" ? "bg-bad" : "bg-muted"
      }`} />
      <div className="min-w-0">
        <Link
          to={`/admin/datasets/${r.dataset_id}/models`}
          className="text-sm font-medium text-ink hover:text-accent transition-colors truncate block"
        >
          Dataset {r.dataset_id} — Run v{r.version}
        </Link>
        <div className="text-xs text-muted font-mono">{fmtDate(r.created_at)}</div>
      </div>
    </div>
    <StatusBadge status={r.status} />
  </li>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Alert>{error}</Alert>
    </div>
  );

  if (!data) return (
    <div className="mx-auto max-w-7xl px-6 py-10 flex items-center gap-3 text-muted">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Loading system overview…
    </div>
  );

  const s = data.datasets_by_status || {};

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Control Room
          </h1>
          <p className="text-sm text-muted mt-0.5">System-wide status for datasets, models, and training runs.</p>
        </div>
        <Link
          to="/admin/datasets"
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-strong text-white text-sm font-medium rounded-md transition-all duration-200 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Manage Datasets
        </Link>
      </div>

      {/* Stat Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Datasets" value={data.datasets_total} sub="all states" accent />
        <StatCard label="Processed" value={s.processed ?? 0} sub="ready for training" />
        <StatCard label="Published" value={s.published ?? 0} sub="available to users" />
        <StatCard label="Trained Models" value={data.trained_models} sub="across all runs" />
      </div>

      {/* Pipeline status bar */}
      {data.datasets_total > 0 && (
        <div className="bg-surface border border-line rounded-lg px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest text-muted font-medium">Dataset Pipeline</span>
            <span className="text-xs text-muted">{data.datasets_total} total</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
            {[
              { key: "uploaded", color: "bg-muted", label: "Uploaded" },
              { key: "configured", color: "bg-[#3b82f6]", label: "Configured" },
              { key: "validated", color: "bg-warn", label: "Validated" },
              { key: "processed", color: "bg-ok", label: "Processed" },
              { key: "published", color: "bg-accent", label: "Published" },
              { key: "rejected", color: "bg-bad", label: "Rejected" },
            ].map(({ key, color }) => {
              const count = s[key] ?? 0;
              const pct = (count / data.datasets_total) * 100;
              return pct > 0 ? (
                <div
                  key={key}
                  className={`${color} rounded-sm transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${key}: ${count}`}
                />
              ) : null;
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { key: "uploaded", color: "bg-muted", label: "Uploaded" },
              { key: "configured", color: "bg-[#3b82f6]", label: "Configured" },
              { key: "validated", color: "bg-warn", label: "Validated" },
              { key: "processed", color: "bg-ok", label: "Processed" },
              { key: "published", color: "bg-accent", label: "Published" },
              { key: "rejected", color: "bg-bad", label: "Rejected" },
            ].filter(({ key }) => (s[key] ?? 0) > 0).map(({ key, color, label }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                {label}: {s[key]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Training Runs */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Recent Training Runs</h2>
          <Link className="text-xs text-accent hover:text-accent-strong transition-colors" to="/admin/datasets">
            View all →
          </Link>
        </div>
        <div className="px-5">
          {data.recent_runs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-muted text-sm">No training runs yet.</div>
              <div className="text-xs text-muted/60 mt-1">Upload and configure a dataset to start training.</div>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_runs.map((r) => <RunRow key={r.id} r={r} />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
