import { Badge, StatusBadge } from "./ui";
import { fmtNum } from "../services/format";

const th = "text-left font-medium text-muted px-3 py-2 whitespace-nowrap";
const td = "px-3 py-2 tabular-nums whitespace-nowrap";

export default function ModelComparison({ models, best, onPublish, onUnpublish, busyId }) {
  if (!models?.length) return <p className="text-sm text-muted">No models trained yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>Model</th><th className={th}>Type</th><th className={th}>Status</th>
            <th className={th}>Validation MAE</th><th className={th}>Test MAE</th><th className={th}>Test RMSE</th>
            <th className={th}>Test MAPE %</th><th className={th}>Train time (s)</th>{onPublish && <th className={th} />}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const isBest = best && best.model_name === m.model_name;
            const t = m.metrics?.test;
            return (
              <tr key={m.id} className={`border-b border-line last:border-0 ${isBest ? "bg-teal-50" : ""}`}>
                <td className={`${td} font-medium`}>{m.model_name} {isBest && <Badge tone="ok">best on validation</Badge>}</td>
                <td className={td}>{m.category.replace("_", " ")}</td>
                <td className={td}><StatusBadge status={m.status} /></td>
                <td className={td}>{fmtNum(m.metrics?.validation?.mae)}</td>
                <td className={td}>{fmtNum(t?.mae)}</td>
                <td className={td}>{fmtNum(t?.rmse)}</td>
                <td className={td} title={t && t.mape == null ? "undefined: actual values contain zeros" : undefined}>{fmtNum(t?.mape, 1)}</td>
                <td className={td}>{fmtNum(m.training_seconds, 1)}</td>
                {onPublish && (
                  <td className={td}>
                    {m.status === "trained" && <button className="text-accent hover:underline disabled:opacity-50" disabled={!!busyId} onClick={() => onPublish(m)}>{busyId === m.id ? "Publishing…" : "Publish"}</button>}
                    {m.status === "published" && <button className="text-bad hover:underline disabled:opacity-50" disabled={!!busyId} onClick={() => onUnpublish(m)}>Unpublish</button>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {models.some((m) => m.status === "failed") && (
        <ul className="mt-3 text-xs text-bad space-y-1">
          {models.filter((m) => m.status === "failed").map((m) => <li key={m.id}>{m.model_name}: {m.error_message}</li>)}
        </ul>
      )}
    </div>
  );
}
