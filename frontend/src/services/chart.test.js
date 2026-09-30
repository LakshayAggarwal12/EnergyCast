import { fmtTick, niceTicks, splitSegments, toPath } from "./chart";

test("missing values break the line instead of being bridged", () => {
  const pts = [{ y: 1, px: 0, py: 0 }, { y: 2, px: 1, py: 1 }, { y: null }, { y: 3, px: 3, py: 3 }, null, { y: 4, px: 5, py: 5 }];
  const segs = splitSegments(pts);
  expect(segs.map((s) => s.length)).toEqual([2, 1, 1]);
  expect(toPath(segs)).toBe("M0.0,0.0 L1.0,1.0 M3.0,3.0 M5.0,5.0");
});

test("nice ticks cover the range with round steps", () => {
  const t = niceTicks(0, 3.4);
  expect(t[0]).toBe(0);
  expect(t.every((v, i) => i === 0 || v > t[i - 1])).toBe(true);
  expect(t[t.length - 1]).toBeLessThanOrEqual(3.4);
});

test("tick labels use wall-clock time of naive timestamps", () => {
  expect(fmtTick(new Date("2010-11-26T20:00:00").getTime())).toBe("11-26 20:00");
});
