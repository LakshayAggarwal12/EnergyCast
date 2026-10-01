import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Alert } from "./ui";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

const CHART_THEME = {
  grid: "#2d313a",
  text: "#8b949e",
  accent: "#14b8a6",
  bg: "#090a0f",
};

const ChartPanel = ({ title, children, description }) => (
  <div className="bg-surface border border-line rounded-lg overflow-hidden">
    <div className="px-4 py-3 border-b border-line">
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      {description && <p className="text-[10px] text-muted mt-0.5">{description}</p>}
    </div>
    <div className="p-4" style={{ background: CHART_THEME.bg }}>
      {children}
    </div>
  </div>
);

const StatBox = ({ label, value, sub }) => (
  <div className="bg-surface border border-line rounded-lg px-4 py-3 hover:border-accent/40 transition-colors">
    <div className="text-[10px] uppercase tracking-widest text-muted font-medium">{label}</div>
    <div className="text-xl font-bold text-ink mt-0.5 tabular-nums">{value}</div>
    {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
  </div>
);

export default function EdaCharts({ datasetId }) {
  const [eda, setEda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api.getEda(datasetId)
      .then(setEda)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (loading) return (
    <div className="flex items-center gap-3 py-8 text-muted text-sm">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Running EDA analysis…
    </div>
  );
  if (error) return <Alert tone="bad">Failed to load EDA: {error}</Alert>;
  if (!eda) return null;

  const dist = eda.distribution;
  const distData = dist?.bins && dist?.counts
    ? dist.bins.slice(0, -1).map((b, i) => ({ bin: Number(b).toFixed(1), count: dist.counts[i] }))
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox
          label="Observations"
          value={eda.n_observed?.toLocaleString() ?? "—"}
          sub="data points"
        />
        <StatBox
          label="Mean"
          value={dist?.mean != null ? dist.mean.toFixed(2) : "—"}
          sub={`σ = ${dist?.std?.toFixed(2) ?? "—"}`}
        />
        <StatBox
          label="Range"
          value={dist?.min != null ? `${dist.min.toFixed(0)}–${dist.max?.toFixed(0)}` : "—"}
          sub="min → max"
        />
        <StatBox
          label="Trend Slope"
          value={eda.trend?.slope_per_step != null ? eda.trend.slope_per_step.toFixed(4) : "—"}
          sub="per step"
        />
      </div>

      {/* Trend */}
      {eda.trend?.rolling?.length > 0 && (
        <ChartPanel title="Rolling Average (Trend)" description="Smoothed consumption signal showing the underlying trend direction">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eda.trend.rolling}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => new Date(t).toLocaleDateString()}
                  minTickGap={50}
                  fontSize={10}
                  stroke={CHART_THEME.text}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ background: "#090a0f", border: "1px solid #2d313a", borderRadius: "6px", fontSize: "12px" }}
                  labelStyle={{ color: CHART_THEME.text }}
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                />
                <Line type="monotone" dataKey="y" name="Rolling Avg" stroke={CHART_THEME.accent} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART_THEME.accent, stroke: "#090a0f" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      )}

      {/* Seasonality row */}
      <div className="grid md:grid-cols-2 gap-4">
        {eda.seasonality?.hour?.length > 0 && (
          <ChartPanel title="Daily Profile (by Hour)" description="Average consumption by hour of day">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eda.seasonality.hour} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                  <XAxis dataKey="k" tickFormatter={(k) => `${k}h`} fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} minTickGap={8} />
                  <YAxis fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ background: "#090a0f", border: "1px solid #2d313a", borderRadius: "6px", fontSize: "12px" }}
                    labelFormatter={(k) => `Hour ${k}:00`}
                    cursor={{ fill: "rgba(20,184,166,0.05)" }}
                  />
                  <Bar dataKey="y" name="Avg Value" fill={CHART_THEME.accent} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        )}

        {eda.seasonality?.day_of_week?.length > 0 && (
          <ChartPanel title="Weekly Profile (by Day)" description="Average consumption by day of week">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eda.seasonality.day_of_week} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                  <XAxis dataKey="k" tickFormatter={(k) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][k]} fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ background: "#090a0f", border: "1px solid #2d313a", borderRadius: "6px", fontSize: "12px" }}
                    labelFormatter={(k) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][k]}
                    cursor={{ fill: "rgba(20,184,166,0.05)" }}
                  />
                  <Bar dataKey="y" name="Avg Value" fill={CHART_THEME.accent} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        )}
      </div>

      {/* Distribution + ACF row */}
      <div className="grid md:grid-cols-2 gap-4">
        {distData.length > 0 && (
          <ChartPanel title="Value Distribution" description="Histogram of target values across the full dataset">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                  <XAxis dataKey="bin" fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#090a0f", border: "1px solid #2d313a", borderRadius: "6px", fontSize: "12px" }}
                    labelFormatter={(b) => `~${b}`}
                    cursor={{ fill: "rgba(20,184,166,0.05)" }}
                  />
                  <Bar dataKey="count" name="Frequency" fill={CHART_THEME.accent} fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        )}

        {eda.acf?.points?.length > 0 && (
          <ChartPanel title="Autocorrelation (ACF)" description="Correlation of the series with its own lagged values">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eda.acf.points} barSize={6}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                  <XAxis dataKey="lag" fontSize={10} stroke={CHART_THEME.text} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} stroke={CHART_THEME.text} domain={[-1, 1]} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} />
                  <ReferenceLine y={0} stroke={CHART_THEME.text} strokeOpacity={0.5} />
                  <Tooltip
                    contentStyle={{ background: "#090a0f", border: "1px solid #2d313a", borderRadius: "6px", fontSize: "12px" }}
                    formatter={(v) => [v.toFixed(3), "ACF"]}
                    cursor={{ fill: "rgba(20,184,166,0.05)" }}
                  />
                  <Bar
                    dataKey="y"
                    name="ACF"
                    fill={CHART_THEME.accent}
                    radius={[2, 2, 0, 0]}
                    label={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        )}
      </div>
    </div>
  );
}
