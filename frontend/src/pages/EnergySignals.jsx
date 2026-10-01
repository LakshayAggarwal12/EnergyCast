import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { Alert, EmptyState, LoadingDots, Panel } from "../components/ui";
import ForecastChart from "../components/ForecastChart";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

function classify(name) {
  const n = name.toLowerCase();
  if (/(temp)/.test(n))                         return { label: "Temperature",         color: "var(--color-warn)" };
  if (/(wind)/.test(n))                         return { label: "Wind",                color: "var(--color-future)" };
  if (/(rain|precip)/.test(n))                  return { label: "Rain",                color: "#6ab4d4" };
  if (/(volt|power|load|consum|intens|meter)/.test(n)) return { label: "Electricity", color: "var(--color-now)" };
  return { label: "Other input", color: "var(--color-muted)" };
}

export default function EnergySignals() {
  const reduced = usePrefersReducedMotion();
  const [datasets, setDatasets] = useState(null);
  const [info, setInfo]         = useState(null);
  const [hero, setHero]         = useState(null);
  const [error, setError]       = useState("");
  const [id, setId]             = useState(null);

  useEffect(() => {
    api.availableDatasets().then((rows) => {
      const ready = rows.filter((d) => d.published_model);
      setDatasets(ready);
      setId(ready[0]?.id || null);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!id) return;
    setInfo(null); setHero(null);
    api.forecastInfo(id).then(setInfo).catch((e) => setError(e.message));
    api.listForecasts(20).then((rows) => {
      const hit = rows.find((r) => r.dataset_id === id);
      if (hit) api.getForecast(hit.id).then(setHero).catch(() => {});
    }).catch(() => {});
  }, [id]);

  if (error)    return <Alert>{error}</Alert>;
  if (!datasets) return <LoadingDots label="Loading signals" />;
  if (datasets.length === 0) {
    return (
      <EmptyState
        title="No published datasets"
        detail="Signals appear after an administrator publishes a model."
      />
    );
  }

  const groups = info?.features?.groups || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: "var(--color-now)" }}>
          Energy Signals
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Shared time axis, real series only
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          Historical consumption and model inputs for the selected dataset. Weather time series are displayed as feature metadata - the forecast API stores the target column only.
        </p>
      </motion.div>

      {/* Dataset selector */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <label className="block max-w-sm text-sm">
          <span
            className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.2em]"
            style={{ color: "var(--color-muted)" }}
          >
            Dataset
          </span>
          <select
            className="w-full border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              borderColor: "var(--color-line)",
            }}
            value={id || ""}
            onChange={(e) => setId(Number(e.target.value))}
            id="signals-dataset"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </motion.div>

      {/* Electricity consumption chart */}
      <Panel
        kicker="Electricity"
        title={info?.dataset?.target_column || "Consumption"}
      >
        {hero?.history?.length ? (
          <ForecastChart
            history={hero.history}
            values={hero.values || []}
            label={hero.target_column || "value"}
          />
        ) : (
          <EmptyState
            title="No forecast series for this dataset yet"
            detail="Generate a forecast to plot the historical consumption and prediction on one axis."
          />
        )}
      </Panel>

      {/* Weather / exogenous signals */}
      <Panel kicker="Weather / Exogenous" title="Model inputs from the API">
        <EmptyState
          title="Temperature, wind and rain are not returned as time series"
          detail="The forecast endpoint stores only the target column. The feature plan below lists the inputs the published model uses - these are real names from the API, not invented values."
        />

        {groups.length > 0 && (
          <div
            className="mt-4 border"
            style={{ borderColor: "var(--color-line)" }}
          >
            {/* Signal axis header */}
            <div
              className="grid font-mono text-[9px] uppercase tracking-wider px-4 py-2"
              style={{
                gridTemplateColumns: "1fr auto",
                color: "var(--color-muted)",
                borderBottom: "1px solid var(--color-line)",
              }}
            >
              <span>Signal</span>
              <span>Category</span>
            </div>

            {groups.map((g, i) => {
              const cat = classify(g.name);
              return (
                <motion.div
                  key={g.name}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--color-line)" : "none",
                  }}
                >
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                      {g.display_name}
                    </div>
                    {g.detail && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {g.detail}
                      </div>
                    )}
                  </div>
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider shrink-0 px-2 py-0.5 border"
                    style={{
                      color: cat.color,
                      borderColor: `${cat.color}40`,
                      background: `${cat.color}10`,
                    }}
                  >
                    {cat.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
