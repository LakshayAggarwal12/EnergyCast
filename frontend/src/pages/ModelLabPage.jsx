import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, EmptyState, LoadingDots, MetricTile, Panel } from "../components/ui";
import ModelLab from "../components/ModelLab";
import { fmtNum } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export default function ModelLabPage() {
  const { isAdmin } = useAuth();
  const reduced = usePrefersReducedMotion();
  const [published, setPublished] = useState(null);
  const [adminModels, setAdminModels] = useState(null);
  const [datasetId, setDatasetId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.availableDatasets().then((rows) => {
      setPublished(rows.filter((d) => d.published_model));
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api.listDatasets().then((rows) => {
      const withId = rows.find((d) => d.status === "processed" || d.status === "published") || rows[0];
      if (withId) {
        setDatasetId(withId.id);
        api.comparison(withId.id)
          .then(setAdminModels)
          .catch(() => setAdminModels({ latest_models: [] }));
      } else {
        setAdminModels({ latest_models: [] });
      }
    }).catch((e) => setError(e.message));
  }, [isAdmin]);

  if (error) return <Alert>{error}</Alert>;
  if (!published) return <LoadingDots label="Loading model lab" />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1"
          style={{ color: "var(--color-now)" }}
        >
          Model Lab
        </div>
        <h1
          className="text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          Published instruments
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          The models below are published and available for forecasting. Metrics are from the backend - nothing is fabricated.
        </p>
      </motion.div>

      {/* Published models grid */}
      {published.length === 0 ? (
        <EmptyState
          title="No published models"
          detail="Nothing is available to forecast with until an administrator publishes a training run."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {published.map((d, i) => {
            const m = d.published_model;
            const t = m.test_metrics || {};
            return (
              <motion.div
                key={d.id}
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-surface)",
                }}
              >
                {/* Card header */}
                <div
                  className="flex items-start justify-between gap-3 px-4 py-4"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <div>
                    <div
                      className="font-mono text-[9px] uppercase tracking-[0.22em] mb-1"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {d.energy_type}
                    </div>
                    <div
                      className="text-[16px] font-semibold tracking-tight"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {d.name}
                    </div>
                  </div>
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 border shrink-0"
                    style={{
                      color: "var(--color-future)",
                      borderColor: "rgba(122,184,122,0.35)",
                      background: "rgba(122,184,122,0.06)",
                    }}
                  >
                    {m.model_name}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-0">
                  <div
                    className="px-4 py-3"
                    style={{ borderRight: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}
                  >
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                      Version
                    </div>
                    <div className="font-mono text-sm" style={{ color: "var(--color-ink)" }}>v{m.version}</div>
                  </div>
                  <div
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid var(--color-line)" }}
                  >
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                      Test MAE
                    </div>
                    <div className="font-mono text-sm" style={{ color: t.mae != null ? "var(--color-now)" : "var(--color-muted)" }}>
                      {fmtNum(t.mae)}
                    </div>
                  </div>
                  <div
                    className="px-4 py-3"
                    style={{ borderRight: "1px solid var(--color-line)" }}
                  >
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                      Test RMSE
                    </div>
                    <div className="font-mono text-sm" style={{ color: "var(--color-ink)" }}>
                      {fmtNum(t.rmse)}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                      Status
                    </div>
                    <div
                      className="font-mono text-[10px] uppercase"
                      style={{ color: "var(--color-future)" }}
                    >
                      Published
                    </div>
                  </div>
                </div>

                {/* Action */}
                <div className="px-4 py-3">
                  <Link
                    to={`/forecast?dataset=${d.id}`}
                    className="font-mono text-[10px] uppercase tracking-wider transition-opacity hover:opacity-70"
                    style={{ color: "var(--color-now)" }}
                  >
                    Forecast with this model →
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Admin: training comparison */}
      {isAdmin && adminModels && (
        <Panel
          kicker={datasetId ? `Dataset ${datasetId}` : "Training"}
          title="Latest training run - model comparison"
        >
          <ModelLab
            models={adminModels.latest_models}
            best={adminModels.best_on_validation}
          />
          {datasetId && (
            <Link
              to={`/admin/datasets/${datasetId}/models`}
              className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider transition-opacity hover:opacity-70"
              style={{ color: "var(--color-now)" }}
            >
              Open training lab →
            </Link>
          )}
        </Panel>
      )}
    </div>
  );
}
