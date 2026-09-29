import { fmtNum } from "../services/format";

const TIPS = {
  MAE: "Mean absolute error, in the target's unit",
  RMSE: "Root mean squared error; penalises large misses",
  MAPE: "Mean absolute percentage error; only defined when no actual value is zero",
};

/** One metric tile. `value` null renders "n/a" (e.g. MAPE undefined). */
export default function MetricsCard({ label, value, unit = "" }) {
  return (
    <div className="border border-line rounded-lg bg-surface px-4 py-3" title={TIPS[label]}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{fmtNum(value, label === "MAPE" ? 1 : 3)}<span className="text-sm text-muted ml-1">{value == null ? "" : unit}</span></div>
    </div>
  );
}
