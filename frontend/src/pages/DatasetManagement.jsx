import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { Alert, EmptyState, LoadingDots, StatusBadge } from "../components/ui";
import FileUpload from "../components/FileUpload";
import { fmtBytes, fmtInt } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

function DatasetRow({ dataset: d }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="w-full text-left transition-all duration-150"
      style={{
        border: `1px solid ${hovered ? "rgba(200,168,108,0.35)" : "var(--color-line)"}`,
        background: hovered ? "rgba(200,168,108,0.03)" : "var(--color-surface)",
        padding: "16px 20px",
        display: "block",
        boxShadow: hovered ? "0 0 16px rgba(200,168,108,0.06)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/admin/datasets/${d.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
            {d.energy_type}
          </div>
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            {d.name}
          </div>
          <div className="font-mono text-[10px] mt-2" style={{ color: "var(--color-muted)" }}>
            {d.original_filename} · {fmtBytes(d.file_size_bytes)} · {fmtInt(d.schema_profile?.total_rows)} rows
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>
      {(d.start_timestamp || d.end_timestamp) && (
        <div className="flex items-center gap-2 mt-3 font-mono text-[10px]">
          <span style={{ color: "var(--color-past)" }}>{String(d.start_timestamp || "").slice(0, 10) || "-"}</span>
          <span style={{ color: "var(--color-now)" }}>→</span>
          <span style={{ color: "var(--color-future)" }}>{String(d.end_timestamp || "").slice(0, 10) || "-"}</span>
        </div>
      )}
    </button>
  );
}

export default function DatasetManagement() {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () => api.listDatasets().then(setDatasets).catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => { load(); }, [load]);

  const upload = async (file, name, energyType) => {
    const ds = await api.uploadDataset(file, name, energyType);
    navigate(`/admin/datasets/${ds.id}`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.28em] mb-1" style={{ color: "var(--color-now)" }}>
          Ingest
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Dataset intake
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          Drop a CSV to begin the scanning pipeline. The system will detect timestamps, columns, and data quality automatically.
        </p>
      </motion.div>

      {/* Upload */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
      >
        <div
          className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.24em]"
          style={{ color: "var(--color-now)", borderBottom: "1px solid var(--color-line)" }}
        >
          01 · CSV intake
        </div>
        <div className="p-4">
          <FileUpload onUpload={upload} />
        </div>
      </motion.div>

      {error && <Alert>{error}</Alert>}

      {/* Dataset list */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.16 }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-wider mb-3"
          style={{ color: "var(--color-muted)" }}
        >
          Archives
        </div>
        {datasets === null ? (
          <LoadingDots label="Loading datasets" />
        ) : datasets.length === 0 ? (
          <EmptyState
            title="No datasets yet"
            detail="Upload a CSV to begin the scan."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datasets.map((d, i) => (
              <motion.div
                key={d.id}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <DatasetRow dataset={d} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
