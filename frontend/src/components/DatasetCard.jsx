import { Link } from "react-router-dom";
import { StatusBadge } from "./ui";
import { fmtBytes, fmtDate, fmtInt } from "../services/format";

export default function DatasetCard({ dataset }) {
  return (
    <Link to={`/admin/datasets/${dataset.id}`} className="block border border-line bg-surface p-4 hover:border-now">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{dataset.name}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{dataset.energy_type} · {fmtBytes(dataset.file_size_bytes)}</div>
        </div>
        <StatusBadge status={dataset.status} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
        <div><dt className="text-muted">Rows</dt><dd>{fmtInt(dataset.row_count) || "-"}</dd></div>
        <div><dt className="text-muted">Hz</dt><dd>{dataset.frequency || "-"}</dd></div>
        <div><dt className="text-muted">Target</dt><dd className="truncate">{dataset.target_column || "-"}</dd></div>
      </dl>
      <div className="mt-2 font-mono text-[10px] text-muted">{fmtDate(dataset.created_at)}</div>
    </Link>
  );
}
