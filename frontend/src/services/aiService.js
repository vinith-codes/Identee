// services/aiService.js — the Design Room's AI design maker (server: /api/ai)
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/ai`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// { available, reason, styles, dailyPerUser, left } — left is null when not logged in
const status = async () => (await axios.get(`${API_URL}/status`, auth())).data;

// New design: { subject, style, teeColour, teeIsDark, ratio } · change one: { baseUrl, change, ratio }
// -> { images: [url], left }
// (a photo Google refuses goes on to Grok, so one request can take two turns — up to about 3 minutes in the worst case)
const design = async (body) => (await axios.post(`${API_URL}/design`, body, { ...auth(), timeout: 200000 })).data;

// Slogans written to order: { ask, tone?, avoid? } -> { slogans: [..] }
const slogans = async (body) => (await axios.post(`${API_URL}/slogans`, body, { timeout: 30000 })).data;

// Edit the tee by chat: { message, design } -> { reply, ops }
const edit = async (body) => (await axios.post(`${API_URL}/edit`, body, { timeout: 30000 })).data;

// "Improve my idea" (text only, not counted as a picture request):
// { idea, teeColour, teeIsDark, areas: [{ key, label, side, cm }] } -> { prompt, expect: [{ label, value }], style, area }
const improve = async (body) => (await axios.post(`${API_URL}/improve`, body, { timeout: 30000 })).data;

// admin
const getAdmin = async () => (await axios.get(`${API_URL}/admin`, auth())).data;
const saveAdmin = async (values) => (await axios.put(`${API_URL}/admin`, values, auth())).data;

// admin, order print files: a large copy of an ordered picture for printing ({ designId, index } = which picture)
// -> { printSrc, width, height, costInr }. Takes about half a minute and costs about 3 normal pictures.
const printPicture = async (body) => (await axios.post(`${API_URL}/admin/print-picture`, body, { ...auth(), timeout: 180000 })).data;
// print the original again
const dropPrintPicture = async (body) => (await axios.delete(`${API_URL}/admin/print-picture`, { ...auth(), data: body })).data;

export default { status, design, slogans, edit, improve, getAdmin, saveAdmin, printPicture, dropPrintPicture };
