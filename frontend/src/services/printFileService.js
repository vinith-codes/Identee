// services/printFileService.js — print-ready pictures and "Send to print team" (server: routes/printFileRoutes.js, 6 Nov 2026)
import axios from "axios";

const BACKEND_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";
const API = `${BACKEND_URL}/api/print-files`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// { enlarger: { configured, mock, model, priceInr }, teamEmail, keepDays, dpi }
const status = async () => (await axios.get(`${API}/status`, auth())).data;
// start making one picture print-ready: { designId, index, printCm } -> { jobId }
const prepare = async (body) => (await axios.post(`${API}/picture`, body, auth())).data;
// { status: queued|running|done|failed, step, error, result: { printFile, costInr } }
const job = async (id) => (await axios.get(`${API}/jobs/${id}`, auth())).data;
// print from the plain picture again
const drop = async (body) => (await axios.delete(`${API}/picture`, { ...auth(), data: body })).data;
// the print-ready picture itself: its details, its packed pixels (for the PDF) and a small preview
const meta = async (key) => (await axios.get(`${API}/picture/${key}/meta`, auth())).data;
const stream = async (key) => new Uint8Array((await axios.get(`${API}/picture/${key}/stream`, { ...auth(), responseType: "arraybuffer", timeout: 300000 })).data);
const previewBlobUrl = async (key) => URL.createObjectURL((await axios.get(`${API}/picture/${key}/preview.webp`, { ...auth(), responseType: "blob" })).data);

// Send to print team: the ZIP goes up in parts, then one call emails the link
const PART = 4 * 1024 * 1024;
const uploadZip = async (orderId, blob, onPart = () => {}) => {
  const uploadId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
  const total = Math.max(1, Math.ceil(blob.size / PART));
  for (let n = 0; n < total; n++) {
    const form = new FormData();
    form.append("uploadId", uploadId);
    form.append("part", String(n));
    form.append("total", String(total));
    form.append("part", blob.slice(n * PART, (n + 1) * PART), "part.bin");
    await axios.post(`${API}/orders/${orderId}/upload`, form, { ...auth(), timeout: 120000 });
    onPart(n + 1, total);
  }
  return uploadId;
};
const send = async (orderId, body) => (await axios.post(`${API}/orders/${orderId}/send`, body, { ...auth(), timeout: 120000 })).data;
const sent = async (orderId) => (await axios.get(`${API}/orders/${orderId}/sent`, auth())).data;

const printFileService = { status, prepare, job, drop, meta, stream, previewBlobUrl, uploadZip, send, sent };
export default printFileService;
