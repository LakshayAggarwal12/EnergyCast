import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Card } from "../components/ui";
import MetricsCard from "../components/MetricsCard";
import { fmtDate } from "../services/format";

export default function UserDashboard() {
  const [datasets, setDatasets] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.availableDatasets().then(setDatasets).catch((e) => setError(e.message));
    api.listForecasts(5).then(setRecent).catch(() => {});
  }, []);

  if (error) return <div className="mx-auto max-w-5xl px-4 py-8"><Alert>{error}</Alert></div>;
  if (!datasets) return <p className="p-8 text-muted">Loading…</p>;
  const ready = datasets.filter((d) => d.published_model);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Energy forecasting</h1>
        <p className="text-sm text-muted mt-1">Choose an energy dataset to generate a forecast. Models are trained and published by an administrator.</p>
      </div>

      {ready.length === 0 ? (
        <Card title="No forecasting models are available yet">
          <p className="text-sm text-muted">An administrator has to train and publish a model first. Check back once one is published.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ready.map((d) => {
            const t = d.published_model.test_metrics || {};
            return (
              <section key={d.id} className="bg-surface border border-line rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="font-medium">{d.name}</h2>
                  <p className="text-xs text-muted mt-0.5">{d.energy_type} · {d.frequency} data · {String(d.start_timestamp).slice(0, 10)} to {String(d.end_timestamp).slice(0, 10)}</p>
                </div>
                <p className="text-sm">Forecasting with <b>{d.published_model.model_name}</b> <span className="text-muted">(held-out test results)</span></p>
                <div className="grid grid-cols-3 gap-3">
                  <MetricsCard label="MAE" value={t.mae} />
                  <MetricsCard label="RMSE" value={t.rmse} />
                  <MetricsCard label="MAPE" value={t.mape} unit="%" />
                </div>
                <Link to={`/forecast?dataset=${d.id}`} className="inline-block px-3.5 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-strong">Create a forecast</Link>
              </section>
            );
          })}
        </div>
      )}

      <Card title="Recent forecasts" action={<Link className="text-sm text-accent hover:underline" to="/forecasts">View all</Link>}>
        {recent.length === 0 ? <p className="text-sm text-muted">You haven't created a forecast yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {recent.map((f) => (
              <li key={f.id} className="py-2 flex items-center justify-between gap-3">
                <Link className="text-accent hover:underline" to={`/forecasts/${f.id}`}>{f.dataset_name} · next {f.horizon * f.step_minutes / 60} h{f.is_backtest ? " (backtest)" : ""}</Link>
                <span className="text-muted">{fmtDate(f.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
