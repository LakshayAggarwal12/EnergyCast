import { Link } from "react-router-dom";
import { StatusBadge } from "./ui";
import { fmtBytes, fmtDate, fmtInt } from "../services/format";

export default function DatasetCard({ dataset }) {
  return (
    <Link to={`/admin/datasets/${dataset.id}`} className="block bg-surface border border-line rounded-lg p-4 hover:border-accent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{dataset.name}</div>
          <div className="text-xs text-muted mt-0.5">{dataset.energy_type} · {dataset.original_filename} · {fmtBytes(dataset.file_size_bytes)}</div>
        </div>
        <StatusBadge status={dataset.status} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted">Rows</dt><dd>{fmtInt(dataset.row_count) || "—"}</dd></div>
        <div><dt className="text-muted">Frequency</dt><dd>{dataset.frequency || "—"}</dd></div>
        <div><dt className="text-muted">Target</dt><dd className="truncate">{dataset.target_column || "—"}</dd></div>
      </dl>
      <div className="mt-2 text-xs text-muted">Uploaded {fmtDate(dataset.created_at)}</div>
    </Link>
  );
}
