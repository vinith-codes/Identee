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

// [{ id, type, title, colour, designId, updatedAt, at }] newest first
const list = async () => (await axios.get(API_URL, { ...auth(), timeout: 15000 })).data;
// { id, type, title, colour, designId, updatedAt, at, body }
const get = async (id) => (await axios.get(`${API_URL}/${id}`, { ...auth(), timeout: 15000 })).data;
// { type, title, colour, designId, at, body } -> the summary (409 = a newer copy is saved already)
const save = async (id, chat) => (await axios.put(`${API_URL}/${id}`, chat, { ...auth(), timeout: 20000 })).data;
const remove = async (id) => (await axios.delete(`${API_URL}/${id}`, { ...auth(), timeout: 15000 })).data;

// how big a request is in bytes (Tamil letters and emoji are 3-4 bytes each)
const bytes = (text) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : text.length * 3);
// The page is being closed: the last save must still get out (axios can't do that; fetch with keepalive can).
// Browsers refuse a keepalive request over 64 KB (13 Nov 2026): a long chat goes as a normal request — it still
// gets out when the tab is only hidden, and on a real close this device's copy of the room is sent next visit.
const saveOnLeave = (id, chat) => {
  try {
    const body = JSON.stringify(chat);
    fetch(`${API_URL}/${id}`, { method: "PUT", keepalive: bytes(body) <= 60_000, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body }).catch(() => {});
  } catch {
    // nothing to do — the browser copy of the chat is still there
  }
};

export default { list, get, save, remove, saveOnLeave };
