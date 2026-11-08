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
// a photo sent in the chat + the customer's words: what they want made from it { job, seen, style, area, change, subject, question }
// "Remove the background" of an uploaded photo, on the server (free) -> { url, width, height }
const removeBg = async (body) => (await axios.post(`${API_URL}/remove-background`, body, { ...auth(), timeout: 90000 })).data;
const photoPlan = async (body) => (await axios.post(`${API_URL}/photo-plan`, body, { ...auth(), timeout: 30000 })).data;

// the smart Assistant (23 Oct 2026): one typed message, read by Google's text AI (login optional)
// { message, history: [{ who, text }], earlier, memory, design, facts, areas } -> { reply, ideas, do, chips, memory? }
// (earlier / memory: a long chat's older messages not in its memory note yet, and the note — a new one comes back)
const chat = async (body) => (await axios.post(`${API_URL}/chat`, body, { ...auth(), timeout: 30000 })).data;

// Assistant v2 (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md) — login needed
// the brain: { message, history, earlier, memory, design, facts, areas, sheets } -> { reply, steps, chips, memory?, left }
const assist = async (body) => (await axios.post(`${API_URL}/assist`, body, { ...auth(), timeout: 45000 })).data;
// one concept sheet (three numbered tees on one picture): { concepts, brief, garment, teeColour, teeIsDark, numberFrom } -> { sheet, left }
const concepts = async (body) => (await axios.post(`${API_URL}/concepts`, body, { ...auth(), timeout: 200000 })).data;
// the artwork pieces of one concept, from its sheet: { sheetUrl, n, concept, pieces?, teeColour, teeIsDark, ratios } -> { pieces, failed, left }
const develop = async (body) => (await axios.post(`${API_URL}/develop`, body, { ...auth(), timeout: 240000 })).data;

// admin
const getAdmin = async () => (await axios.get(`${API_URL}/admin`, auth())).data;
const saveAdmin = async (values) => (await axios.put(`${API_URL}/admin`, values, auth())).data;
// the next requests older than a date, for the admin's full list
const getOlderRequests = async (before) => (await axios.get(`${API_URL}/admin/requests`, { ...auth(), params: { before } })).data;

// admin, order print files: a large copy of an ordered picture for printing ({ designId, index } = which picture)
// -> { printSrc, width, height, costInr }. Takes about half a minute and costs about 3 normal pictures.
const printPicture = async (body) => (await axios.post(`${API_URL}/admin/print-picture`, body, { ...auth(), timeout: 180000 })).data;
// print the original again
const dropPrintPicture = async (body) => (await axios.delete(`${API_URL}/admin/print-picture`, { ...auth(), data: body })).data;
// round 5 (8 Nov 2026): a companion piece drawn from the picture already on the tee, and a photo of the finished tee worn
// { fromUrl, fromLabel, piece, brief, teeColour, teeIsDark, ratio } -> { piece: { piece, url, width, height }, left }
const match = async (body) => (await axios.post(`${API_URL}/match`, body, { ...auth(), timeout: 200000 })).data;
// { image: data URL of the front mock-up, garment, teeColour } -> { url, width, height, left }
const worn = async (body) => (await axios.post(`${API_URL}/worn`, body, { ...auth(), timeout: 200000 })).data;

export default { status, design, slogans, edit, improve, photoPlan, removeBg, chat, assist, concepts, develop, match, worn, getAdmin, saveAdmin, getOlderRequests, printPicture, dropPrintPicture };
