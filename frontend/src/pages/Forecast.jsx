import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../services/api";
import { Alert, Button, EmptyState, Field, LoadingDots, inputClass } from "../components/ui";
import { fmtNum, fmtStep } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const toLocalInput = (s) => String(s).replace(" ", "T").slice(0, 16);

/* Step container with number badge */
function Step({ num, title, active, children }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: num * 0.08 }}
      style={{
        border: `1px solid ${active ? "rgba(200,168,108,0.4)" : "var(--color-line)"}`,
        background: active ? "rgba(200,168,108,0.03)" : "var(--color-surface)",
        marginBottom: 16,
        transition: "border-color 0.2s, background 0.2s",
        boxShadow: active ? "0 0 24px rgba(200,168,108,0.06)" : "none",
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      >
        <span
          className="font-mono text-[10px] w-6 h-6 flex items-center justify-center shrink-0"
          style={{
            border: `1px solid ${active ? "var(--color-now)" : "var(--color-line-2)"}`,
            color: active ? "var(--color-now)" : "var(--color-muted)",
            background: active ? "rgba(200,168,108,0.08)" : "transparent",
          }}
        >
          {String(num).padStart(2, "0")}
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: active ? "var(--color-now)" : "var(--color-muted)" }}
        >
          {title}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

/* Feature toggle pill */
function FeaturePill({ group, selected, onToggle }) {
  const locked = group.required || group.selectable === false;
  const active = selected.includes(group.name);
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onToggle(group.name, locked)}
      className="text-left px-3 py-2 transition-all duration-150"
      style={{
        border: `1px solid ${active ? "rgba(122,184,122,0.4)" : "var(--color-line)"}`,
        background: active ? "rgba(122,184,122,0.06)" : "transparent",
        opacity: locked && !active ? 0.5 : 1,
        cursor: locked ? "not-allowed" : "pointer",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px]" style={{ color: active ? "var(--color-future)" : "var(--color-ink)" }}>
          {group.display_name}
        </span>
        {locked && (
          <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            Required
          </span>
        )}
      </div>
      {group.detail && (
        <span className="block mt-0.5 text-[10px]" style={{ color: "var(--color-muted)" }}>
          {group.detail}
        </span>
      )}
    </button>
  );
}

export default function Forecast() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [datasets, setDatasets] = useState(null);
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState("");
  const [horizon, setHorizon] = useState(24);
  const [mode, setMode] = useState("latest");
  const [origin, setOrigin] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.availableDatasets()
      .then((d) => setDatasets(d.filter((x) => x.published_model)))
      .catch((e) => setError(e.message));
  }, []);

  const datasetId = Number(params.get("dataset")) || datasets?.[0]?.id || null;

  useEffect(() => {
    if (!datasetId) return;
    setInfo(null); setInfoError(""); setMode("latest");
    api.forecastInfo(datasetId).then((i) => {
      setInfo(i);
      setHorizon(Math.min(24, i.horizon.max_steps));
      setOrigin(i.backtest.max_origin ? toLocalInput(i.backtest.max_origin) : "");
      setSelectedFeatures((i.features?.defaults || i.features?.groups?.map((g) => g.name)) || []);
    }).catch((e) => setInfoError(e.message));
  }, [datasetId]);

  const stepMin = info?.horizon.step_minutes;
  const presets = useMemo(() => {
    if (!info) return [];
    const max = info.horizon.max_steps;
    return [...new Set([Math.min(6, max), Math.min(12, max), max])];
  }, [info]);

  const toggle = (name, locked) => {
    if (locked) return;
    setSelectedFeatures((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const body = { dataset_id: datasetId, horizon: Number(horizon) };
      if (mode === "backtest") body.origin = `${origin}:00`;
      if (info?.features?.uses_features) body.enabled_features = selectedFeatures;
      const f = await api.createForecast(body);
      navigate(`/forecasts/${f.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (error && !datasets) return <Alert>{error}</Alert>;
  if (!datasets) return <LoadingDots label="Loading forecast explorer" />;
  if (datasets.length === 0) {
    return (
      <EmptyState
        title="Forecasting is not available yet"
        detail="No model has been published. Ask an administrator to train and publish a model."
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-0">
      {/* Page header */}
      <div className="pb-10">
        <div className="font-mono text-[9px] uppercase tracking-[0.28em] mb-2" style={{ color: "var(--color-now)" }}>
          Forecast Explorer
        </div>
        <h1 className="text-[30px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Energy → Features → Horizon → Launch
        </h1>
        <p className="mt-3 text-sm max-w-lg" style={{ color: "var(--color-muted)" }}>
          Configure the time machine. Select your energy dataset, the features to include, and how far into the future to project.
        </p>

        {/* Temporal indicator */}
        <div className="axis-rail mt-6" style={{ maxWidth: 600 }}>
          <span style={{ color: "var(--color-past)" }}>Historical</span>
          <span style={{ color: "var(--color-now)" }} className="now">Configure</span>
          <span className="text-right" style={{ color: "var(--color-future)" }}>Forecast</span>
        </div>
      </div>

      {/* Step 01 - Energy type */}
      <Step num={1} title="Energy type" active={true}>
        <Field label="Published dataset">
          <select
            className={inputClass}
            value={datasetId || ""}
            id="forecast-dataset"
            onChange={(e) => setParams({ dataset: e.target.value })}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.energy_type})
              </option>
            ))}
          </select>
        </Field>
      </Step>

      {/* Loading info */}
      {!info && !infoError && datasetId && (
        <div className="py-2"><LoadingDots label="Reading published model" /></div>
      )}
      {infoError && <Alert>{infoError}</Alert>}

      <AnimatePresence>
        {info && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 02 - Features */}
            <Step num={2} title="Available features" active={!!info}>
              <p className="mb-4 text-sm" style={{ color: "var(--color-muted)" }}>
                Algorithm:{" "}
                <span style={{ color: "var(--color-now)", fontFamily: "var(--font-mono)" }}>
                  {info.model.name}
                </span>
                {info.model.metrics?.test?.mae != null && (
                  <span style={{ color: "var(--color-muted)" }}>
                    {" · "}Test MAE:{" "}
                    <span style={{ color: "var(--color-future)" }}>
                      {fmtNum(info.model.metrics.test.mae)}
                    </span>
                  </span>
                )}
              </p>
              {info.features.uses_features ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {info.features.groups.map((g) => (
                    <FeaturePill
                      key={g.name}
                      group={g}
                      selected={selectedFeatures}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  This model uses only the history of{" "}
                  <span style={{ color: "var(--color-ink)", fontFamily: "var(--font-mono)" }}>
                    {info.dataset.target_column}
                  </span>.
                </p>
              )}
            </Step>

            {/* Step 03 - Horizon */}
            <Step num={3} title="Forecast horizon" active={!!info}>
              <div className="mb-4 flex flex-wrap gap-2">
                {presets.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setHorizon(s)}
                    className="px-3 py-1 font-mono text-[10px] uppercase transition-all"
                    style={{
                      border: `1px solid ${Number(horizon) === s ? "var(--color-now)" : "var(--color-line)"}`,
                      color: Number(horizon) === s ? "var(--color-now)" : "var(--color-muted)",
                      background: Number(horizon) === s ? "rgba(200,168,108,0.08)" : "transparent",
                    }}
                  >
                    {fmtStep(s * stepMin)}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min="1"
                max={info.horizon.max_steps}
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                className="w-full"
                aria-label="Forecast horizon"
              />
              <p className="mt-3 text-sm" style={{ color: "var(--color-ink)" }}>
                Project the next{" "}
                <span style={{ color: "var(--color-future)", fontWeight: 600 }}>
                  {fmtStep(Number(horizon) * stepMin)}
                </span>{" "}
                <span style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                  ({horizon} steps)
                </span>
              </p>
            </Step>

            {/* Step 04 - Origin */}
            <Step num={4} title="Starting point" active={!!info}>
              <div className="space-y-3 text-sm">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "latest"}
                    onChange={() => setMode("latest")}
                    className="mt-1"
                  />
                  <span>
                    <span style={{ color: "var(--color-ink)" }}>Latest observation</span>
                    <span className="block font-mono text-[10px] mt-0.5" style={{ color: "var(--color-muted)" }}>
                      {info.data.last_observation.slice(0, 16)}
                    </span>
                  </span>
                </label>

                <label
                  className={`flex items-start gap-3 ${info.backtest.max_origin ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    disabled={!info.backtest.max_origin}
                    checked={mode === "backtest"}
                    onChange={() => setMode("backtest")}
                    className="mt-1"
                  />
                  <span>
                    <span style={{ color: "var(--color-ink)" }}>Backtest mode</span>
                    <span className="block font-mono text-[10px] mt-0.5" style={{ color: "var(--color-warn)" }}>
                      Starts inside the held-out test period
                    </span>
                  </span>
                </label>

                {mode === "backtest" && (
                  <Field label="Starts after">
                    <input
                      className={inputClass}
                      type="datetime-local"
                      step="3600"
                      required
                      value={origin}
                      min={toLocalInput(info.backtest.min_origin)}
                      max={toLocalInput(info.backtest.max_origin)}
                      onChange={(e) => setOrigin(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </Step>

            {/* Launch */}
            {error && <Alert className="mb-4">{error}</Alert>}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={busy || (mode === "backtest" && !origin)}
                className="text-[11px] px-8 py-3"
              >
                {busy ? "Launching time machine…" : "Engage time machine →"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
