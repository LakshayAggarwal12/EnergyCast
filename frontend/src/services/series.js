/** Time-series helpers for display. Never invents values - only downsamples/merges API points. */

export const toMs = (ts) => new Date(ts).getTime();

export function downsample(points, max = 420) {
  if (!points?.length || points.length <= max) return points || [];
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/** Merge history + forecast onto one ordered timeline. Optional CI keys pass through if present. */
export function mergeTimeline(history = [], values = []) {
  const hist = history.map((h) => ({
    t: toMs(h.timestamp),
    timestamp: h.timestamp,
    historical: h.value,
    predicted: null,
    actual: null,
    lower: null,
    upper: null,
    zone: "past",
  }));
  const fut = values.map((v) => ({
    t: toMs(v.timestamp),
    timestamp: v.timestamp,
    historical: null,
    predicted: v.predicted,
    actual: v.actual ?? null,
    lower: v.lower ?? v.ci_lower ?? null,
    upper: v.upper ?? v.ci_upper ?? null,
    zone: "future",
  }));
  return [...hist, ...fut];
}

export function originMs(history = [], values = []) {
  if (history.length) return toMs(history[history.length - 1].timestamp);
  if (values.length) return toMs(values[0].timestamp);
  return null;
}

export function yExtent(rows, keys) {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (v == null || Number.isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!(max > min)) return { min: 0, max: 1 };
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

export function stamp(s) {
  return String(s).replace("T", " ").slice(0, 16);
}
