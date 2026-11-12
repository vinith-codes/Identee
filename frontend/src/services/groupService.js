// services/groupService.js — the group link (11 Nov 2026; server: /api/groups, controllers/groupPollController.js)
// One link for a team, a class or a family: each friend votes for a concept and fills in their own name, size and
// number. Friends need no account; making a link and reading the answers need the owner's login.
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/groups`;

const auth = () => {
  try {
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  } catch {
    return {};
  }
};

// body: { title, garment, picture, options: [{ n, title }], sizes, askNumber } → the link's public view (with token)
const create = async (body) => (await axios.post(API_URL, body, auth())).data;
const mine = async () => (await axios.get(`${API_URL}/mine`, auth())).data;
// what a friend sees: { token, title, garment, picture, sizes, askNumber, closed, full, count, options: [{ n, title, votes }] }
const get = async (token) => (await axios.get(`${API_URL}/${encodeURIComponent(token)}`)).data;
// a friend's answer: { name, size, number, vote, key? } → { key, entry, ...the public view }
const join = async (token, body) => (await axios.post(`${API_URL}/${encodeURIComponent(token)}/join`, body)).data;
// the owner: every answer → the public view + entries: [{ name, size, number, vote }]
const entries = async (token) => (await axios.get(`${API_URL}/${encodeURIComponent(token)}/entries`, auth())).data;
const close = async (token, closed = true) => (await axios.put(`${API_URL}/${encodeURIComponent(token)}/close`, { closed }, auth())).data;

export default { create, mine, get, join, entries, close };
