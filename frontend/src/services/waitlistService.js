import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api/waitlist`;

const auth = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});

// "Notify me" (22 Oct 2026): the strip at the top of the site, and Admin → Customers → Notify me list
const join = async (email, token) => (await axios.post(API_URL, { email }, auth(token))).data;
const list = async (token) => (await axios.get(API_URL, auth(token))).data;
const notify = async (body, token) => (await axios.post(`${API_URL}/notify`, body, auth(token))).data;
const remove = async (id, token) => (await axios.delete(`${API_URL}/${id}`, auth(token))).data;

const waitlistService = { join, list, notify, remove };
export default waitlistService;
