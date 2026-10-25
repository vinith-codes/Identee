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
// prompt + optional example picture (a File) -> { collection, designs: [] }
const makeBrief = async (prompt, file) => {
  const form = new FormData();
  form.append("prompt", prompt);
  if (file) form.append("image", file);
  return (await axios.post(`${API}/brief`, form, auth())).data;
};
const start = async (id, brief) => (await axios.post(`${API}/${id}/start`, { brief }, auth())).data;
// { elements, mockups: { front, back, left, right } (data URLs), issues: [..] }
const finishDesign = async (id, body) => (await axios.put(`${API}/designs/${id}/finish`, body, auth())).data;
const setText = async (id, body) => (await axios.put(`${API}/designs/${id}`, body, auth())).data;
const act = async (id, action) => (await axios.post(`${API}/designs/${id}/${action}`, {}, auth())).data; // publish | unpublish | reject | restore | redo

const collectionService = { getSetup, listCollections, getCollection, makeBrief, start, finishDesign, setText, act };
export default collectionService;
