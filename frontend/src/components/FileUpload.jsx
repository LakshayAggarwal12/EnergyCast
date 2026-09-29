import { useRef, useState } from "react";
import { Alert, Button, Field, inputClass } from "./ui";
import { fmtBytes } from "../services/format";

export default function FileUpload({ onUpload }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [energyType, setEnergyType] = useState("electricity");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!file) return setError("Choose a CSV file first.");
    if (!file.name.toLowerCase().endsWith(".csv")) return setError("Only .csv files are supported.");
    setBusy(true);
    try {
      await onUpload(file, name.trim() || file.name.replace(/\.csv$/i, ""), energyType.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dataset name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Household power consumption" />
        </Field>
        <Field label="Energy type">
          <input className={inputClass} value={energyType} onChange={(e) => setEnergyType(e.target.value)} required />
        </Field>
      </div>
      <Field label="CSV file" hint={file ? `${file.name} · ${fmtBytes(file.size)}` : "The file is stored on the server and its columns are inspected before you configure it."}>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className={inputClass} onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? "Uploading and inspecting…" : "Upload dataset"}</Button>
    </form>
  );
}
