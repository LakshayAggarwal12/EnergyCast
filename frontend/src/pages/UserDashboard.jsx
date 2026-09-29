import { Card } from "../components/ui";

export default function UserDashboard() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Card title="Forecasting is not available yet">
        <p className="text-sm text-muted">
          Forecasts become available once an administrator has trained and published a model for a dataset.
          Model publishing and forecast requests arrive in a later release.
        </p>
      </Card>
    </div>
  );
}
