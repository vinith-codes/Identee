import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/categories`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

/* ---------- public ---------- */
const getCategories = async () => (await axios.get(API_URL)).data;
const getCategory = async (slug) =>
  (await axios.get(`${API_URL}/${encodeURIComponent(slug)}`)).data;
// params: { style, size, sort, page, limit }
const getCategoryProducts = async (slug, params) =>
  (await axios.get(`${API_URL}/${encodeURIComponent(slug)}/products`, { params, ...auth() })).data;
const getCategoryGarments = async (slug) =>
  (await axios.get(`${API_URL}/${encodeURIComponent(slug)}/garments`)).data;

/* ---------- admin ---------- */
const adminGetCategories = async () => (await axios.get(`${API_URL}/admin/all`, auth())).data;
// formData: name, description, styles (JSON array), isActive, isCustomizable,
// comingSoon, image (file), bannerImage (file), remove_image, remove_bannerImage
const createCategory = async (formData) => (await axios.post(API_URL, formData, auth())).data;
const updateCategory = async (id, formData) =>
  (await axios.put(`${API_URL}/${id}`, formData, auth())).data;
const reorderCategories = async (ids) =>
  (await axios.put(`${API_URL}/reorder`, { ids }, auth())).data;
const deleteCategory = async (id) => (await axios.delete(`${API_URL}/${id}`, auth())).data;

export default {
  getCategories,
  getCategory,
  getCategoryProducts,
  getCategoryGarments,
  adminGetCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
};
