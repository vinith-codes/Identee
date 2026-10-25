// services/readyDesignService.js — Shop your IDENTEE's ready designs (server: routes/readyDesignRoutes.js, 25 Oct 2026)
import axios from "axios";

const BACKEND_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";
const API = `${BACKEND_URL}/api/ready-designs`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

const list = async () => (await axios.get(API)).data; // { open, designs }
const get = async (slug) => (await axios.get(`${API}/${encodeURIComponent(slug)}`)).data;
// the customer's own copy of the design (login) -> { customizationId, garmentType }
const copy = async (slug) => (await axios.post(`${API}/${encodeURIComponent(slug)}/copy`, {}, auth())).data;

const readyDesignService = { list, get, copy };
export default readyDesignService;
