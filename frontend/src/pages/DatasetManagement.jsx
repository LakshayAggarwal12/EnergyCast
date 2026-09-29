import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { Alert, Card } from "../components/ui";
import FileUpload from "../components/FileUpload";
import DatasetCard from "../components/DatasetCard";

export default function DatasetManagement() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.listDatasets().then(setDatasets).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const upload = async (file, name, energyType) => {
    const ds = await api.uploadDataset(file, name, energyType);
    navigate(`/admin/datasets/${ds.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Card title="Upload a dataset"><FileUpload onUpload={upload} /></Card>
      {error && <Alert>{error}</Alert>}
      <div>
        <h2 className="font-medium mb-3">Datasets</h2>
        {datasets === null ? <p className="text-muted text-sm">Loading…</p>
          : datasets.length === 0 ? <p className="text-sm text-muted">No datasets yet. Upload a CSV above.</p>
          : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{datasets.map((d) => <DatasetCard key={d.id} dataset={d} />)}</div>}
      </div>
    </div>
  );
}
