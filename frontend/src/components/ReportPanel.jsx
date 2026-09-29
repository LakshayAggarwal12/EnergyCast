import { Alert } from "./ui";
import { fmtInt } from "../services/format";

const KV = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-1 border-b border-line last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right tabular-nums">{v}</dd></div>
);

export function ValidationReport({ report }) {
  if (!report) return null;
  const c = report.checks || {};
  const target = c.target_quality;
  return (
    <div className="space-y-3">
      <Alert tone={report.passed ? "ok" : "bad"}>{report.passed ? "Validation passed." : "Validation failed. The dataset was rejected."}</Alert>
      {report.errors?.map((e, i) => <Alert key={`e${i}`} tone="bad"><b>{e.code}</b>: {e.message}</Alert>)}
      {report.warnings?.map((w, i) => <Alert key={`w${i}`} tone="warn"><b>{w.code}</b>: {w.message}</Alert>)}
      <dl className="text-sm rounded-md border border-line px-4 py-2">
        {c.rows != null && <KV k="Rows" v={fmtInt(c.rows)} />}
        {c.header_present != null && <KV k="Header row" v={c.header_present ? "yes" : "no"} />}
        {c.timestamp && <KV k="Timestamp" v={`${c.timestamp.columns.join(" + ")} (${c.timestamp.format}), ${c.timestamp.unparseable} unparseable`} />}
        {c.ordering && <KV k="Chronological order" v={c.ordering.chronological ? "yes" : `${c.ordering.out_of_order_steps} out of order`} />}
        {c.duplicates && <KV k="Duplicate timestamps" v={fmtInt(c.duplicates.duplicate_timestamps)} />}
        {c.frequency && <KV k="Inferred frequency" v={`${c.frequency.inferred} (${(c.frequency.regular_fraction * 100).toFixed(2)}% regular, ${c.frequency.gaps} gaps)`} />}
        {c.missing_values && <KV k="Target missing" v={`${fmtInt(c.missing_values.target_missing_on_full_grid)} (${c.missing_values.target_missing_pct_on_full_grid}%), longest run ${fmtInt(c.missing_values.longest_missing_run_steps)} steps`} />}
        {target && <KV k="Target range" v={`${target.min} – ${target.max} (mean ${target.mean.toFixed(3)})`} />}
        {target && <KV k="Extreme high values (kept)" v={fmtInt(target.extreme_high_values_3xIQR)} />}
        {c.time_range && <KV k="Time range" v={`${c.time_range.start} → ${c.time_range.end}`} />}
      </dl>
    </div>
  );
}

export function PreprocessingReport({ report }) {
  if (!report) return null;
  return (
    <dl className="text-sm rounded-md border border-line px-4 py-2">
      <KV k="Raw rows" v={fmtInt(report.rows_raw)} />
      <KV k="Modeling frequency" v={`${report.modeling_frequency} (from ${report.native_frequency})`} />
      <KV k="Resampling" v={report.resampling} />
      <KV k="Steps after resampling" v={fmtInt(report.steps_after_resampling)} />
      <KV k="Short gaps interpolated" v={`${fmtInt(report.short_gaps_interpolated_steps)} steps (max ${report.max_interpolation_steps})`} />
      <KV k="Still missing (not filled)" v={`${fmtInt(report.target_still_missing_steps)} steps (${report.target_still_missing_pct}%) in ${report.long_gaps} long gaps`} />
      <KV k="Extreme values" v={`${fmtInt(report.extreme_high_values_kept)} kept · ${report.outlier_policy}`} />
    </dl>
  );
}
