const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "energicast_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

function messageFrom(body, status) {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join("; ");
  return `Request failed (${status}).`;
}

async function request(path, { method = "GET", json, form, auth = true } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && auth) { tokenStore.clear(); onUnauthorized(); }
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  return data;
}

export const api = {
  login: (email, password) => request("/api/auth/login", { method: "POST", json: { email, password }, auth: false }),
  register: (name, email, password) => request("/api/auth/register", { method: "POST", json: { name, email, password }, auth: false }),
  me: () => request("/api/auth/me"),
  updateProfile: (body) => request("/api/auth/me", { method: "PUT", json: body }),

  overview: () => request("/api/admin/overview"),
  listDatasets: () => request("/api/admin/datasets"),
  getDataset: (id) => request(`/api/admin/datasets/${id}`),
  uploadDataset: (file, name, energyType) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    form.append("energy_type", energyType);
    return request("/api/admin/datasets", { method: "POST", form });
  },
  configureDataset: (id, cfg) => request(`/api/admin/datasets/${id}`, { method: "PUT", json: cfg }),
  setFeatures: (id, toggles) => request(`/api/admin/datasets/${id}/features`, { method: "PUT", json: toggles }),
  validateDataset: (id) => request(`/api/admin/datasets/${id}/validate`, { method: "POST" }),
  processDataset: (id) => request(`/api/admin/datasets/${id}/process`, { method: "POST" }),
  getEda: (id) => request(`/api/admin/datasets/${id}/eda`),
  deleteDataset: (id) => request(`/api/admin/datasets/${id}`, { method: "DELETE" }),

  train: (datasetId, models, tune = true) => request("/api/admin/models/train", { method: "POST", json: { dataset_id: datasetId, ...(models ? { models } : {}), tune } }),
  comparison: (datasetId) => request(`/api/admin/models/${datasetId}`),
  trainingRun: (runId) => request(`/api/admin/training-runs/${runId}`),
  publishModel: (modelId) => request(`/api/admin/models/${modelId}/publish`, { method: "POST" }),
  unpublishDataset: (datasetId) => request(`/api/admin/datasets/${datasetId}/unpublish`, { method: "POST" }),

  availableDatasets: () => request("/api/datasets"),
  forecastInfo: (datasetId) => request(`/api/datasets/${datasetId}/forecast-info`),
  createForecast: (body) => request("/api/forecast", { method: "POST", json: body }),
  listForecasts: (limit = 50, offset = 0) => request(`/api/forecasts?limit=${limit}&offset=${offset}`),
  getForecast: (id) => request(`/api/forecasts/${id}`),
  resetDataset: (id) => request(`/api/admin/datasets/${id}/reset`, { method: "POST" }),
};
