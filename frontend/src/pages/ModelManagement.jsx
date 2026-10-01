import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { usePolling } from "../hooks/usePolling";
import { Alert, Button, LoadingDots, MetricTile, Panel, StatusBadge } from "../components/ui";
import ModelLab from "../components/ModelLab";
import { fmtDate, fmtNum } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const MODEL_NAMES = [
  "naive", "seasonal_naive", "seasonal_naive_weekly", "moving_average",
  "arima", "sarima", "linear_regression", "random_forest", "xgboost",
];

export default function ModelManagement() {
  const { id } = useParams();
  const reduced = usePrefersReducedMotion();
  const [data, setData]           = useState(null);
  const [selected, setSelected]   = useState(MODEL_NAMES);
  const [tune, setTune]           = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");
  const [publishingId, setPublishingId] = useState(null);

  const load = useCallback(
    () => api.comparison(id).then(setData).catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => { load(); }, [load]);

  const run   = data?.latest_run;
  const active = run && (run.status === "queued" || run.status === "running");
  usePolling(load, active);

  const publish = async (m) => {
    if (!window.confirm(`Publish "${m.model_name}"?`)) return;
    setError(""); setPublishingId(m.id);
    try { await api.publishModel(m.id); await load(); }
    catch (e) { setError(e.message); }
    finally { setPublishingId(null); }
  };

  const unpublish = async () => {
    if (!window.confirm("Unpublish this dataset?")) return;
    setError("");
    try { await api.unpublishDataset(Number(id)); await load(); }
    catch (e) { setError(e.message); }
  };

  const start = async () => {
    setError(""); setBusy(true);
    try {
      await api.train(Number(id), selected.length === MODEL_NAMES.length ? null : selected, tune);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!data) return error ? <Alert>{error}</Alert> : <LoadingDots label="Loading model lab" />;

  const best  = data.latest_models.find((m) => m.model_name === data.best_on_validation?.model_name);
  const split = run?.split;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          to={`/admin/datasets/${id}`}
          className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-60"
          style={{ color: "var(--color-muted)" }}
        >
          ← Dataset
        </Link>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Model lab
        </h1>
      </motion.div>

      {error && <Alert>{error}</Alert>}

      {/* Published model */}
      {data.published_model && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          style={{
            border: "1px solid rgba(122,184,122,0.35)",
            background: "rgba(122,184,122,0.04)",
            padding: "16px 20px",
            boxShadow: "0 0 24px rgba(122,184,122,0.06)",
          }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-future)" }}>
                Live · Users forecast with this model
              </div>
              <div className="text-[16px] font-semibold" style={{ color: "var(--color-ink)" }}>
                {data.published_model.model_name}
              </div>
              <div className="font-mono text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>
                v{data.published_model.version} · Test MAE {fmtNum(data.published_model.metrics?.test?.mae)}
              </div>
            </div>
            <Button variant="danger" onClick={unpublish}>Unpublish</Button>
          </div>
        </motion.div>
      )}

      {/* Train panel */}
      <Panel
        kicker="Train"
        title="Select instruments"
        action={
          <Button onClick={start} disabled={busy || active || selected.length === 0}>
            {active ? "Training…" : busy ? "Starting…" : "Start training"}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
          {MODEL_NAMES.map((m) => (
            <label key={m} className="flex items-center gap-1.5 font-mono text-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(m)}
                disabled={active}
                onChange={() => setSelected(
                  selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]
                )}
              />
              <span style={{ color: selected.includes(m) ? "var(--color-ink)" : "var(--color-muted)" }}>
                {m}
              </span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tune} disabled={active} onChange={(e) => setTune(e.target.checked)} />
          <span style={{ color: "var(--color-ink)" }}>Validation-only hyperparameter search</span>
        </label>
      </Panel>

      {/* Active run status */}
      {run && (
        <Panel
          kicker={`Run v${run.version}`}
          title={run.stage || run.status}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge status={run.status} />
              {active && (
                <span className="blink font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-now)" }}>
                  ● live
                </span>
              )}
            </div>
          }
        >
          <p className="font-mono text-[10px] mb-3" style={{ color: "var(--color-muted)" }}>
            {fmtDate(run.started_at || run.created_at)}
          </p>
          {run.status === "failed" && <Alert>{run.error_message}</Alert>}
          {split && (
            <div className="grid gap-2 sm:grid-cols-3 mt-3">
              {["train", "validation", "test"].map((k) => (
                <div
                  key={k}
                  className="px-3 py-3"
                  style={{ border: "1px solid var(--color-line)", background: "var(--color-bg)" }}
                >
                  <div
                    className="font-mono text-[9px] uppercase tracking-wider mb-1"
                    style={{ color: k === "test" ? "var(--color-future)" : k === "validation" ? "var(--color-warn)" : "var(--color-past)" }}
                  >
                    {k}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: "var(--color-ink)" }}>
                    {split[k].start.slice(0, 16)} → {split[k].end.slice(0, 16)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Best model metrics */}
      {best && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile kicker="Best val · MAE"  value={fmtNum(best.metrics?.test?.mae)} glow />
          <MetricTile kicker="RMSE"            value={fmtNum(best.metrics?.test?.rmse)} />
          <MetricTile kicker="MAPE"            value={best.metrics?.test?.mape == null ? "n/a" : fmtNum(best.metrics?.test?.mape, 1)} />
        </div>
      )}

      {/* Model comparison */}
      <Panel kicker="Compare" title="Latest training run">
        <ModelLab
          models={data.latest_models}
          best={data.best_on_validation}
          onPublish={publish}
          onUnpublish={unpublish}
          busyId={publishingId}
        />
      </Panel>
    </div>
  );
}
