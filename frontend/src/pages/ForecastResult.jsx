import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Badge, Card } from "../components/ui";
import ForecastChart from "../components/ForecastChart";
import MetricsCard from "../components/MetricsCard";
import { fmtNum, fmtStep } from "../services/format";

const stamp = (s) => String(s).replace("T", " ").slice(0, 16);

function toCsv(f) {
  const rows = [["timestamp", "predicted", "actual"], ...f.values.map((v) => [stamp(v.timestamp), v.predicted, v.actual ?? ""])];
  return rows.map((r) => r.join(",")).join("\n");
}

export default function ForecastResult() {
  const { id } = useParams();
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.getForecast(id).then(setF).catch((e) => setError(e.message)); }, [id]);

  if (error) return <div className="mx-auto max-w-5xl px-4 py-8"><Alert>{error}</Alert></div>;
  if (!f) return <p className="p-8 text-muted">Loading…</p>;

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(f)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `forecast-${f.id}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <Link to="/forecasts" className="text-sm text-accent hover:underline">← Forecast history</Link>
        <h1 className="text-xl font-semibold mt-1">{f.dataset_name}: next {fmtStep(f.horizon * f.step_minutes)}</h1>
        <p className="text-sm text-muted mt-1 flex flex-wrap items-center gap-2">
          <span>Model {f.model?.name}</span><span>·</span><span>starts after {stamp(f.origin)}</span>
          {f.is_backtest ? <Badge tone="warn">backtest</Badge> : <Badge tone="ok">forecast</Badge>}
        </p>
      </div>

      {f.is_backtest && f.metrics && (
        <div>
          <h2 className="font-medium mb-2">Accuracy of this forecast <span className="text-muted font-normal text-sm">(compared with real observations, {f.metrics.n} points)</span></h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricsCard label="MAE" value={f.metrics.mae} />
            <MetricsCard label="RMSE" value={f.metrics.rmse} />
            <MetricsCard label="MAPE" value={f.metrics.mape} unit="%" />
          </div>
        </div>
      )}

      <Card title="Forecast"><ForecastChart history={f.history} values={f.values} label={f.target_column || "value"} /></Card>

      <Card title="Values" action={<button onClick={download} className="text-sm text-accent hover:underline">Download CSV</button>}>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="py-1 pr-4 font-medium">Time</th><th className="py-1 pr-4 font-medium">Forecast</th>{f.is_backtest && <><th className="py-1 pr-4 font-medium">Actual</th><th className="py-1 pr-4 font-medium">Error</th></>}</tr></thead>
            <tbody>{f.values.map((v) => (
              <tr key={v.timestamp} className="border-b border-line last:border-0 tabular-nums">
                <td className="py-1 pr-4">{stamp(v.timestamp)}</td><td className="py-1 pr-4">{fmtNum(v.predicted)}</td>
                {f.is_backtest && <><td className="py-1 pr-4">{fmtNum(v.actual)}</td><td className="py-1 pr-4">{v.actual == null ? "n/a" : fmtNum(v.predicted - v.actual)}</td></>}
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
