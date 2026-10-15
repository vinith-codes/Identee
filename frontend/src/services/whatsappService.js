// services/whatsappService.js — Admin → Settings → WhatsApp (server: /api/whatsapp)
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/whatsapp`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// { configured, enabled, language, templates: [{ event, name, step, body, sample }], last30, recent }
const getAdmin = async () => (await axios.get(`${API_URL}/admin`, auth())).data;
const saveAdmin = async (enabled) => (await axios.put(`${API_URL}/admin`, { enabled }, auth())).data;
const sendTest = async (to) => (await axios.post(`${API_URL}/admin/test`, { to }, auth())).data;

export default { getAdmin, saveAdmin, sendTest };
