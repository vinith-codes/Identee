import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/garment-types`;

// Changes need an admin login (the read endpoints stay public).
const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return { headers: { Authorization: `Bearer ${token}` } };
  } catch {
    return {};
  }
};

const getGarmentTypes = async () => (await axios.get(API_URL)).data;
const createGarmentType = async (label, category, basePrice) =>
  (await axios.post(API_URL, { label, category, basePrice }, auth())).data;
const updateGarmentBasePrice = async (id, basePrice) =>
  (await axios.put(`${API_URL}/${id}`, { basePrice }, auth())).data;
const addColor = async (id, name, hex) =>
  (await axios.post(`${API_URL}/${id}/colors`, { name, hex }, auth())).data;
const removeColor = async (id, slug) =>
  (await axios.delete(`${API_URL}/${id}/colors/${slug}`, auth())).data;
const deleteGarmentType = async (id) =>
  (await axios.delete(`${API_URL}/${id}`, auth())).data;

export default {
  getGarmentTypes,
  updateGarmentBasePrice,
  createGarmentType,
  addColor,
  removeColor,
  deleteGarmentType,
};
