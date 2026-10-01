import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { Alert, Button, Field, LoadingDots, MetricTile, Panel, StatusBadge, inputClass } from "../components/ui";
import { PreprocessingReport, ValidationReport } from "../components/ReportPanel";
import EdaCharts from "../components/EdaCharts";
import PipelineStages from "../components/PipelineStages";
import { fmtBytes, fmtInt } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

function initialForm(ds) {
  const cfg = ds.config?.timestamp_columns ? ds.config : ds.schema_profile?.suggested_config || {};
  return {
    timestamp_columns:      cfg.timestamp_columns       || [],
    datetime_format:        cfg.datetime_format         || "",
    target_column:          cfg.target_column           || "",
    exogenous_columns:      cfg.exogenous_columns       || [],
    frequency:              ds.config?.frequency        || "",
    modeling_frequency:     ds.config?.modeling_frequency || "",
    forecast_horizon_steps: ds.config?.forecast_horizon_steps || "",
  };
}

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function DatasetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const [ds, setDs]     = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const apply = useCallback((d) => { setDs(d); setForm(initialForm(d)); }, []);
  useEffect(() => {
    api.getDataset(id).then(apply).catch((e) => setError(e.message));
  }, [id, apply]);

  const columns    = ds?.schema_profile?.columns || [];
  const textCols   = useMemo(() => columns.filter((c) => c.kind === "text"),    [columns]);
  const numericCols = useMemo(() => columns.filter((c) => c.kind === "numeric"), [columns]);

  const run = async (label, fn) => {
    setError(""); setBusy(label);
    try { apply(await fn()); } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  if (!ds || !form) {
    return error ? <Alert>{error}</Alert> : <LoadingDots label="Scanning dataset" />;
  }

  const noTimestamp = (ds.schema_profile?.suggested_config?.timestamp_columns || []).length === 0;
  const published   = ds.status === "published";
  const canTrain    = ds.status === "processed" || published;
  const vr          = ds.validation_report;
  const missing     = vr?.checks?.missing_values;

  const save = () => run("save", () => api.configureDataset(ds.id, {
    timestamp_columns:      form.timestamp_columns,
    datetime_format:        form.datetime_format || null,
    target_column:          form.target_column,
    exogenous_columns:      form.exogenous_columns.filter((c) => c !== form.target_column),
    frequency:              form.frequency              || null,
    modeling_frequency:     form.modeling_frequency     || null,
    forecast_horizon_steps: form.forecast_horizon_steps ? Number(form.forecast_horizon_steps) : null,
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb + title */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <Link
            to="/admin/datasets"
            className="font-mono text-[9px] uppercase tracking-wider transition-opacity hover:opacity-60"
            style={{ color: "var(--color-muted)" }}
          >
            ← Datasets
          </Link>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            {ds.name}
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>
            {ds.energy_type} · {ds.original_filename} · {fmtBytes(ds.file_size_bytes)} · {fmtInt(ds.schema_profile?.total_rows)} rows
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <StatusBadge status={ds.status} />
          {canTrain && (
            <Link to={`/admin/datasets/${ds.id}/models`}>
              <Button>Train →</Button>
            </Link>
          )}
        </div>
      </motion.div>

      {/* Pipeline stages */}
      <PipelineStages status={ds.status} rejected={ds.status === "rejected"} />

      {/* Alerts */}
      {published && (
        <Alert tone="warn">
          Published datasets are locked. Unpublish from the model lab to reconfigure.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricTile kicker="Records" value={fmtInt(ds.row_count) || fmtInt(ds.schema_profile?.total_rows) || "-"} />
        <MetricTile
          kicker="Range"
          value={ds.start_timestamp ? String(ds.start_timestamp).slice(0, 10) : "-"}
          sub={ds.end_timestamp ? `→ ${String(ds.end_timestamp).slice(0, 10)}` : undefined}
        />
        <MetricTile kicker="Missing target" value={missing ? `${missing.target_missing_pct_on_full_grid}%` : "-"} />
        <MetricTile kicker="Validation" value={vr ? (vr.passed ? "Passed" : "Failed") : "Pending"} />
      </div>

      {/* Column scanner */}
      <Panel kicker="Scan" title="Detected columns">
        {noTimestamp && (
          <Alert tone="warn">
            No timestamp column was detected. Validation will reject this file.
          </Alert>
        )}
        <div className="mt-3 max-h-56 overflow-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Column</th>
                <th className="text-left">Kind</th>
                <th className="text-left">Examples</th>
              </tr>
            </thead>
            <tbody>
              {columns.slice(0, 40).map((c) => (
                <tr key={c.name}>
                  <td style={{ color: "var(--color-ink)" }}>{c.name}</td>
                  <td style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>{c.kind}</td>
                  <td style={{ color: "var(--color-muted)" }}>{(c.examples || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Configuration */}
      {!noTimestamp && (
        <Panel
          kicker="Configure"
          title="Timestamp, target, exogenous"
          action={
            <Button
              onClick={save}
              disabled={!!busy || published || !form.timestamp_columns.length || !form.target_column}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Timestamp column">
                <div className="flex flex-wrap gap-3 mt-1">
                  {textCols.map((c) => (
                    <label key={c.name} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.timestamp_columns.includes(c.name)}
                        onChange={() => setForm({
                          ...form,
                          timestamp_columns: toggle(form.timestamp_columns, c.name).slice(0, 2),
                        })}
                      />
                      <span style={{ color: "var(--color-ink)" }}>{c.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Target column">
                <select
                  className={inputClass}
                  value={form.target_column}
                  onChange={(e) => setForm({ ...form, target_column: e.target.value })}
                >
                  <option value="">Select…</option>
                  {numericCols.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Exogenous columns">
                <div className="flex flex-wrap gap-3 mt-1">
                  {numericCols.filter((c) => c.name !== form.target_column).map((c) => (
                    <label key={c.name} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.exogenous_columns.includes(c.name)}
                        onChange={() => setForm({ ...form, exogenous_columns: toggle(form.exogenous_columns, c.name) })}
                      />
                      <span style={{ color: "var(--color-ink)" }}>{c.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <div className="space-y-4">
              <Field label="Timestamp format">
                <input className={inputClass} value={form.datetime_format} onChange={(e) => setForm({ ...form, datetime_format: e.target.value })} />
              </Field>
              <Field label="Native frequency">
                <input className={inputClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
              </Field>
              <Field label="Modeling frequency">
                <input className={inputClass} value={form.modeling_frequency} onChange={(e) => setForm({ ...form, modeling_frequency: e.target.value })} />
              </Field>
              <Field label="Horizon (steps)">
                <input className={inputClass} type="number" min="1" value={form.forecast_horizon_steps} onChange={(e) => setForm({ ...form, forecast_horizon_steps: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* Feature toggles */}
          {ds.features.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4 pt-4" style={{ borderTop: "1px solid var(--color-line)" }}>
              {ds.features.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    disabled={!!busy}
                    onChange={() => run("features", () => api.setFeatures(ds.id, [{ name: f.name, enabled: !f.enabled }]))}
                  />
                  <span style={{ color: "var(--color-ink)" }}>{f.display_name}</span>
                </label>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Validate + Process */}
      <Panel
        kicker="Validate"
        title="Quality gates"
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!!busy || published || (ds.status === "uploaded" && !noTimestamp)}
              onClick={() => run("validate", () => api.validateDataset(ds.id))}
            >
              {busy === "validate" ? "Validating…" : "Validate"}
            </Button>
            <Button
              disabled={!!busy || published || !["validated", "processed"].includes(ds.status)}
              onClick={() => run("process", () => api.processDataset(ds.id))}
            >
              {busy === "process" ? "Processing…" : "Process"}
            </Button>
          </div>
        }
      >
        {!ds.validation_report ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Save configuration, then run validation.
          </p>
        ) : (
          <ValidationReport report={ds.validation_report} />
        )}
        {ds.preprocessing_report && (
          <div className="mt-4">
            <PreprocessingReport report={ds.preprocessing_report} />
          </div>
        )}
      </Panel>

      {/* EDA charts */}
      {canTrain && (
        <Panel kicker="EDA" title="Trend, seasonality, distribution, ACF">
          <EdaCharts datasetId={ds.id} />
        </Panel>
      )}

      {/* Delete */}
      <div className="pt-2">
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm(`Delete "${ds.name}"?`)) return;
            try {
              await api.deleteDataset(ds.id);
              navigate("/admin/datasets");
            } catch (e) { setError(e.message); }
          }}
          disabled={!!busy || published}
        >
          Delete dataset
        </Button>
      </div>
    </div>
  );
}
