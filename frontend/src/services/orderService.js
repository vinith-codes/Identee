import api from "../../api.js";

const createOrder = async (orderData, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.post("/orders", orderData, config);
  return data;
};

const getMyOrders = async (token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get("/orders/myorders", config);
  return data;
};

const getOrderById = async (id, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get(`/orders/${id}`, config);
  return data;
};

// Admin-only — GET /orders returns ALL orders (adminOrSeller middleware).
// Used by the Shipping page to show which state/cost each order was billed.
const getAllOrders = async (token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.get("/orders", config);
  return data;
};

// ✅ NEW — Admin: update an order's status (CREATED, CONFIRMED, PACKED,
// OUT_FOR_DELIVERY, DELIVERED, RETURN_APPROVED, RETURN_COMPLETED).
// Hits PUT /orders/:id/updateorderstatus (existing backend route/controller —
// updateOrderStatus in orderControler.js).
const updateOrderStatus = async (id, status, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.put(
    `/orders/${id}/updateorderstatus`,
    { status },
    config,
  );
  return data;
};

// Undo the last status change (the server allows it for 15 minutes, never for a cancel).
const undoOrderStatus = async (id, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.put(`/orders/${id}/undostatus`, {}, config);
  return data;
};

// The customer cancels their own order (allowed while it is CREATED or CONFIRMED).
const cancelMyOrder = async (id, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.put(`/orders/${id}/cancel`, {}, config);
  return data;
};

const orderService = {
  undoOrderStatus,
  cancelMyOrder,
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus, // ✅ NEW
};
export default orderService;
