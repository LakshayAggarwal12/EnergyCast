import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Card, StatusBadge } from "../components/ui";
import { fmtDate } from "../services/format";

const Stat = ({ label, value }) => (
  <div className="bg-surface border border-line rounded-lg px-4 py-3">
    <div className="text-xs text-muted">{label}</div>
    <div className="text-2xl font-semibold tabular-nums">{value}</div>
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.overview().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="mx-auto max-w-6xl px-4 py-8"><Alert>{error}</Alert></div>;
  if (!data) return <p className="p-8 text-muted">Loading…</p>;
  const s = data.datasets_by_status || {};
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Datasets" value={data.datasets_total} />
        <Stat label="Processed" value={s.processed || 0} />
        <Stat label="Published" value={s.published || 0} />
        <Stat label="Trained models" value={data.trained_models} />
      </div>
      <Card title="Recent training runs" action={<Link className="text-sm text-accent hover:underline" to="/admin/datasets">Manage datasets</Link>}>
        {data.recent_runs.length === 0 ? <p className="text-sm text-muted">No training runs yet. Upload a dataset to get started.</p> : (
          <ul className="divide-y divide-line text-sm">
            {data.recent_runs.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <Link className="text-accent hover:underline" to={`/admin/datasets/${r.dataset_id}/models`}>Dataset {r.dataset_id} · run v{r.version}</Link>
                <span className="flex items-center gap-3"><span className="text-muted">{fmtDate(r.created_at)}</span><StatusBadge status={r.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
