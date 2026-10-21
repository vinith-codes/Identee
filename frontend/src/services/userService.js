import api from "../../api.js";

const getUsers = async (token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get("/users", config);
  return data;
};

const getUserById = async (id, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get(`/users/${id}`, config);
  return data;
};

const updateUser = async (id, userData, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.put(`/users/${id}`, userData, config);
  return data;
};

// Admin: give admin / seller / delivery access to an email (the account is made if it doesn't exist)
const addTeamMember = async (body, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.post("/users/team", body, config);
  return data;
};
const deleteUser = async (id, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.delete(`/users/${id}`, config);
  return data;
};
const getFavorites = async (token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get("/users/getfavorites", config);
  return data;
};

const getCart = async (token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get("/users/cart", config);
  return data;
};
const userService = { getUsers, getUserById, updateUser, deleteUser, addTeamMember, getFavorites, getCart };
export default userService;