// services/garmentImageService.js
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/garment-images`;

// Changes need an admin login (reading stays public).
const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

const getAllGarmentImages = async () => {
  const res = await axios.get(API_URL);
  return res.data;
};

const getGarmentImage = async (garmentType, colorSlug) => {
  const res = await axios.get(`${API_URL}/${garmentType}/${colorSlug}`);
  return res.data;
};

const uploadGarmentViewPhoto = async (
  garmentType,
  colorSlug,
  colorName,
  colorHex,
  view,
  file,
) => {
  const formData = new FormData();
  formData.append("garmentType", garmentType);
  formData.append("colorSlug", colorSlug);
  formData.append("colorName", colorName);
  formData.append("colorHex", colorHex);
  formData.append("view", view);
  formData.append("photo", file);
  const res = await axios.post(`${API_URL}/upload-photo`, formData, auth());
  return res.data;
};
const updatePrintArea = async (garmentType, colorSlug, view, printArea) => {
  const res = await axios.put(`${API_URL}/print-area`, {
    garmentType,
    colorSlug,
    view,
    printArea,
  }, auth());
  return res.data;
};

// One print box for a view, applied to every colour of the garment.
const updatePrintAreaAllColours = async (garmentType, view, printArea) =>
  (await axios.put(`${API_URL}/print-area-all`, { garmentType, view, printArea }, auth())).data;

const deleteGarmentImage = async (garmentType, colorSlug) => {
  const res = await axios.delete(`${API_URL}/${garmentType}/${colorSlug}`, auth());
  return res.data;
};

const garmentImageService = {
  getAllGarmentImages,
  getGarmentImage,
  uploadGarmentViewPhoto,
  updatePrintArea,
  updatePrintAreaAllColours,
  deleteGarmentImage,
};

export default garmentImageService;
