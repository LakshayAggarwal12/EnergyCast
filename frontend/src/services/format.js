export const fmtNum = (v, digits = 3) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/a" : Number(v).toFixed(digits);

export const fmtBytes = (n) => {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

export const fmtDate = (s) => (s ? String(s).replace("T", " ").slice(0, 19) : "");
export const fmtInt = (n) => (n == null ? "" : Number(n).toLocaleString("en-US"));
