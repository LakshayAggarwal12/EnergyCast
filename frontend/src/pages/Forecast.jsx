import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Button, Card, Field, inputClass } from "../components/ui";
import { fmtNum, fmtStep } from "../services/format";

const toLocalInput = (s) => String(s).replace(" ", "T").slice(0, 16);

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

  useEffect(() => { api.availableDatasets().then((d) => setDatasets(d.filter((x) => x.published_model))).catch((e) => setError(e.message)); }, []);

  const datasetId = Number(params.get("dataset")) || datasets?.[0]?.id || null;

  useEffect(() => {
    if (!datasetId) return;
    setInfo(null); setInfoError(""); setMode("latest");
    api.forecastInfo(datasetId).then((i) => {
      setInfo(i);
      setHorizon(Math.min(24, i.horizon.max_steps));
      setOrigin(i.backtest.max_origin ? toLocalInput(i.backtest.max_origin) : "");
      setSelectedFeatures(i.features?.groups?.map(g => g.name) || []);
    }).catch((e) => setInfoError(e.message));
  }, [datasetId]);

  const stepMin = info?.horizon.step_minutes;
  const presets = useMemo(() => {
    if (!info) return [];
    const max = info.horizon.max_steps;
    return [...new Set([Math.min(6, max), Math.min(12, max), max])];
  }, [info]);

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

  if (error && !datasets) return <div className="mx-auto max-w-3xl px-4 py-8"><Alert>{error}</Alert></div>;
  if (!datasets) return <p className="p-8 text-muted">Loading…</p>;
  if (datasets.length === 0) {
    return <div className="mx-auto max-w-3xl px-4 py-8"><Card title="Forecasting is not available yet"><p className="text-sm text-muted">No model has been published. An administrator needs to train and publish one first.</p></Card></div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold">New forecast</h1>
      <form onSubmit={submit} className="space-y-6">
        <Card title="1. Energy type">
          <Field label="Dataset">
            <select className={inputClass} value={datasetId || ""} onChange={(e) => setParams({ dataset: e.target.value })}>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.energy_type})</option>)}
            </select>
          </Field>
        </Card>

        {infoError && <Alert>{infoError}</Alert>}
        {!info && !infoError && <p className="text-sm text-muted">Loading model details…</p>}

        {info && (<>
          <Card title="2. Model inputs">
            <p className="text-sm mb-3">Model: <b>{info.model.name}</b> · test MAE {fmtNum(info.model.metrics?.test?.mae)}</p>
            {info.features.uses_features ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Select features to include:</p>
                <div className="flex flex-col gap-2">
                  {info.features.groups.map((g) => (
                    <label key={g.name} className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded hover:bg-slate-50 transition-colors border border-transparent hover:border-line">
                      <input 
                        type="checkbox" 
                        className="mt-1 accent-accent"
                        checked={selectedFeatures.includes(g.name)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedFeatures([...selectedFeatures, g.name]);
                          else setSelectedFeatures(selectedFeatures.filter(f => f !== g.name));
                        }}
                      />
                      <div>
                        <b>{g.display_name}</b> <span className="text-muted">— {g.detail}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">This model forecasts from the recent history of {info.dataset.target_column} alone.</p>
            )}
            <p className="mt-4 text-xs text-muted">Select which exogenous features to include. Omitted features will be held at their historical mean.</p>
          </Card>

          <Card title="3. Forecast horizon">
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((s) => (
                <button type="button" key={s} onClick={() => setHorizon(s)} className={`px-3 py-1.5 rounded-md border text-sm ${Number(horizon) === s ? "border-accent bg-teal-50 text-accent" : "border-line bg-surface"}`}>{fmtStep(s * stepMin)}</button>
              ))}
            </div>
            <div className="mt-4">
              <input type="range" min="1" max={info.horizon.max_steps} value={horizon} onChange={(e) => setHorizon(e.target.value)} className="w-full accent-[var(--color-accent)]" aria-label="Forecast horizon" />
              <p className="text-sm mt-1">Next <b>{fmtStep(Number(horizon) * stepMin)}</b> ({horizon} steps of {fmtStep(stepMin)})</p>
            </div>
            <p className="mt-3 text-xs text-muted">Up to {fmtStep(info.horizon.max_steps * stepMin)} ahead: the models were trained and evaluated for forecasts of that length.</p>
          </Card>

          <Card title="4. Forecast from">
            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-2"><input type="radio" name="mode" checked={mode === "latest"} onChange={() => setMode("latest")} className="mt-1" />
                <span><b>Latest data</b><br /><span className="text-muted">Forecast the period after the last observation ({info.data.last_observation.slice(0, 16)}).</span></span></label>
              <label className={`flex items-start gap-2 ${info.backtest.max_origin ? "" : "opacity-50"}`}><input type="radio" name="mode" disabled={!info.backtest.max_origin} checked={mode === "backtest"} onChange={() => setMode("backtest")} className="mt-1" />
                <span><b>Backtest against real data</b><br /><span className="text-muted">Pretend it is an earlier time in the model's held-out test period and compare the forecast with what actually happened.</span></span></label>
              {mode === "backtest" && (
                <Field label="Forecast starts after" hint={`Between ${info.backtest.min_origin.slice(0, 16)} and ${info.backtest.max_origin.slice(0, 16)}, on the hour.`}>
                  <input className={inputClass} type="datetime-local" step="3600" required value={origin} min={toLocalInput(info.backtest.min_origin)} max={toLocalInput(info.backtest.max_origin)} onChange={(e) => setOrigin(e.target.value)} />
                </Field>
              )}
            </div>
          </Card>

          {error && <Alert>{error}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || (mode === "backtest" && !origin)}>{busy ? "Forecasting…" : "Generate forecast"}</Button>
            <Link to="/forecasts" className="text-sm text-accent hover:underline">Forecast history</Link>
          </div>
        </>)}
      </form>
    </div>
  );
}
