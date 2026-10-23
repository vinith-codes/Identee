// services/myPicturesService.js — "My pictures" in the design room (server: /api/my-pictures)
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/my-pictures`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// [{ id, url, kind: "ai" | "photo", about, style, width, height, createdAt }] newest first (the last 100)
const list = async () => (await axios.get(API_URL, { ...auth(), timeout: 15000 })).data;
// takes it off the list (the picture itself stays: it may be on a saved design or an order)
const remove = async (id) => (await axios.delete(`${API_URL}/${id}`, { ...auth(), timeout: 15000 })).data;

export default { list, remove };
