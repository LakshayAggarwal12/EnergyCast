import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { api } from "../services/api";
import { Alert, EmptyState, LoadingDots, MetricTile } from "../components/ui";
import ForecastChart from "../components/ForecastChart";
import { fmtDate, fmtNum } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/* ── Scroll-triggered section ─────────────────────────── */
function Scene({ kicker, title, children, delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = usePrefersReducedMotion();

  return (
    <section
      ref={ref}
      className="min-h-[60vh] py-16"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 28 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55, delay, ease: "easeOut" }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em] mb-2"
          style={{ color: "var(--color-now)" }}
        >
          {kicker}
        </div>
        <h2
          className="text-[26px] font-semibold tracking-tight mb-8"
          style={{ color: "var(--color-ink)", maxWidth: 600 }}
        >
          {title}
        </h2>
        {children}
      </motion.div>
    </section>
  );
}

/* ── Dataset card ─────────────────────────────────────── */
function DatasetCard({ d }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/forecast?dataset=${d.id}`}
      className="block transition-all duration-200"
      style={{
        border: `1px solid ${hovered ? "var(--color-now)" : "var(--color-line)"}`,
        background: hovered ? "rgba(200,168,108,0.04)" : "var(--color-surface)",
        padding: "18px 20px",
        boxShadow: hovered ? "0 0 20px rgba(200,168,108,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] mb-1" style={{ color: "var(--color-muted)" }}>
        {d.energy_type}{d.frequency ? ` · ${d.frequency}` : ""}
      </div>
      <div className="text-[16px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
        {d.name}
      </div>
      <div className="flex items-center gap-2 mt-3 font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
        <span style={{ color: "var(--color-past)" }}>
          {d.start_timestamp ? String(d.start_timestamp).slice(0, 10) : "-"}
        </span>
        <span style={{ color: "var(--color-now)", margin: "0 2px" }}>→</span>
        <span style={{ color: "var(--color-future)" }}>
          {d.end_timestamp ? String(d.end_timestamp).slice(0, 10) : "-"}
        </span>
      </div>
      <div
        className="mt-3 font-mono text-[9px] uppercase tracking-wider"
        style={{ color: hovered ? "var(--color-now)" : "var(--color-muted)" }}
      >
        {hovered ? "Open forecast explorer →" : d.published_model?.model_name || "-"}
      </div>
    </Link>
  );
}

/* ── Main dashboard ───────────────────────────────────── */
export default function UserDashboard() {
  const [datasets, setDatasets] = useState(null);
  const [recent, setRecent] = useState([]);
  const [hero, setHero] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.availableDatasets().then(setDatasets).catch((e) => setError(e.message));
    api.listForecasts(8).then((rows) => {
      setRecent(rows);
      if (rows[0]) api.getForecast(rows[0].id).then(setHero).catch(() => {});
    }).catch(() => {});
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!datasets) return <LoadingDots label="Initialising time machine" />;

  const ready = datasets.filter((d) => d.published_model);
  const primary = ready[0];

  return (
    <div>
      {/* ── Hero: temporal axis ──────────────────────────── */}
      <div className="pt-6 pb-16">
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em] mb-3"
          style={{ color: "var(--color-now)" }}
        >
          01 · Overview
        </div>
        <h1
          className="text-[36px] font-semibold tracking-tight leading-tight"
          style={{ color: "var(--color-ink)", maxWidth: 700 }}
        >
          Energy Intelligence
          <br />
          <span style={{ color: "var(--color-now)" }}>Time Machine</span>
        </h1>
        <p className="mt-4 text-sm max-w-lg" style={{ color: "var(--color-muted)" }}>
          Scroll through the record of energy consumption - from historical observations to the forecast horizon.
        </p>

        {/* Temporal axis display */}
        <div className="mt-10 axis-rail" style={{ maxWidth: 700 }}>
          <span style={{ color: "var(--color-past)" }}>Historical</span>
          <span className="now font-mono text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--color-now)" }}>Today</span>
          <span className="text-right" style={{ color: "var(--color-future)" }}>Forecast</span>
        </div>

        {/* Model metrics quick stats */}
        {primary?.published_model && (
          <div className="mt-8 grid gap-3 sm:grid-cols-4" style={{ maxWidth: 700 }}>
            <MetricTile kicker="Model" value={primary.published_model.model_name} glow />
            <MetricTile kicker="Version" value={`v${primary.published_model.version}`} />
            <MetricTile kicker="Test MAE" value={fmtNum(primary.published_model.test_metrics?.mae)} />
            <MetricTile kicker="Test RMSE" value={fmtNum(primary.published_model.test_metrics?.rmse)} />
          </div>
        )}
      </div>

      {/* ── 01 · Dataset ──────────────────────────────────── */}
      <Scene kicker="01 · Dataset" title="Energy records available for forecasting.">
        {ready.length === 0 ? (
          <EmptyState
            title="No published model yet"
            detail="An administrator must train and publish a model before the time machine can operate."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ready.map((d) => <DatasetCard key={d.id} d={d} />)}
          </div>
        )}
      </Scene>

      {/* ── 02 · Past ─────────────────────────────────────── */}
      <Scene kicker="02 · Past" title="Historical consumption, as measured." delay={0.05}>
        {hero?.history?.length ? (
          <ForecastChart
            history={hero.history}
            values={[]}
            label={hero.target_column || "consumption"}
          />
        ) : (
          <EmptyState
            title="No historical series loaded"
            detail="Generate a forecast to draw the measured record on the time axis."
          />
        )}
      </Scene>

      {/* ── 03 · Present ──────────────────────────────────── */}
      <Scene kicker="03 · Present" title="The boundary between observation and inference." delay={0.05}>
        <div
          className="axis-rail my-6"
          style={{ maxWidth: 600 }}
        >
          <span style={{ color: "var(--color-past)" }}>Past</span>
          <span style={{ color: "var(--color-now)" }} className="now">Today</span>
          <span className="text-right" style={{ color: "var(--color-future)" }}>Future</span>
        </div>
        <p className="max-w-xl text-sm" style={{ color: "var(--color-muted)" }}>
          The origin is the last observed data point
          {hero ? ` (${String(hero.origin).replace("T", " ").slice(0, 16)})` : ""}.
          {" "}Everything after this line is a model output - not a measurement.
        </p>
      </Scene>

      {/* ── 04–05 · Future ────────────────────────────────── */}
      <Scene kicker="04–05 · Future" title="The forecast curve extended beyond today." delay={0.05}>
        {hero?.values?.length ? (
          <ForecastChart
            history={hero.history}
            values={hero.values}
            label={hero.target_column || "consumption"}
          />
        ) : (
          <EmptyState
            title="No forecast curve yet"
            detail="Use the Forecast explorer to project energy consumption into the future."
          />
        )}
        <div className="mt-6">
          <Link
            to="/forecast"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] px-5 py-3 transition-all"
            style={{
              background: "var(--color-future)",
              color: "#081108",
              fontWeight: 600,
            }}
          >
            Open forecast explorer →
          </Link>
        </div>
      </Scene>

      {/* ── 06 · Signals ──────────────────────────────────── */}
      <Scene kicker="06 · Signals" title="Environmental and grid inputs." delay={0.05}>
        {primary ? (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
              The published series is{" "}
              <span style={{ color: "var(--color-ink)" }}>{primary.name}</span>.
              {" "}Temperature, wind and rain time series are available as model features in the Signals view.
            </p>
            <Link
              to="/signals"
              className="font-mono text-[10px] uppercase tracking-wider transition-opacity hover:opacity-70"
              style={{ color: "var(--color-now)" }}
            >
              Open energy signals →
            </Link>
          </>
        ) : (
          <EmptyState title="No signals" detail="Publish a dataset to inspect its model inputs." />
        )}
      </Scene>

      {/* ── 07 · Model ────────────────────────────────────── */}
      <Scene kicker="07 · Model" title="The published instrument powering the forecast." delay={0.05}>
        {primary?.published_model ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MetricTile kicker="Algorithm" value={primary.published_model.model_name} glow />
            <MetricTile kicker="Version" value={`v${primary.published_model.version}`} />
            <MetricTile kicker="Test MAE" value={fmtNum(primary.published_model.test_metrics?.mae)} />
            <MetricTile kicker="Test RMSE" value={fmtNum(primary.published_model.test_metrics?.rmse)} />
          </div>
        ) : (
          <EmptyState title="No published model" detail="An administrator must publish a training run." />
        )}
      </Scene>

      {/* ── 08 · Result ───────────────────────────────────── */}
      <Scene kicker="08 · Result" title="Recent forecast runs." delay={0.05}>
        <Link
          to="/forecast"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] px-5 py-3 mb-8"
          style={{ background: "var(--color-future)", color: "#081108", fontWeight: 600 }}
        >
          Generate new forecast →
        </Link>

        {recent.length > 0 && (
          <div
            className="border"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
          >
            <div
              className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.22em]"
              style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-line)" }}
            >
              Recent runs
            </div>
            <ul>
              {recent.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--color-line)" }}
                >
                  <Link
                    to={`/forecasts/${f.id}`}
                    className="transition-colors hover:opacity-80"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {f.dataset_name}
                    <span
                      className="ml-2 font-mono text-[9px] uppercase"
                      style={{ color: f.is_backtest ? "var(--color-warn)" : "var(--color-future)" }}
                    >
                      {f.is_backtest ? "backtest" : "forecast"}
                    </span>
                  </Link>
                  <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
                    {fmtDate(f.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Scene>
    </div>
  );
}
