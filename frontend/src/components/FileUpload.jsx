import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Alert, Button, Field, inputClass } from "./ui";
import { fmtBytes } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const PIPELINE_STEPS = [
  "Drop dataset",
  "Scanning…",
  "Timestamp detected",
  "Target detected",
  "Data validated",
  "Ready for training",
];

export default function FileUpload({ onUpload }) {
  const inputRef   = useRef(null);
  const reduced    = usePrefersReducedMotion();
  const [file, setFile]               = useState(null);
  const [name, setName]               = useState("");
  const [energyType, setEnergyType]   = useState("electricity");
  const [busy, setBusy]               = useState(false);
  const [step, setStep]               = useState(0);
  const [error, setError]             = useState("");
  const [over, setOver]               = useState(false);

  const take = (f) => {
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.csv$/i, ""));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!file)                                    return setError("Drop or choose a CSV first.");
    if (!file.name.toLowerCase().endsWith(".csv")) return setError("Only .csv files are supported.");

    setBusy(true); setStep(1);
    // Simulate pipeline steps
    const advance = (s, delay) =>
      new Promise((r) => setTimeout(() => { setStep(s); r(); }, delay));

    try {
      await advance(2, 600);
      await advance(3, 500);
      await advance(4, 500);
      await advance(5, 400);
      await onUpload(file, name.trim() || file.name.replace(/\.csv$/i, ""), energyType.trim());
    } catch (err) {
      setError(err.message);
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Drop zone */}
      <div
        className="relative overflow-hidden text-center transition-all duration-200"
        style={{
          border: `1px dashed ${over ? "var(--color-now)" : "var(--color-line-2)"}`,
          background: over ? "rgba(200,168,108,0.04)" : "var(--color-bg)",
          padding: "36px 24px",
          cursor: "pointer",
          boxShadow: over ? "0 0 20px rgba(200,168,108,0.08)" : "none",
        }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
      >
        {/* Scan animation when uploading */}
        {busy && !reduced && (
          <div
            className="scan-line absolute inset-x-0 h-0.5 pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-now), transparent)", top: "40%" }}
          />
        )}

        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em] mb-2"
          style={{ color: over ? "var(--color-now)" : "var(--color-muted)" }}
        >
          {busy ? "Scanning" : "Drop dataset"}
        </div>

        <p className="text-sm" style={{ color: "var(--color-ink)" }}>
          {file ? (
            <>
              <span style={{ color: "var(--color-future)" }}>{file.name}</span>
              <span style={{ color: "var(--color-muted)" }}> · {fmtBytes(file.size)}</span>
            </>
          ) : (
            <span style={{ color: "var(--color-muted)" }}>CSV lands here, then we scan columns.</span>
          )}
        </p>

        {!file && (
          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--color-muted)", opacity: 0.5 }}>
            or click to browse
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>

      {/* Pipeline stage indicator (visible when uploading) */}
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)", overflow: "hidden" }}
          >
            {PIPELINE_STEPS.map((label, i) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{
                  borderTop: i > 0 ? "1px solid var(--color-line)" : "none",
                  opacity: i <= step ? 1 : 0.3,
                }}
              >
                <span
                  className="font-mono text-[10px] w-4 text-center"
                  style={{
                    color: i === step ? "var(--color-now)"
                      : i < step ? "var(--color-future)"
                      : "var(--color-muted)",
                  }}
                >
                  {i < step ? "✓" : i === step ? "●" : "○"}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-wider"
                  style={{
                    color: i === step ? "var(--color-now)"
                      : i < step ? "var(--color-future)"
                      : "var(--color-muted)",
                  }}
                >
                  {label}
                </span>
                {i === step && !reduced && (
                  <div className="flex gap-0.5 ml-auto">
                    <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                    <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                    <span className="load-dot h-1 w-1 rounded-full" style={{ background: "var(--color-now)", display: "inline-block" }} />
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name + type fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dataset name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            id="upload-name"
            placeholder="My energy dataset"
          />
        </Field>
        <Field label="Energy type">
          <input
            className={inputClass}
            value={energyType}
            onChange={(e) => setEnergyType(e.target.value)}
            required
            id="upload-energy-type"
            placeholder="electricity"
          />
        </Field>
      </div>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={busy}>
        {busy ? "Scanning…" : "Upload and inspect →"}
      </Button>
    </form>
  );
}
