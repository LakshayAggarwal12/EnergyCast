import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import { usePolling } from "../hooks/usePolling";
import { Alert, Button, Card, StatusBadge } from "../components/ui";
import ModelComparison from "../components/ModelComparison";
import MetricsCard from "../components/MetricsCard";
import { fmtDate } from "../services/format";

const MODEL_NAMES = ["naive", "seasonal_naive", "seasonal_naive_weekly", "moving_average", "arima", "sarima", "linear_regression", "random_forest", "xgboost"];

export default function ModelManagement() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(MODEL_NAMES);
  const [tune, setTune] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.comparison(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const run = data?.latest_run;
  const active = run && (run.status === "queued" || run.status === "running");
  usePolling(load, active);

  const [publishingId, setPublishingId] = useState(null);
  const publish = async (m) => {
    if (!window.confirm(`Publish "${m.model_name}"? Users will forecast with it, replacing any model published for this dataset.`)) return;
    setError(""); setPublishingId(m.id);
    try { await api.publishModel(m.id); await load(); } catch (e) { setError(e.message); } finally { setPublishingId(null); }
  };
  const unpublish = async () => {
    if (!window.confirm("Unpublish this dataset? Users will no longer be able to create forecasts. Existing forecast history is kept.")) return;
    setError("");
    try { await api.unpublishDataset(Number(id)); await load(); } catch (e) { setError(e.message); }
  };

  const start = async () => {
    setError(""); setBusy(true);
    try {
      await api.train(Number(id), selected.length === MODEL_NAMES.length ? null : selected, tune);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!data) return <div className="mx-auto max-w-6xl px-4 py-8">{error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>}</div>;

  const best = data.latest_models.find((m) => m.model_name === data.best_on_validation?.model_name);
  const split = run?.split;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <Link to={`/admin/datasets/${id}`} className="text-sm text-accent hover:underline">← Dataset</Link>
        <h1 className="text-xl font-semibold mt-1">Model training</h1>
      </div>
      {error && <Alert>{error}</Alert>}

      {data.published_model && (
        <Card title="Published for users" action={<Button variant="danger" onClick={unpublish}>Unpublish</Button>}>
          <p className="text-sm">Users are forecasting with <b>{data.published_model.model_name}</b> (run v{data.published_model.version}). Test MAE {data.published_model.metrics?.test?.mae?.toFixed(3)}.</p>
          <p className="text-xs text-muted mt-1">While published, the dataset's configuration is locked. You can still train new models and publish a better one.</p>
        </Card>
      )}

      <Card title="Train models" action={<Button onClick={start} disabled={busy || active || selected.length === 0}>{active ? "Training…" : busy ? "Starting…" : "Start training"}</Button>}>
        <div className="flex flex-wrap gap-4">{MODEL_NAMES.map((m) => (
          <label key={m} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selected.includes(m)} disabled={active} onChange={() => setSelected(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m])} />{m}</label>
        ))}</div>
        <div className="mt-4 pt-4 border-t border-line flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="accent-accent" checked={tune} onChange={(e) => setTune(e.target.checked)} disabled={active} />
            Tune hyperparameters
          </label>
          <span className="text-xs text-muted">(Searches for optimal parameters using validation data)</span>
        </div>
        <p className="text-xs text-muted mt-3">Trains on a chronological split. Training runs in the background; this page updates automatically.</p>
      </Card>

      {run && (
        <Card title={`Run v${run.version}`} action={<StatusBadge status={run.status} />}>
          <p className="text-sm text-muted">{run.stage} · started {fmtDate(run.started_at || run.created_at)}{run.finished_at ? ` · finished ${fmtDate(run.finished_at)}` : ""}</p>
          {run.status === "failed" && <div className="mt-3"><Alert>{run.error_message}</Alert></div>}
          {split && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              {["train", "validation", "test"].map((k) => (
                <div key={k} className="border border-line rounded-md px-3 py-2"><dt className="font-medium">{k}</dt><dd className="text-muted text-xs">{split[k].start.slice(0, 16)} → {split[k].end.slice(0, 16)}<br />{split[k].steps.toLocaleString()} steps</dd></div>
              ))}
            </dl>
          )}
          {run.summary && <p className="mt-3 text-xs text-muted">{run.summary.forecast_protocol}. Scored on {run.summary.scored_timestamps_test.toLocaleString()} test timestamps common to all models.</p>}
        </Card>
      )}

      {best && (
        <div>
          <h2 className="font-medium mb-2">Best on validation: {best.model_name} <span className="text-muted font-normal text-sm">(held-out test results)</span></h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricsCard label="MAE" value={best.metrics?.test?.mae} />
            <MetricsCard label="RMSE" value={best.metrics?.test?.rmse} />
            <MetricsCard label="MAPE" value={best.metrics?.test?.mape} unit="%" />
          </div>
        </div>
      )}

      <Card title="Model comparison (latest run)"><ModelComparison models={data.latest_models} best={data.best_on_validation} onPublish={publish} onUnpublish={unpublish} busyId={publishingId} /></Card>
    </div>
  );
}
