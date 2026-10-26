// services/collectionService.js — Admin → Collection maker (server: routes/collectionRoutes.js, 25 Oct 2026)
import axios from "axios";

const BACKEND_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";
const API = `${BACKEND_URL}/api/collections`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

const getSetup = async () => (await axios.get(`${API}/setup`, auth())).data;
const listCollections = async () => (await axios.get(API, auth())).data;
const getCollection = async (id) => (await axios.get(`${API}/${id}`, auth())).data; // { collection, designs }
// prompt + the example pictures (Files, at least 1, up to 10) + the products and layouts picked first -> { collection, designs: [] }
const makeBrief = async (prompt, files, { garments = [], layouts = [] } = {}) => {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("garments", JSON.stringify(garments));
  form.append("layouts", JSON.stringify(layouts));
  for (const f of files || []) form.append("images", f);
  return (await axios.post(`${API}/brief`, form, auth())).data;
};
const start = async (id, brief) => (await axios.post(`${API}/${id}/start`, { brief }, auth())).data;
// { elements, mockups: { front, back, left, right } (data URLs), issues: [..] }
const finishDesign = async (id, body) => (await axios.put(`${API}/designs/${id}/finish`, body, auth())).data;
const setText = async (id, body) => (await axios.put(`${API}/designs/${id}`, body, auth())).data;
const act = async (id, action) => (await axios.post(`${API}/designs/${id}/${action}`, {}, auth())).data; // publish | unpublish | reject | restore | redo
// change one tee in your own words -> { design, reply }
const change = async (id, instruction) => (await axios.post(`${API}/designs/${id}/change`, { instruction }, auth())).data;
// a stopped run carries on
const resume = async (id) => (await axios.post(`${API}/${id}/resume`, {}, auth())).data;

const collectionService = { getSetup, listCollections, getCollection, makeBrief, start, finishDesign, setText, act, change, resume };
export default collectionService;
