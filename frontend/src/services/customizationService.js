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
// size = the garment size the customer designed for (e.g. "M")
const saveCustomization = async (garmentType, color, elements, size) => {
  const res = await axios.post(API_URL, { garmentType, color, elements, size }, auth());
  return res.data;
};

const getCustomizationById = async (id) => {
  const res = await axios.get(`${API_URL}/${id}`, auth());
  return res.data;
};

// "My designs"
// design = { garmentType, color, size, elements, name?, mockups?: { front, back, left, right } (data URLs) }
const createDesign = async (design) => (await axios.post(API_URL, design, auth())).data;
// 409 { locked: true } when the design was ordered — save a copy instead
const updateDesign = async (id, design) => (await axios.put(`${API_URL}/${id}`, design, auth())).data;
const listMyDesigns = async () => (await axios.get(`${API_URL}/mine`, auth())).data;
const duplicateDesign = async (id) => (await axios.post(`${API_URL}/${id}/duplicate`, {}, auth())).data;
const deleteDesign = async (id) => (await axios.delete(`${API_URL}/${id}`, auth())).data;
// cart: items = [{ size, qty }] — one design in any mix of sizes
const addDesignToCart = async (id, items) => (await axios.post(`${API_URL}/${id}/cart`, { items }, auth())).data;
// admin: the custom designs in an order, ready to make print files
const getOrderPrintPack = async (orderId) => (await axios.get(`${API_URL}/admin/order/${orderId}`, auth())).data;

const customizationService = {
  getPrintPositions,
  uploadDesignImage,
  saveCustomization,
  getCustomizationById,
  createDesign,
  updateDesign,
  listMyDesigns,
  duplicateDesign,
  deleteDesign,
  addDesignToCart,
  getOrderPrintPack,
};

export default customizationService;
