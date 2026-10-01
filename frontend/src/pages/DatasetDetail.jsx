import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Button, Card, Field, StatusBadge, inputClass } from "../components/ui";
import { PreprocessingReport, ValidationReport } from "../components/ReportPanel";
import EdaCharts from "../components/EdaCharts";
import { fmtBytes, fmtInt } from "../services/format";

const STEPS = ["uploaded", "configured", "validated", "processed"];

function initialForm(ds) {
  const cfg = ds.config?.timestamp_columns ? ds.config : ds.schema_profile?.suggested_config || {};
  return {
    timestamp_columns: cfg.timestamp_columns || [],
    datetime_format: cfg.datetime_format || "",
    target_column: cfg.target_column || "",
    exogenous_columns: cfg.exogenous_columns || [],
    frequency: ds.config?.frequency || "",
    modeling_frequency: ds.config?.modeling_frequency || "",
    forecast_horizon_steps: ds.config?.forecast_horizon_steps || "",
  };
}

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function DatasetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ds, setDs] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const apply = useCallback((d) => { setDs(d); setForm(initialForm(d)); }, []);
  useEffect(() => { api.getDataset(id).then(apply).catch((e) => setError(e.message)); }, [id, apply]);

  const columns = ds?.schema_profile?.columns || [];
  const textCols = useMemo(() => columns.filter((c) => c.kind === "text"), [columns]);
  const numericCols = useMemo(() => columns.filter((c) => c.kind === "numeric"), [columns]);

  const run = async (label, fn) => {
    setError(""); setBusy(label);
    try { apply(await fn()); } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  if (!ds || !form) return <div className="mx-auto max-w-6xl px-4 py-8">{error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>}</div>;

  const noTimestamp = (ds.schema_profile?.suggested_config?.timestamp_columns || []).length === 0;
  const published = ds.status === "published";
  const stepIndex = published ? STEPS.length - 1 : STEPS.indexOf(ds.status);
  const canTrain = ds.status === "processed" || published;

  const save = () => run("save", () => api.configureDataset(ds.id, {
    timestamp_columns: form.timestamp_columns,
    datetime_format: form.datetime_format || null,
    target_column: form.target_column,
    exogenous_columns: form.exogenous_columns.filter((c) => c !== form.target_column),
    frequency: form.frequency || null,
    modeling_frequency: form.modeling_frequency || null,
    forecast_horizon_steps: form.forecast_horizon_steps ? Number(form.forecast_horizon_steps) : null,
  }));

  const remove = async () => {
    if (!window.confirm(`Delete "${ds.name}" and its stored files and models?`)) return;
    try { await api.deleteDataset(ds.id); navigate("/admin/datasets"); } catch (e) { setError(e.message); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/datasets" className="text-sm text-accent hover:underline">← Datasets</Link>
          <h1 className="text-xl font-semibold mt-1">{ds.name}</h1>
          <p className="text-sm text-muted">{ds.energy_type} · {ds.original_filename} · {fmtBytes(ds.file_size_bytes)} · {fmtInt(ds.schema_profile?.total_rows)} rows</p>
        </div>
        <div className="flex items-center gap-3"><StatusBadge status={ds.status} />
          {canTrain && <Link to={`/admin/datasets/${ds.id}/models`}><Button>Train models</Button></Link>}
        </div>
      </div>

      {ds.status !== "rejected" && (
        <ol className="flex gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={`px-3 py-1 rounded-full border ${i <= stepIndex ? "border-accent text-accent bg-teal-50" : "border-line text-muted"}`}>{s}</li>
          ))}
        </ol>
      )}
      {published && <Alert tone="warn">This dataset is published to users, so its configuration, validation and processing are locked. Unpublish it from the models page to change them.</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card title="Detected columns">
        {noTimestamp && <div className="mb-4"><Alert tone="warn">No date/time column was detected in this file{ds.schema_profile?.csv?.has_header === false ? " and it has no header row" : ""}. Forecasting needs timestamps, so validating it will reject the dataset.</Alert></div>}
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="py-1 pr-4 font-medium">Column</th><th className="py-1 pr-4 font-medium">Kind</th><th className="py-1 pr-4 font-medium">Examples</th></tr></thead>
            <tbody>{columns.slice(0, 40).map((c) => <tr key={c.name} className="border-b border-line last:border-0"><td className="py-1 pr-4">{c.name}</td><td className="py-1 pr-4">{c.kind}</td><td className="py-1 pr-4 text-muted">{c.examples.join(", ")}</td></tr>)}</tbody>
          </table>
        </div>
        {columns.length > 40 && <p className="text-xs text-muted mt-2">Showing 40 of {columns.length} columns.</p>}
      </Card>

      {!noTimestamp && (
        <Card title="Configuration" action={<Button onClick={save} disabled={!!busy || published || !form.timestamp_columns.length || !form.target_column}>{busy === "save" ? "Saving…" : "Save configuration"}</Button>}>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Timestamp column(s)" hint="One combined column, or a date column followed by a time column.">
                <div className="flex flex-wrap gap-3">{textCols.map((c) => (
                  <label key={c.name} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.timestamp_columns.includes(c.name)} onChange={() => setForm({ ...form, timestamp_columns: toggle(form.timestamp_columns, c.name).slice(0, 2) })} />{c.name}</label>
                ))}</div>
              </Field>
              <Field label="Target column" hint="The energy-consumption value to forecast.">
                <select className={inputClass} value={form.target_column} onChange={(e) => setForm({ ...form, target_column: e.target.value })}>
                  <option value="">Select…</option>{numericCols.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Exogenous features" hint="Used as inputs, lagged by the forecast horizon so no future data leaks in.">
                <div className="flex flex-wrap gap-3">{numericCols.filter((c) => c.name !== form.target_column).map((c) => (
                  <label key={c.name} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.exogenous_columns.includes(c.name)} onChange={() => setForm({ ...form, exogenous_columns: toggle(form.exogenous_columns, c.name) })} />{c.name}</label>
                ))}</div>
              </Field>
            </div>
            <div className="space-y-4">
              <Field label="Timestamp format" hint="Leave blank to detect automatically."><input className={inputClass} value={form.datetime_format} onChange={(e) => setForm({ ...form, datetime_format: e.target.value })} placeholder="%d/%m/%Y %H:%M:%S" /></Field>
              <Field label="Native frequency" hint="Blank = infer from the data. A wrong value is rejected at validation."><input className={inputClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="auto (e.g. 1min, 1h)" /></Field>
              <Field label="Modeling frequency" hint="Blank = hourly for sub-hourly data."><input className={inputClass} value={form.modeling_frequency} onChange={(e) => setForm({ ...form, modeling_frequency: e.target.value })} placeholder="auto (e.g. 1h, 1D)" /></Field>
              <Field label="Forecast horizon (steps)" hint="Blank = one day."><input className={inputClass} type="number" min="1" value={form.forecast_horizon_steps} onChange={(e) => setForm({ ...form, forecast_horizon_steps: e.target.value })} placeholder="24" /></Field>
            </div>
          </div>
          {ds.features.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <div className="text-sm font-medium mb-2">Feature groups used in training</div>
              <div className="flex flex-wrap gap-4">{ds.features.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.enabled} disabled={!!busy} onChange={() => run("features", () => api.setFeatures(ds.id, [{ name: f.name, enabled: !f.enabled }]))} />{f.display_name}</label>
              ))}</div>
            </div>
          )}
        </Card>
      )}

      <Card title="Validation and processing" action={
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!!busy || published || (ds.status === "uploaded" && !noTimestamp)} onClick={() => run("validate", () => api.validateDataset(ds.id))}>{busy === "validate" ? "Validating…" : "Validate"}</Button>
          <Button disabled={!!busy || published || !["validated", "processed"].includes(ds.status)} onClick={() => run("process", () => api.processDataset(ds.id))}>{busy === "process" ? "Processing…" : ds.status === "processed" ? "Process again" : "Process"}</Button>
        </div>}>
        {!ds.validation_report ? <p className="text-sm text-muted">{ds.status === "uploaded" && !noTimestamp ? "Save the configuration, then validate." : "Run validation to check timestamps, data types, duplicates, gaps and data quality."}</p> : <ValidationReport report={ds.validation_report} />}
        {ds.preprocessing_report && <div className="mt-5"><div className="text-sm font-medium mb-2">Preprocessing</div><PreprocessingReport report={ds.preprocessing_report} /></div>}
      </Card>

      {canTrain && (
        <Card title="Exploratory Data Analysis (EDA)">
          <EdaCharts datasetId={ds.id} />
        </Card>
      )}

      <div className="flex justify-end"><Button variant="danger" onClick={remove} disabled={!!busy || published}>Delete dataset</Button></div>
    </div>
  );
}
