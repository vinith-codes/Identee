import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BACKEND_URL}/api`;

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

// All checkout calls send the same body — WHAT is being bought, never prices:
//   { shippingAddress, couponCode, buyNow?: { productId, items } | { customizationId, qty, size } }
// (no buyNow = the user's cart). The server computes every amount.

// Preview a coupon's discount % before payment (GET /api/offers/:couponCode)
const validateCoupon = async (couponCode, token) => {
  const response = await axios.get(
    `${API_URL}/offers/${couponCode}`,
    authConfig(token),
  );
  return response.data;
};

// Price preview: { lines, priceBreakdown, coupon }. No side effects.
const getQuote = async (checkout, token) => {
  const response = await axios.post(
    `${API_URL}/orders/quote`,
    checkout,
    authConfig(token),
  );
  return response.data;
};

// Starts an online payment — returns the Razorpay order to open checkout with.
const createRazorpayOrder = async (checkout, token) => {
  const response = await axios.post(
    `${API_URL}/orders/razorpay`,
    checkout,
    authConfig(token),
  );
  return response.data;
};

// Verifies the payment with Razorpay on the server and returns the created order.
const verifyRazorpayPayment = async (paymentData, token) => {
  const response = await axios.post(
    `${API_URL}/orders/razorpay/verify`,
    paymentData,
    authConfig(token),
  );
  return response.data;
};

const checkoutService = {
  validateCoupon,
  getQuote,
  createRazorpayOrder,
  verifyRazorpayPayment,
};

export default checkoutService;
