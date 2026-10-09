import api from "../../api.js";

// Updates an existing cart item's quantity to an exact value.
// Reuses the addToCart endpoint with action:"set" + cartItemId, which
// the backend already supports — no new route needed.
const updateCartItemQty = async (productId, cartItemId, size, qty, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  // a saved design (no product): its own endpoint, priced on the server
  if (!productId) {
    const { data } = await api.put(`/customizations/cart/${cartItemId}`, { qty }, config);
    return data; // { cartItems: [...] }
  }
  const { data } = await api.post(
    `/products/${productId}/addtocart`,
    { cartItemId, size, qty, action: "set" },
    config,
  );
  return data; // { cartItems: [...] }
};

const removeCartItem = async (cartItemId, token) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const { data } = await api.delete(
    `/products/${cartItemId}/deletecart`,
    config,
  );
  return data; // { cartItems: [...] }
};

const cartService = { updateCartItemQty, removeCartItem };
export default cartService;
