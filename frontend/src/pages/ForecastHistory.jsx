import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, Badge } from "../components/ui";
import { fmtDate, fmtNum, fmtStep } from "../services/format";

const TYPE_BADGE = {
  backtest: { tone: "warn", label: "Backtest" },
  forecast: { tone: "ok", label: "Forecast" },
};

export default function ForecastHistory() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'forecast' | 'backtest'

  useEffect(() => {
    api.listForecasts(100).then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Alert>{error}</Alert>
    </div>
  );

  if (!items) return (
    <div className="mx-auto max-w-6xl px-6 py-10 flex items-center gap-3 text-muted">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Loading forecast history…
    </div>
  );

  const filtered = filter === "all" ? items :
    filter === "backtest" ? items.filter(f => f.is_backtest) :
    items.filter(f => !f.is_backtest);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Forecast History</h1>
          <p className="text-sm text-muted mt-0.5">
            {items.length} record{items.length !== 1 ? "s" : ""}
            {isAdmin ? " (system-wide)" : " in your account"}
          </p>
        </div>
        <Link
          to="/forecast"
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-strong text-white text-sm font-semibold rounded-md transition-all duration-200 active:scale-95"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
          </svg>
          New Forecast
        </Link>
      </div>

      {/* Filter tabs */}
      {items.length > 0 && (
        <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-1 w-fit">
          {[
            { key: "all", label: `All (${items.length})` },
            { key: "forecast", label: `Forecasts (${items.filter(f => !f.is_backtest).length})` },
            { key: "backtest", label: `Backtests (${items.filter(f => f.is_backtest).length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-150 ${
                filter === key
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-muted/40 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className="text-sm text-muted">No {filter !== "all" ? filter : ""} forecasts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3">Created</th>
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3">Dataset</th>
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3 hidden sm:table-cell">Model</th>
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3">Horizon</th>
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3 hidden md:table-cell">Origin</th>
                  <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3">Type</th>
                  <th className="text-right text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3 hidden md:table-cell">MAE</th>
                  {isAdmin && <th className="text-left text-[11px] uppercase tracking-widest font-medium text-muted px-4 py-3 hidden lg:table-cell">User</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-[#14b8a6]/[0.03] transition-colors group">
                    <td className="px-4 py-3 text-muted font-mono text-xs whitespace-nowrap">{fmtDate(f.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{f.dataset_name}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap hidden sm:table-cell">
                      <span className="font-mono text-xs bg-[#090a0f] px-1.5 py-0.5 rounded">{f.model_name}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink whitespace-nowrap">{fmtStep(f.horizon * f.step_minutes)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap hidden md:table-cell">
                      {f.origin ? String(f.origin).replace("T", " ").slice(0, 16) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={f.is_backtest ? "warn" : "ok"}>
                        {f.is_backtest ? "backtest" : "forecast"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-right hidden md:table-cell text-muted">
                      {f.is_backtest && f.backtest_mae != null ? fmtNum(f.backtest_mae) : "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-xs text-muted hidden lg:table-cell">{f.user_name}</td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Link
                        className="text-xs text-accent hover:text-accent-strong font-medium transition-colors opacity-0 group-hover:opacity-100"
                        to={`/forecasts/${f.id}`}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
