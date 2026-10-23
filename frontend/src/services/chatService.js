// services/chatService.js — the design room's saved Assistant chats of a logged-in customer (server: /api/chats)
import axios from "axios";

// (import.meta.env?. — the tests load this file in Node, where there is no import.meta.env)
const BACKEND_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/chats`;

const token = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "{}").token || "";
  } catch {
    return "";
  }
};
const auth = () => (token() ? { headers: { Authorization: `Bearer ${token()}` } } : {});

// [{ id, type, title, colour, designId, updatedAt }] newest first
const list = async () => (await axios.get(API_URL, { ...auth(), timeout: 15000 })).data;
// { id, type, title, colour, designId, updatedAt, body }
const get = async (id) => (await axios.get(`${API_URL}/${id}`, { ...auth(), timeout: 15000 })).data;
// { type, title, colour, designId, body } -> the summary
const save = async (id, chat) => (await axios.put(`${API_URL}/${id}`, chat, { ...auth(), timeout: 20000 })).data;
const remove = async (id) => (await axios.delete(`${API_URL}/${id}`, { ...auth(), timeout: 15000 })).data;

// The page is being closed: the last save must still get out (axios can't do that; fetch with keepalive can).
const saveOnLeave = (id, chat) => {
  try {
    fetch(`${API_URL}/${id}`, { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify(chat) }).catch(() => {});
  } catch {
    // nothing to do — the browser copy of the chat is still there
  }
};

export default { list, get, save, remove, saveOnLeave };
