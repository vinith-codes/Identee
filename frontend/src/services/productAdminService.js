// Admin → Ready-made: product list + wizard (server/controllers/productAdminController.js)
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API = `${BACKEND_URL}/api/products/admin`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// { groups, counts, lowStockAt }
const listGroups = async (params) => (await axios.get(`${API}/groups`, { ...auth(), params })).data;
const options = async () => (await axios.get(`${API}/options`, auth())).data;
const getGroup = async (groupId) => (await axios.get(`${API}/groups/${groupId}`, auth())).data;

// form = FormData with "data" (JSON), "images" (new photos), optional "sizeChart"
const createGroup = async (form, onUploadProgress) =>
  (await axios.post(`${API}/groups`, form, { ...auth(), onUploadProgress })).data;
const saveGroup = async (groupId, form, onUploadProgress) =>
  (await axios.put(`${API}/groups/${groupId}`, form, { ...auth(), onUploadProgress })).data;

const setVisibility = async (groupId, hidden) =>
  (await axios.patch(`${API}/groups/${groupId}/visibility`, { hidden }, auth())).data;
const setStock = async (colourId, stockBySize) =>
  (await axios.patch(`${API}/colours/${colourId}/stock`, { stockBySize }, auth())).data;
const deleteGroup = async (groupId) => (await axios.delete(`${API}/groups/${groupId}`, auth())).data;

export default { listGroups, options, getGroup, createGroup, saveGroup, setVisibility, setStock, deleteGroup };
