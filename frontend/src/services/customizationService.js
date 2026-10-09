import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/customizations`;

// Uploading artwork and saving designs require a login.
const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// { positions, scales, sizes, sizeGroups } for one garment — see server/data/printPositions.js
const getPrintPositions = async (garment) =>
  (await axios.get(`${API_URL}/print-positions`, { params: garment ? { garment } : {} })).data;

const uploadDesignImage = async (file) => {
  const formData = new FormData();
  formData.append("design", file);
  const res = await axios.post(`${API_URL}/upload-design`, formData, auth());
  return res.data; // { path }
};

// elements use layout v2: { position, x, y, width, height, ... } in % of the print box
const saveCustomization = async (garmentType, color, elements) => {
  const res = await axios.post(API_URL, { garmentType, color, elements }, auth());
  return res.data;
};

const getCustomizationById = async (id) => {
  const res = await axios.get(`${API_URL}/${id}`, auth());
  return res.data;
};

const customizationService = {
  getPrintPositions,
  uploadDesignImage,
  saveCustomization,
  getCustomizationById,
};

export default customizationService;
