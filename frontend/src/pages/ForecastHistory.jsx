import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, Badge, Card } from "../components/ui";
import { fmtDate, fmtNum, fmtStep } from "../services/format";

export default function ForecastHistory() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.listForecasts(100).then(setItems).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="mx-auto max-w-5xl px-4 py-8"><Alert>{error}</Alert></div>;
  if (!items) return <p className="p-8 text-muted">Loading…</p>;
  const th = "text-left font-medium text-muted px-3 py-2 whitespace-nowrap";
  const td = "px-3 py-2 whitespace-nowrap";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Forecast history</h1>
        <Link to="/forecast" className="text-sm text-accent hover:underline">New forecast</Link>
      </div>
      <Card>
        {items.length === 0 ? <p className="text-sm text-muted">No forecasts yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line"><th className={th}>Created</th><th className={th}>Dataset</th><th className={th}>Model</th><th className={th}>Horizon</th><th className={th}>Starts after</th><th className={th}>Type</th><th className={th}>Backtest MAE</th>{isAdmin && <th className={th}>User</th>}<th className={th} /></tr></thead>
              <tbody>{items.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className={td}>{fmtDate(f.created_at)}</td><td className={td}>{f.dataset_name}</td><td className={td}>{f.model_name}</td>
                  <td className={td}>{fmtStep(f.horizon * f.step_minutes)}</td><td className={td}>{f.origin ? String(f.origin).replace("T", " ").slice(0, 16) : ""}</td>
                  <td className={td}>{f.is_backtest ? <Badge tone="warn">backtest</Badge> : <Badge tone="ok">forecast</Badge>}</td>
                  <td className={`${td} tabular-nums`}>{f.is_backtest ? fmtNum(f.backtest_mae) : "—"}</td>
                  {isAdmin && <td className={td}>{f.user_name}</td>}
                  <td className={td}><Link className="text-accent hover:underline" to={`/forecasts/${f.id}`}>View</Link></td>
                </tr>))}</tbody>
            </table>
          </div>)}
      </Card>
    </div>
  );
}
