// The customer's ready-made shop (server/controllers/shopController.js)
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// params: { category, style, size, color, maxPrice, q, sort, page, limit, exclude }
// → { items, total, page, pages, facets: { categories, styles, sizes, colors, priceMin, priceMax } }
const listProducts = async (params) =>
  (await axios.get(`${BACKEND_URL}/api/shop/products`, { params, ...auth() })).data;

// one product with all its colours → { product, variants }
const getProduct = async (id) => (await axios.get(`${BACKEND_URL}/api/products/${id}/full`, auth())).data;

export default { listProducts, getProduct };
