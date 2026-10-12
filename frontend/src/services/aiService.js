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
const design = async (body) => (await axios.post(`${API_URL}/design`, body, { ...auth(), timeout: 120000 })).data;

// Slogans written to order: { ask, tone?, avoid? } -> { slogans: [..] }
const slogans = async (body) => (await axios.post(`${API_URL}/slogans`, body, { timeout: 30000 })).data;

// admin
const getAdmin = async () => (await axios.get(`${API_URL}/admin`, auth())).data;
const saveAdmin = async (values) => (await axios.put(`${API_URL}/admin`, values, auth())).data;

export default { status, design, slogans, getAdmin, saveAdmin };
