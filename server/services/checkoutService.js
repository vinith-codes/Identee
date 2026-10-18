// Server-side checkout: everything the customer pays is computed here from
// the database. The client only says WHAT it is buying (cart / buy-now
// product + sizes / customization) and WHERE to ship — never prices.
import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import ShippingCost from "../models/shippingcostModel.js";
import { aiDesignAddOn, hasPicture } from "../utils/aiPricing.js";
import Offer from "../models/OfferModel.js";
import { applySubscriptionPrice } from "../utils/applySubscriptionPrice.js";
import { addressProblem } from "../utils/address.js";
import { SIZES } from "../data/printPositions.js";
import Setting from "../models/settingModel.js";
import { splitGst } from "../utils/gstState.js";

// "Shop your IDENTEE" (ready-made products) can be closed as Coming soon (Admin → Settings → General). Closed —
// also when the setting doesn't exist yet — ready-made products can't be quoted or ordered.
const SHOP_CLOSED = "Shop your IDENTEE is coming soon — ready-made tees can't be ordered yet.";
const shopOpen = async () => (await Setting.findOne({ key: "general.shopOpen" }).select("value").lean())?.value === true;

export const GST_PERCENT = { cgst: 2.5, sgst: 2.5 };
const MAX_QTY_PER_LINE = 100;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;
const isId = (id) => mongoose.isValidObjectId(id);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseQty = (value) => {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
    throw new HttpError(400, "Invalid quantity");
  }
  return qty;
};

const unitPriceFor = (product, user) =>
  applySubscriptionPrice(product.toObject(), user).subscriptionPrice;

const hasSize = (product, size) =>
  product.productdetails?.stockBySize?.some((s) => s.size === size);

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

const productLine = (product, size, qty, user) => ({
  product: product._id.toString(),
  customization: null,
  name: product.brandname,
  image: product.images?.[0] || "",
  size,
  qty,
  unitPrice: unitPriceFor(product, user),
  price: round2(unitPriceFor(product, user) * qty),
});

export const customizationLine = async (customizationId, qty, size, user) => {
  if (!isId(customizationId)) throw new HttpError(400, "Invalid design");
  const customization = await Customization.findById(customizationId);
  if (!customization) throw new HttpError(404, "Design not found");
  if (customization.user && customization.user.toString() !== user._id.toString()) {
    throw new HttpError(403, "This design belongs to another account");
  }

  const garment = await GarmentType.findOne({ key: customization.garmentType });
  if (!garment || !garment.isActive) {
    throw new HttpError(400, "This garment is no longer available");
  }

  // Price (launch, 16 Oct 2026): the garment's price, + a set amount per tee when the design has a picture —
  // AI-made, from the art library or uploaded (Admin → Settings → AI designs). Text only: the garment's price.
  const addOn = hasPicture(customization.elements) ? await aiDesignAddOn() : 0;

  // Size: the one chosen at checkout, else the one the design was made for.
  const sizes = garment.sizes?.length ? garment.sizes : SIZES;
  const chosen = size && size !== "Custom" ? String(size) : customization.size || null;
  if (chosen && !sizes.includes(chosen)) throw new HttpError(400, "This size isn't available for this garment");

  const unitPrice = round2((garment.basePrice || 0) + addOn);
  return {
    product: null,
    customization: customization._id.toString(),
    name: `${garment.label} — Custom Design`,
    image: customization.mockups?.front || "", // picture of the designed tee
    size: chosen || "Custom",
    qty,
    unitPrice,
    price: round2(unitPrice * qty),
  };
};

// body.buyNow = { productId, items: [{ size, qty }] }
//             | { customizationId, items: [{ size, qty }] }   (one design, many sizes)
//             | { customizationId, qty, size }                (older single-size form)
// no buyNow  -> the user's server-side cart
const resolveLines = async (user, body) => {
  const buyNow = body.buyNow;

  if (buyNow?.customizationId) {
    // a team design is always bought as its player list: one tee per player
    const team = isId(buyNow.customizationId) ? await Customization.findById(buyNow.customizationId).select("players").lean() : null;
    const count = {};
    for (const p of team?.players || []) count[p.size] = (count[p.size] || 0) + 1;
    const roster = Object.entries(count).map(([size, qty]) => ({ size, qty }));
    const wanted = roster.length
      ? roster
      : Array.isArray(buyNow.items) && buyNow.items.length
        ? buyNow.items
        : [{ size: buyNow.size, qty: buyNow.qty ?? 1 }];
    const lines = [];
    for (const { size, qty } of wanted) {
      lines.push(await customizationLine(buyNow.customizationId, parseQty(qty), size, user));
    }
    return { source: "customization", lines };
  }

  if (buyNow?.productId) {
    if (!(await shopOpen())) throw new HttpError(400, SHOP_CLOSED);
    if (!isId(buyNow.productId)) throw new HttpError(400, "Invalid product");
    const product = await Product.findById(buyNow.productId);
    if (!product) throw new HttpError(404, "Product not found");
    if (product.isHidden) throw new HttpError(400, "This product is no longer available");

    const sizes = Array.isArray(buyNow.items) ? buyNow.items : [];
    if (!sizes.length) throw new HttpError(400, "Select a size");

    const lines = sizes.map(({ size, qty }) => {
      if (!hasSize(product, size)) throw new HttpError(400, `Size ${size} is not available`);
      return productLine(product, size, parseQty(qty), user);
    });
    return { source: "buyNow", lines };
  }

  if (!user.cartItems?.length) throw new HttpError(400, "Your cart is empty");
  if (user.cartItems.some((i) => i.product && !i.customization) && !(await shopOpen())) throw new HttpError(400, `${SHOP_CLOSED} Please remove them from your cart.`);

  const products = await Product.find({
    _id: { $in: user.cartItems.filter((i) => i.product).map((i) => i.product) },
  });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const lines = [];
  for (const item of user.cartItems) {
    if (item.customization) {
      lines.push(await customizationLine(item.customization.toString(), parseQty(item.qty), item.size, user));
      continue;
    }
    lines.push(productCartLine(item));
  }
  return { source: "cart", lines };

  function productCartLine(item) {
    const product = byId.get(item.product.toString());
    if (!product || product.isHidden) throw new HttpError(400, "An item in your cart is no longer available. Please remove it.");
    if (!hasSize(product, item.size)) {
      throw new HttpError(400, `${product.brandname} is no longer available in size ${item.size}`);
    }
    return productLine(product, item.size, parseQty(item.qty), user);
  }
};

/* ------------------------------------------------------------------ */
/* Address, shipping, coupon                                           */
/* ------------------------------------------------------------------ */

const ADDRESS_FIELDS = [
  "firstName", "lastName", "email", "secondaryPhone", "doorNo", "street",
  "nearestLandmark", "city", "state", "pin", "country", "phoneNumber",
];

const resolveAddress = (user, bodyAddress) => {
  const source =
    bodyAddress?.state
      ? bodyAddress
      : user.addresses?.find((a) => a.isDefault) || user.addresses?.[0];

  const address = {};
  for (const key of ADDRESS_FIELDS) {
    if (source?.[key] !== undefined && source[key] !== null) address[key] = source[key];
  }
  const problem = addressProblem(address);
  if (problem) {
    throw new HttpError(400, `Shipping address: ${problem}. Please update the address.`);
  }
  return address;
};

// Flat shipping by pieces (Admin → Shipping): ₹flatRate per order, free from freeFromPieces pieces (₹100, free from 3).
// When flatRate is cleared, the older per-state costs apply.
export const FLAT_SHIPPING = { rate: 100, freeFrom: 3 };
const computeShipping = async (state, subtotal, pieces) => {
  const settings = await ShippingCost.findOne();
  // (only an explicit null switches back to the per-state costs; a document saved before this has no flatRate yet)
  const rate = settings?.flatRate === null ? null : settings?.flatRate ?? FLAT_SHIPPING.rate;
  if (rate !== null) {
    // the states in Admin → Shipping are still the ones delivered to (only their own costs are not used)
    const rules = settings?.shippingRules || [];
    if (rules.length && !rules.some((r) => r.state.trim().toLowerCase() === String(state).trim().toLowerCase())) {
      throw new HttpError(400, `Shipping not available for state: ${state}`);
    }
    const freeFrom = settings?.freeFromPieces || FLAT_SHIPPING.freeFrom;
    return pieces >= freeFrom ? 0 : round2(Number(rate) || 0);
  }
  if (!settings) throw new HttpError(400, "Shipping settings not configured");

  const rule = settings.shippingRules.find(
    (r) => r.state.trim().toLowerCase() === String(state).trim().toLowerCase(),
  );
  if (!rule) throw new HttpError(400, `Shipping not available for state: ${state}`);

  if (!rule.alwaysCharge && settings.freeShippingAbove && subtotal >= settings.freeShippingAbove) {
    return 0;
  }
  return round2(rule.cost);
};

// Same rules as GET /api/offers/:code, enforced again at payment time.
export const validateCoupon = async (rawCode, user) => {
  const code = String(rawCode || "").trim();
  if (!code) return null;

  const offer = await Offer.findOne({
    code: { $regex: `^${escapeRegex(code)}$`, $options: "i" },
  });
  if (!offer) throw new HttpError(400, "Invalid coupon");

  const now = new Date();
  if (now < offer.startDate || now > offer.expiryDate) {
    throw new HttpError(400, "Coupon expired or not active");
  }
  if (offer.maxUsage > 0 && offer.usedCount >= offer.maxUsage) {
    throw new HttpError(400, "Coupon usage limit reached");
  }
  if (offer.onePerCustomer !== false && offer.usedBy?.some((id) => id.toString() === user._id.toString())) {
    throw new HttpError(400, "You already used this coupon");
  }
  return offer;
};

/* ------------------------------------------------------------------ */
/* Quote                                                               */
/* ------------------------------------------------------------------ */

export const buildQuote = async (user, body = {}) => {
  const { source, lines } = await resolveLines(user, body);
  const shippingAddress = resolveAddress(user, body.shippingAddress);

  // Prices INCLUDE GST (from 16 Oct 2026): the coupon comes off the price, shipping is added, and the GST is the
  // part of the (discounted) price that is tax — shown on the invoice, never added on top.
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price, 0));
  const pieces = lines.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  const shipping = await computeShipping(shippingAddress.state, subtotal, pieces);

  let discount = 0;
  let coupon = null;
  const offer = await validateCoupon(body.couponCode, user);
  if (offer) {
    // whole rupees (the checkout screen shows it rounded too), so totals have no paise
    discount = Math.round(Math.min((subtotal * offer.offerPercentage) / 100, subtotal + shipping - 1));
    coupon = { code: offer.code, percentage: offer.offerPercentage, discountAmount: discount };
  }

  const goods = round2(subtotal - discount);
  const rate = (GST_PERCENT.cgst + GST_PERCENT.sgst) / 100;
  const tax = round2(goods - goods / (1 + rate));
  // inside the business's state: CGST + SGST; to another state: IGST (utils/gstState.js)
  const { interState, cgst, sgst, igst } = await splitGst(tax, shippingAddress.state);
  const total = round2(goods + shipping);
  if (total < 1) throw new HttpError(400, "Final amount too low");

  return {
    source,
    lines,
    shippingAddress,
    coupon,
    pieces,
    pricing: {
      gstIncluded: true,
      subtotal,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      interState,
      taxAmount: tax,
      shippingAmount: shipping,
      discountAmount: discount,
      total,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

// Throws if any product line can't be fulfilled right now (no changes made).
export const assertInStock = async (lines) => {
  for (const line of lines.filter((l) => l.product)) {
    const product = await Product.findById(line.product).select("brandname productdetails.stockBySize");
    const stock = product?.productdetails?.stockBySize?.find((s) => s.size === line.size)?.stock ?? 0;
    if (stock < line.qty) {
      throw new HttpError(409, `Only ${stock} left of ${line.name} (size ${line.size})`);
    }
  }
};

// Atomically takes stock for every product line, or none at all.
export const takeStock = async (lines) => {
  const taken = [];
  for (const line of lines.filter((l) => l.product)) {
    const result = await Product.updateOne(
      {
        _id: line.product,
        "productdetails.stockBySize": { $elemMatch: { size: line.size, stock: { $gte: line.qty } } },
      },
      { $inc: { "productdetails.stockBySize.$.stock": -line.qty, soldCount: line.qty } },
    );
    if (result.modifiedCount !== 1) {
      await returnStock(taken);
      throw new HttpError(409, `${line.name} (size ${line.size}) just went out of stock`);
    }
    taken.push(line);
  }
};

export const returnStock = async (lines) => {
  for (const line of lines.filter((l) => l.product)) {
    await Product.updateOne(
      { _id: line.product, "productdetails.stockBySize.size": line.size },
      { $inc: { "productdetails.stockBySize.$.stock": line.qty, soldCount: -line.qty } },
    );
  }
};
