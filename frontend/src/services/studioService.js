// services/studioService.js — Admin → Shop your IDENTEE → Studio (server: routes/studioRoutes.js, 25 Oct 2026)
import axios from "axios";

const BACKEND_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";
const API = `${BACKEND_URL}/api/studio`;
const COLLECTIONS = `${BACKEND_URL}/api/collections`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

const getSetup = async () => (await axios.get(`${API}/setup`, auth())).data;
// one AI picture: { prompt, kind, look, realPerson, shape, garment, colour } + reference pictures (Files, up to 3)
// -> { url, width, height, service, cost, cut }
const makePicture = async (fields, files = []) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v ?? ""));
  for (const f of files) form.append("images", f);
  return (await axios.post(`${API}/picture`, form, auth())).data;
};
// "change this picture": { url, instruction, kind, realPerson, garment, colour } -> a new picture (same shape as makePicture)
const changePicture = async (fields) => (await axios.post(`${API}/picture/change`, fields, auth())).data;
// "improve my words": { prompt, kind, look, garment, colour } -> { improved, understood, cost }
const improve = async (fields) => (await axios.post(`${API}/improve`, fields, auth())).data;
// the whole tee from one prompt: { prompt, garment, colour } -> { understood, name, colour, parts, cost } (a plan to check)
const plan = async (fields) => (await axios.post(`${API}/plan`, fields, { ...auth(), timeout: 90000 })).data;
// which pictures of a saved tee print soft -> { soft: [{ index, position, printCm, dpi }], costEach }
const printCheck = async (id) => (await axios.get(`${API}/designs/${id}/print-check`, auth())).data;
// 4K copies for every soft picture -> { design, done, failed, spent }   (takes about half a minute a picture)
const enlarge = async (id) => (await axios.post(`${API}/designs/${id}/enlarge`, {}, { ...auth(), timeout: 300000 })).data;
const listDesigns = async () => (await axios.get(`${API}/designs`, auth())).data;
const getDesign = async (id) => (await axios.get(`${API}/designs/${id}`, auth())).data;
// { garmentType, color, size, name, blurb, elements, mockups?, issues?, costInr?, service? } -> the saved design
const saveDesign = async (body, id) => (id ? (await axios.put(`${API}/designs/${id}`, body, auth())).data : (await axios.post(`${API}/designs`, body, auth())).data);
const removeDesign = async (id) => (await axios.delete(`${API}/designs/${id}`, auth())).data;
// into Shop your IDENTEE (needs the mockups, a category and at least one size)
const publish = async (id) => (await axios.post(`${API}/designs/${id}/publish`, {}, auth())).data;
// photos of a person wearing the tee: { colour, wearers, sides, setting } -> { design, made, failed, spent }
const modelPhotos = async (id, body) => (await axios.post(`${API}/designs/${id}/model-photos`, body, { ...auth(), timeout: 300000 })).data;
const removeModelPhoto = async (id, body) => (await axios.delete(`${API}/designs/${id}/model-photos`, { ...auth(), data: body })).data;
// publish | unpublish | reject | restore — the same buttons as the Collection maker's tees
const act = async (id, action) => (await axios.post(`${COLLECTIONS}/designs/${id}/${action}`, {}, auth())).data;

const studioService = { getSetup, makePicture, changePicture, improve, plan, printCheck, enlarge, listDesigns, getDesign, saveDesign, publish, modelPhotos, removeModelPhoto, removeDesign, act };
export default studioService;
