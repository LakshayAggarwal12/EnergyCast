import { useMemo, useState } from "react";
import { fmtTick, niceTicks, splitSegments, toMs, toPath } from "../services/chart";
import { fmtNum } from "../services/format";

const W = 820, H = 320, M = { l: 52, r: 16, t: 16, b: 34 };

/** History (grey), forecast (teal), and, for backtests, the actual values (dark). No chart library. */
export default function ForecastChart({ history: fullHistory = [], values = [], label = "value" }) {
  const [hover, setHover] = useState(null);
  // Show just enough context that the forecast itself stays readable: about twice the horizon, at least 2 days at hourly data.
  const history = useMemo(() => fullHistory.slice(-Math.max(values.length * 2, 48)), [fullHistory, values.length]);

  const model = useMemo(() => {
    const hist = history.map((h) => ({ t: toMs(h.timestamp), y: h.value }));
    const pred = values.map((v) => ({ t: toMs(v.timestamp), y: v.predicted }));
    const act = values.map((v) => ({ t: toMs(v.timestamp), y: v.actual }));
    const all = [...hist, ...pred, ...act].filter((p) => p.y != null);
    if (!all.length) return null;
    const tMin = Math.min(...[...hist, ...pred].map((p) => p.t));
    const tMax = Math.max(...pred.map((p) => p.t));
    let yMin = Math.min(...all.map((p) => p.y)), yMax = Math.max(...all.map((p) => p.y));
    const pad = (yMax - yMin || 1) * 0.08;
    yMin = yMin >= 0 && yMin - pad <= 0 ? 0 : yMin - pad; // non-negative data starts at zero
    yMax += pad;
    const x = (t) => M.l + ((t - tMin) / (tMax - tMin || 1)) * (W - M.l - M.r);
    const y = (v) => H - M.b - ((v - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);
    const proj = (pts) => pts.map((p) => (p.y == null ? null : { ...p, px: x(p.t), py: y(p.y) }));
    return {
      x, y, yTicks: niceTicks(yMin, yMax), tMin, tMax,
      xTicks: Array.from({ length: 5 }, (_, i) => tMin + ((tMax - tMin) * i) / 4),
      histPath: toPath(splitSegments(proj(hist))),
      predPath: toPath(splitSegments(proj(pred))),
      actPath: toPath(splitSegments(proj(act))),
      hasActual: values.some((v) => v.actual != null),
      originX: history.length ? x(toMs(history[history.length - 1].timestamp)) : null,
    };
  }, [history, values]);

  if (!model) return <p className="text-sm text-muted">No data to chart.</p>;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = model.tMin + ((px - M.l) / (W - M.l - M.r)) * (model.tMax - model.tMin);
    let best = null;
    for (const v of values) {
      const d = Math.abs(toMs(v.timestamp) - t);
      if (best === null || d < best.d) best = { d, v };
    }
    setHover(best ? best.v : null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-muted mb-2">
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-0.5 bg-slate-400" />Recent history</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-0.5 bg-accent" />Forecast</span>
        {model.hasActual && <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-0.5 bg-ink" />Actual</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Chart of recent ${label}, the forecast${model.hasActual ? " and the actual values" : ""}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {model.yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={model.y(v)} y2={model.y(v)} stroke="var(--color-line)" />
            <text x={M.l - 8} y={model.y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{v}</text>
          </g>
        ))}
        {model.xTicks.map((t, i) => (
          <text key={t} x={model.x(t)} y={H - 10} textAnchor={i === 0 ? "start" : i === model.xTicks.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--color-muted)">{fmtTick(t)}</text>
        ))}
        {model.originX != null && <line x1={model.originX} x2={model.originX} y1={M.t} y2={H - M.b} stroke="var(--color-muted)" strokeDasharray="3 4" />}
        <path d={model.histPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        {model.hasActual && <path d={model.actPath} fill="none" stroke="var(--color-ink)" strokeWidth="1.75" />}
        <path d={model.predPath} fill="none" stroke="var(--color-accent)" strokeWidth="2.25" />
        {hover && <line x1={model.x(toMs(hover.timestamp))} x2={model.x(toMs(hover.timestamp))} y1={M.t} y2={H - M.b} stroke="var(--color-accent)" strokeOpacity="0.4" />}
      </svg>
      <p className="text-xs text-muted h-4 mt-1" aria-live="polite">
        {hover ? `${String(hover.timestamp).replace("T", " ").slice(0, 16)} · forecast ${fmtNum(hover.predicted)}${hover.actual != null ? ` · actual ${fmtNum(hover.actual)}` : ""}` : `Hover the chart for values. Y axis: ${label}.`}
      </p>
    </div>
  );
}
