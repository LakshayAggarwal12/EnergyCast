import { useCallback, useMemo, useRef, useState } from "react";
import { fmtTick, niceTicks, splitSegments, toPath } from "../services/chart";
import { downsample, mergeTimeline, originMs, stamp, yExtent } from "../services/series";
import { fmtNum } from "../services/format";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const W = 960;
const H = 340;
const M = { l: 56, r: 20, t: 32, b: 40 };

function project(rows, tMin, tMax, yMin, yMax, key) {
  const x = (t) => M.l + ((t - tMin) / (tMax - tMin || 1)) * (W - M.l - M.r);
  const y = (v) => H - M.b - ((v - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);
  return rows.map((r) => (r[key] == null ? null : { y: r[key], px: x(r.t), py: y(r[key]), t: r.t, row: r }));
}

export default function ForecastChart({
  history = [],
  values = [],
  label = "value",
  onHorizonChange = null,
  maxHorizon = null,
}) {
  const reduced = usePrefersReducedMotion();
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [pan, setPan] = useState(0);
  const drag = useRef(null);
  const [horizon, setHorizon] = useState(values.length || 1);

  const clipped = useMemo(() => values.slice(0, Math.max(1, horizon)), [values, horizon]);
  const rows = useMemo(() => downsample(mergeTimeline(history, clipped), 480), [history, clipped]);
  const origin = originMs(history, clipped);
  const extent = useMemo(() => yExtent(rows, ["historical", "predicted", "actual", "lower", "upper"]), [rows]);

  const tMin = rows[0]?.t;
  const tMax = rows[rows.length - 1]?.t;
  const span = (tMax - tMin) || 1;
  const viewShift = pan * span * 0.12;
  const vMin = tMin + viewShift;
  const vMax = tMax + viewShift;

  const x = useCallback((t) => M.l + ((t - vMin) / (vMax - vMin || 1)) * (W - M.l - M.r), [vMin, vMax]);
  const y = useCallback((v) => H - M.b - ((v - extent.min) / (extent.max - extent.min || 1)) * (H - M.t - M.b), [extent]);

  const histPath = useMemo(() => toPath(splitSegments(project(rows, vMin, vMax, extent.min, extent.max, "historical"))), [rows, vMin, vMax, extent]);
  const predPath = useMemo(() => toPath(splitSegments(project(rows, vMin, vMax, extent.min, extent.max, "predicted"))), [rows, vMin, vMax, extent]);
  const actPath  = useMemo(() => toPath(splitSegments(project(rows, vMin, vMax, extent.min, extent.max, "actual"))),    [rows, vMin, vMax, extent]);
  const hasActual = clipped.some((v) => v.actual != null);
  const hasBand   = clipped.some((v) => v.lower != null && v.upper != null);

  const bandPath = useMemo(() => {
    if (!hasBand) return "";
    const up = rows.filter((r) => r.upper != null);
    const lo = [...rows].reverse().filter((r) => r.lower != null);
    if (up.length < 2) return "";
    const top = up.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)},${y(r.upper).toFixed(1)}`).join(" ");
    const bot = lo.map((r)    => `L${x(r.t).toFixed(1)},${y(r.lower).toFixed(1)}`).join(" ");
    return `${top} ${bot} Z`;
  }, [hasBand, rows, x, y]);

  const originX = origin != null ? x(origin) : null;
  const yTicks  = niceTicks(extent.min, extent.max);
  const xTicks  = [0, 0.25, 0.5, 0.75, 1].map((p) => vMin + p * (vMax - vMin));

  const onWheel = (e) => {
    e.preventDefault();
    setPan((p) => Math.max(-2, Math.min(2, p + (e.deltaY > 0 ? 0.08 : -0.08))));
  };
  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (drag.current) {
      const dx = (e.clientX - drag.current.x) / 240;
      setPan(Math.max(-2, Math.min(2, drag.current.pan - dx)));
    }
    const svg = svgRef.current;
    if (!svg || !rows.length) return;
    const box = svg.getBoundingClientRect();
    const px  = ((e.clientX - box.left) / box.width) * W;
    const t   = vMin + ((px - M.l) / (W - M.l - M.r)) * (vMax - vMin);
    let best = rows[0], dist = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.t - t);
      if (d < dist) { dist = d; best = r; }
    }
    setHover(best);
  };
  const commitHorizon = () => {
    if (onHorizonChange && horizon !== values.length) onHorizonChange(horizon);
  };

  if (!rows.length) return (
    <p className="font-mono text-sm py-4" style={{ color: "var(--color-muted)" }}>No data to chart.</p>
  );

  const hoverX = hover ? x(hover.t) : null;

  return (
    <div className="space-y-3">
      {/* Temporal axis rail */}
      <div className="axis-rail">
        <span style={{ color: "var(--color-past)" }}>Past</span>
        <span className="now" style={{ color: "var(--color-now)" }}>Today</span>
        <span className="text-right" style={{ color: "var(--color-future)" }}>Future</span>
      </div>

      {/* Chart area */}
      <div
        className="relative overflow-x-auto"
        style={{ border: "1px solid var(--color-line)", background: "var(--color-bg)" }}
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={`${label} forecast tunnel`}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[min(52vw,340px)] w-full min-w-[520px] cursor-ew-resize touch-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerLeave={() => { drag.current = null; setHover(null); }}
        >
          {/* Subtle background grid */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={M.l} x2={W - M.r} y1={y(tick)} y2={y(tick)}
                stroke="rgba(30,44,34,0.8)" strokeWidth="1"
              />
              <text
                x={M.l - 8} y={y(tick) + 4}
                textAnchor="end"
                fill="rgba(107,125,108,0.7)"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xTicks.map((tick) => (
            <text
              key={tick}
              x={x(tick)} y={H - 10}
              textAnchor="middle"
              fill="rgba(107,125,108,0.7)"
              fontSize="9"
              fontFamily="IBM Plex Mono, monospace"
            >
              {fmtTick(tick)}
            </text>
          ))}

          {/* Origin (NOW) line */}
          {originX != null && (
            <>
              {/* Subtle glow behind NOW line */}
              <line
                x1={originX} x2={originX} y1={M.t} y2={H - M.b}
                stroke="rgba(200,168,108,0.15)"
                strokeWidth="8"
              />
              {/* NOW dashed line */}
              <line
                x1={originX} x2={originX} y1={M.t} y2={H - M.b}
                stroke="var(--color-now)"
                strokeWidth="1.5"
                strokeDasharray="4 6"
              />
              {/* NOW label */}
              <text
                x={originX + 7} y={M.t - 10}
                fill="var(--color-now)"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
                letterSpacing="0.18em"
              >
                NOW
              </text>
              {/* NOW dot at top */}
              <circle cx={originX} cy={M.t} r="3" fill="var(--color-now)" />
            </>
          )}

          {/* Forecast tunnel band */}
          {hasBand && (
            <path
              d={bandPath}
              fill="var(--color-future)"
              fillOpacity="0.09"
              stroke="var(--color-future)"
              strokeOpacity="0.15"
              strokeWidth="1"
            />
          )}

          {/* Historical line */}
          {histPath && (
            <path
              d={histPath}
              fill="none"
              stroke="var(--color-past)"
              strokeWidth="1.8"
              className={reduced ? "" : "draw-line"}
            />
          )}

          {/* Forecast line */}
          {predPath && (
            <path
              d={predPath}
              fill="none"
              stroke="var(--color-future)"
              strokeWidth="2.4"
              className={reduced ? "" : "draw-line-forecast"}
              style={{ filter: "drop-shadow(0 0 4px rgba(122,184,122,0.4))" }}
            />
          )}

          {/* Actual (backtest) line */}
          {hasActual && actPath && (
            <path
              d={actPath}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="1.4"
              strokeDasharray="4 3"
              opacity="0.6"
            />
          )}

          {/* Hover cursor line */}
          {hoverX != null && (
            <line
              x1={hoverX} x2={hoverX} y1={M.t} y2={H - M.b}
              stroke="rgba(220,230,220,0.25)"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute top-3 right-3 font-mono text-[11px]"
            style={{
              minWidth: 200,
              border: "1px solid var(--color-line-2)",
              background: "rgba(7,11,9,0.95)",
              padding: "10px 14px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="mb-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              {stamp(hover.timestamp)}
            </div>
            {hover.historical != null && (
              <div className="flex justify-between gap-6 py-0.5">
                <span style={{ color: "var(--color-past)" }}>Electricity</span>
                <span style={{ color: "var(--color-ink)" }}>{fmtNum(hover.historical, 2)}</span>
              </div>
            )}
            {hover.predicted != null && (
              <div className="flex justify-between gap-6 py-0.5">
                <span style={{ color: "var(--color-future)" }}>Forecast</span>
                <span style={{ color: "var(--color-future)", fontWeight: 500 }}>{fmtNum(hover.predicted, 2)}</span>
              </div>
            )}
            {hover.actual != null && (
              <div className="flex justify-between gap-6 py-0.5">
                <span style={{ color: "var(--color-ink)" }}>Actual</span>
                <span style={{ color: "var(--color-ink)" }}>{fmtNum(hover.actual, 2)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-5 font-mono text-[9px] uppercase tracking-wider"
        style={{ color: "var(--color-muted)" }}
      >
        <span className="flex items-center gap-2">
          <span style={{ width: 20, height: 2, background: "var(--color-past)", display: "inline-block" }} />
          Historical
        </span>
        <span className="flex items-center gap-2">
          <span style={{
            width: 20, height: 2,
            background: "var(--color-future)",
            display: "inline-block",
            boxShadow: "0 0 6px rgba(122,184,122,0.5)",
          }} />
          Prediction
        </span>
        {hasActual && (
          <span className="flex items-center gap-2">
            <span style={{ width: 20, height: 1, background: "var(--color-ink)", display: "inline-block", opacity: 0.6 }} />
            Actual
          </span>
        )}
        {hasBand && (
          <span className="flex items-center gap-2">
            <span style={{
              width: 20, height: 8,
              background: "rgba(122,184,122,0.12)",
              border: "1px solid rgba(122,184,122,0.2)",
              display: "inline-block",
            }} />
            Confidence
          </span>
        )}
        <span className="ml-auto normal-case tracking-normal" style={{ color: "var(--color-muted)", opacity: 0.7 }}>
          Scroll or drag to pan · {label}
        </span>
      </div>

      {/* Horizon slider */}
      {onHorizonChange && (
        <div
          className="px-4 py-3"
          style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
        >
          <div className="mb-2 flex justify-between font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            <span>Forecast Horizon</span>
            <span style={{ color: "var(--color-now)" }}>{horizon} steps</span>
          </div>
          <input
            type="range"
            min="1"
            max={maxHorizon || Math.max(values.length, 24)}
            value={horizon}
            aria-label="Forecast horizon"
            onChange={(e) => setHorizon(Number(e.target.value))}
            onMouseUp={commitHorizon}
            onTouchEnd={commitHorizon}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
