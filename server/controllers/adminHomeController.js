// controllers/adminHomeController.js
//
// One request that feeds the admin Home page: the "Set up your store"
// checklist, the "Needs your attention" list and today's numbers.
// Everything is worked out from real data — nothing here is stored.

import asyncHandler from "express-async-handler";
import Order from "../models/orderModel.js";
import Product from "../models/productModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import GarmentColorImage from "../models/garmentColorImageModel.js";
import ShippingCost from "../models/shippingcostModel.js";
import Setting from "../models/settingModel.js";

// The garment the client launches with (see docs/HANDOFF.md).
const LAUNCH_GARMENT = "oversized-tee";
const LOW_STOCK = 3;

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const ago = (date) => {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
};

async function buildSetupSteps() {
  const steps = [];

  // 1. Store details
  const settings = await Setting.find({
    key: { $in: ["storeName", "phoneNumber", "storeLogo"] },
  }).lean();
  const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));
  const missingStore = [
    !filled(s.storeName) && "name",
    !filled(s.storeLogo) && "logo",
    !filled(s.phoneNumber) && "contact number",
  ].filter(Boolean);
  steps.push({
    key: "store",
    title: "Store details",
    hint: missingStore.length
      ? `Add your ${missingStore.join(", ")}`
      : "Name, logo and contact number are set",
    done: missingStore.length === 0,
    href: "/admin/settings",
  });

  // 2. Launch garment: colours, photos, price
  const garment = await GarmentType.findOne({ key: LAUNCH_GARMENT }).lean();
  if (!garment) {
    steps.push({
      key: "garment",
      title: "Set up Oversized Tee",
      hint: "Add the garment, its colours and photos",
      done: false,
      href: "/admin/customizable",
    });
  } else {
    const photoDocs = await GarmentColorImage.find({
      garmentType: LAUNCH_GARMENT,
      isActive: true,
    }).lean();
    const colours = garment.colors?.length || 0;
    const withPhotos = photoDocs.filter(
      (d) => d.front?.imageUrl && d.back?.imageUrl,
    ).length;
    const missing = [];
    if (!garment.isActive) missing.push("turn it on");
    if (withPhotos < colours) missing.push(`photos for ${colours - withPhotos} colours`);
    if (!(garment.basePrice > 0)) missing.push("set the price");
    steps.push({
      key: "garment",
      title: `Set up ${garment.label || "Oversized Tee"}`,
      hint: missing.length
        ? `${colours} colours, ${withPhotos} with photos — still to do: ${missing.join(", ")}`
        : `${colours} colours with photos, price ₹${garment.basePrice}`,
      done: missing.length === 0,
      href: `/admin/customizable/${LAUNCH_GARMENT}`,
    });
  }

  // 3. Shipping rates
  const shipping = await ShippingCost.findOne().lean();
  const rules = shipping?.shippingRules?.length || 0;
  steps.push({
    key: "shipping",
    title: "Shipping rates",
    hint: rules
      ? `${rules} state rate${rules === 1 ? "" : "s"} set`
      : "Delivery charge per state",
    done: rules > 0,
    href: "/admin/shipping",
  });

  // 4. Payments — only reports the mode, never the key itself.
  const key = process.env.RAZORPAY_KEY_ID || "";
  const live = key.startsWith("rzp_live_");
  steps.push({
    key: "payments",
    title: "Payments",
    hint: !key
      ? "Razorpay is not connected"
      : live
        ? "Razorpay live mode and Cash on Delivery"
        : "Razorpay is in TEST mode — switch to live keys before launch",
    done: live,
    href: null, // keys live in the server's .env, not in the admin
  });

  // 5. Optional: a ready-made product
  const products = await Product.countDocuments() // products have no on/off flag — all are live;
  steps.push({
    key: "readymade",
    title: "Add a ready-made product",
    hint: products
      ? `${products} product${products === 1 ? "" : "s"} live`
      : "Optional — your first finished design",
    done: products > 0,
    optional: true,
    href: "/admin/upload-product",
  });

  return steps;
}

async function buildAttention() {
  const items = [];

  const newOrders = await Order.find({ orderStatus: "CREATED" })
    .select("createdAt")
    .sort({ createdAt: 1 })
    .lean();
  if (newOrders.length) {
    items.push({
      key: "new-orders",
      count: newOrders.length,
      title: "New orders to confirm",
      hint: `Oldest: ${ago(newOrders[0].createdAt)}`,
      tone: "gold",
      href: "/admin/orders",
    });
  }

  const toPrint = await Order.countDocuments({
    orderStatus: "CONFIRMED",
    "orderItems.customization": { $exists: true, $ne: null },
  });
  if (toPrint) {
    items.push({
      key: "to-print",
      count: toPrint,
      title: "Custom designs to print",
      hint: "Confirmed orders with a customer design",
      tone: "blue",
      href: "/admin/orders",
    });
  }

  const [pending] = await Product.aggregate([
    { $unwind: "$reviews" },
    { $match: { "reviews.status": "PENDING" } },
    { $count: "n" },
  ]);
  if (pending?.n) {
    items.push({
      key: "reviews",
      count: pending.n,
      title: "Reviews to approve",
      hint: "Shown on the website after approval",
      tone: "purple",
      href: "/admin/reviews",
    });
  }

  const low = await Product.aggregate([
    { $unwind: "$productdetails.stockBySize" },
    { $match: { "productdetails.stockBySize.stock": { $lte: LOW_STOCK } } },
    {
      $project: {
        name: { $ifNull: ["$productdetails.garmentStyle", "$brandname"] },
        color: "$productdetails.color",
        size: "$productdetails.stockBySize.size",
        stock: "$productdetails.stockBySize.stock",
      },
    },
    { $sort: { stock: 1 } },
  ]);
  if (low.length) {
    const first = low[0];
    items.push({
      key: "low-stock",
      count: low.length,
      title: "Low on stock",
      hint: [first.name, first.color, first.size].filter(Boolean).join(" · ") +
        ` — ${first.stock} left` +
        (low.length > 1 ? ` (+${low.length - 1} more)` : ""),
      tone: "red",
      href: "/admin/products",
    });
  }

  return items;
}

async function buildToday() {
  const since = startOfToday();
  const orders = await Order.find({
    createdAt: { $gte: since },
    orderStatus: { $ne: "CANCELLED" },
  })
    .select("totalPrice orderItems.customization")
    .lean();
  const sales = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const custom = orders.filter((o) =>
    o.orderItems?.some((i) => i.customization),
  ).length;
  const productsLive = await Product.countDocuments() // products have no on/off flag — all are live;
  return [
    { key: "sales", label: "Sales", value: Math.round(sales), money: true },
    { key: "orders", label: "Orders", value: orders.length },
    { key: "custom", label: "Custom designs", value: custom },
    { key: "products", label: "Products live", value: productsLive },
  ];
}

// @desc  Everything the admin Home page shows
// @route GET /api/admin/home
// @access Private/Admin
export const getAdminHome = asyncHandler(async (req, res) => {
  const [steps, attention, today, newOrders] = await Promise.all([
    buildSetupSteps(),
    buildAttention(),
    buildToday(),
    Order.countDocuments({ orderStatus: "CREATED" }),
  ]);
  res.json({ steps, attention, today, newOrders });
});

// @desc  Small badge counts for the admin menu
// @route GET /api/admin/badges
// @access Private/Admin
export const getAdminBadges = asyncHandler(async (req, res) => {
  const newOrders = await Order.countDocuments({ orderStatus: "CREATED" });
  res.json({ newOrders });
});
