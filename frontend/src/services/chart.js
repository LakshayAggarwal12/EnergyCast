/** Pure helpers for ForecastChart. Kept separate so they can be unit-tested. */

export const toMs = (ts) => new Date(ts).getTime(); // naive ISO strings parse as local wall-clock time

/** Split points into runs, breaking wherever a value is missing so gaps are drawn as gaps. */
export function splitSegments(points) {
  const segments = [];
  let current = [];
  for (const p of points) {
    if (p == null || p.y == null || Number.isNaN(p.y)) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

export const toPath = (segments) =>
  segments.map((seg) => seg.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")).join(" ");

export function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export function fmtTick(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
}
