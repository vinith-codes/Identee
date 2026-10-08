import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import BillingInvoice from "../models/billingInvoiceModel.js";
import PendingCheckout from "../models/pendingCheckoutModel.js";
import sendEmail from "../utils/sendEmail.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import Counter from "../models/counterModel.js";
import { generateInvoicePdfBuffer } from "../utils/generateInvoicePdf.js";
import {
  buildQuote,
  assertInStock,
  returnStock,
} from "../services/checkoutService.js";
import { placeOrder } from "../services/orderPlacement.js";

/*
 * CHECKOUT FLOW (all prices are computed on the server — see checkoutService)
 *   POST /api/orders/quote            price preview, no side effects
 *   POST /api/orders                  Cash on Delivery -> order created
 *   POST /api/orders/razorpay         online: stores a PendingCheckout + Razorpay order
 *   POST /api/orders/razorpay/verify  online: verifies payment with Razorpay -> order created
 *   POST /api/orders/razorpay/webhook safety net if the browser closes after paying
 * Request body for all of them:
 *   { shippingAddress, couponCode,
 *     buyNow?: { productId, items: [{ size, qty }] } | { customizationId, qty, size } }
 *   (no buyNow = the user's cart)
 */

const isAdminUser = (user) => !!user?.isAdmin;
const sameId = (a, b) => !!a && !!b && a.toString() === b.toString();

// @desc   Price preview for checkout
// @route  POST /api/orders/quote
// @access Private
const getCheckoutQuote = asyncHandler(async (req, res) => {
  const quote = await buildQuote(req.user, req.body);
  res.json({
    lines: quote.lines,
    priceBreakdown: quote.pricing,
    coupon: quote.coupon,
  });
});

// @desc   Place a Cash on Delivery order
// @route  POST /api/orders
// @access Private
const addorderitems = asyncHandler(async (req, res) => {
  if (req.body.paymentMethod !== "COD") {
    res.status(400);
    throw new Error("Online payments are completed through Razorpay checkout");
  }
  const quote = await buildQuote(req.user, req.body);
  const order = await placeOrder({
    userId: req.user._id,
    quote,
    paymentMethod: "COD",
  });
  res.status(201).json(order);
});

// @desc get order by id
// @route GET /api/orders/:id
// @access Private
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "name email")
    .populate({
      path: "orderItems.product",
      select: "productType comboName productdetails images",
    });
  // Same 404 for "missing" and "not yours" so order ids can't be probed.
  const allowed =
    order &&
    (sameId(order.user?._id, req.user._id) ||
      isAdminUser(req.user) ||
      sameId(order.deliveryPerson, req.user._id));
  if (!allowed) {
    res.status(404);
    throw new Error("Order Not found");
  }
  res.json(order);
});

// @desc update order to paid
// @route update /api/orders/:id/pay
// @access Private
const updateOrderToPaid = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order Not found");
  }
  if (order.isPaid) {
    return res.json(order);
  }
  if (order.orderStatus === "CANCELLED") {
    res.status(400);
    throw new Error("Order is cancelled");
  }

  order.isPaid = true;
  order.paidAt = Date.now();
  order.paymentResult = {
    id: req.body.id || "MANUAL",
    status: req.body.status || "MARKED_PAID_BY_ADMIN",
    update_time: new Date().toISOString(),
  };
  if (order.orderStatus === "CREATED") order.orderStatus = "CONFIRMED";

  res.json(await order.save());
});

// @desc update order to delivered
// @route update /api/orders/:id/deliver
// @access Private
const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order Not found");
  }
  if (!canMoveTo(order.orderStatus, "DELIVERED")) {
    res.status(400);
    throw new Error(`Can't mark a ${order.orderStatus} order as delivered`);
  }
  order.orderStatus = "DELIVERED";
  order.deliveredAt = Date.now();
  if (order.paymentMethod === "COD" && !order.isPaid) {
    order.isPaid = true;
    order.paidAt = Date.now();
  }
  res.json(await order.save());
});

// @desc get logged in user orders
// @route GET /api/orders/myorders
// @access Private
const GetMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).populate({
    path: "orderItems.product",
    select: "images brandname rating",
  });
  res.json(orders);
});

// @desc get orders
// @route GET /api/admin/orders
// @access Private/admin
const GetOrders = asyncHandler(async (req, res) => {
  const { status } = req.query;

  let filter = {};
  if (status && status !== "all") {
    filter.orderStatus = status;
  }

  const orders = await Order.find(filter).populate("user", "id name").populate({
    path: "orderItems.product",
    select: "brandname images",
  });

  res.json(orders);
});

// @desc Get orders for delivery person
// @route GET /api/orders/delivery
// @access Private Delivery
const getOrdersForDeliveryPerson = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    deliveryPerson: req.user._id,
    orderStatus: "OUT_FOR_DELIVERY",
  }).populate("user", "name email");
  res.json(orders);
});

// @desc Accept order
// @route PUT /api/orders/delivery/accept/:id
// @access Private Delivery
const acceptOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "email")
    .populate("orderItems.product", "images brandname");

  if (
    order &&
    order.orderStatus === "PACKED" &&
    sameId(order.deliveryPerson, req.user._id)
  ) {
    order.orderStatus = "OUT_FOR_DELIVERY";
    await order.save();

    await sendEmail({
      email: order.user.email,
      status: "OUT_FOR_DELIVERY",
      order,
    });

    res.json({ message: "Order accepted" });
  } else {
    res.status(400);
    throw new Error("Order cannot be accepted");
  }
});

// @desc Reject order
// @route PUT /api/orders/delivery/reject/:id
// @access Private Delivery
const rejectOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (
    order &&
    order.orderStatus === "PACKED" &&
    sameId(order.deliveryPerson, req.user._id)
  ) {
    order.deliveryPerson = null;
    await order.save();
    res.json({ message: "Order rejected" });
  } else {
    res.status(400);
    throw new Error("Order cannot be rejected");
  }
});

// @desc Mark order as completed
// @route PUT /api/orders/delivery/complete/:id
// @access Private Delivery
const markOrderAsCompleted = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "email")
    .populate("orderItems.product", "images brandname");

  if (
    order &&
    order.orderStatus === "OUT_FOR_DELIVERY" &&
    sameId(order.deliveryPerson, req.user._id)
  ) {
    order.orderStatus = "DELIVERED";
    order.deliveredAt = Date.now();

    if (order.paymentMethod === "COD") {
      order.isPaid = true;
      order.paidAt = Date.now();
    }

    await order.save();

    await sendEmail({
      email: order.user.email,
      status: "DELIVERED",
      order,
    });

    res.json({ message: "Order marked as completed" });
  } else {
    res.status(400);
    throw new Error("Order cannot be marked as completed");
  }
});

// @desc Mark order as returned
// @route PUT /api/orders/delivery/return/:id
// @access Private Delivery
const markOrderAsReturned = asyncHandler(async (req, res) => {
  const { returnReason } = req.body;
  const order = await Order.findById(req.params.id);
  if (
    order &&
    order.orderStatus === "DELIVERED" &&
    sameId(order.deliveryPerson, req.user._id)
  ) {
    order.orderStatus = "RETURN_APPROVED";
    order.returnReason = returnReason;
    await order.save();
    res.json({ message: "Order marked as returned" });
  } else {
    res.status(400);
    throw new Error("Order cannot be marked as returned");
  }
});

// @desc get undelivered orders in admin
// @route GET /api/orders/undelivered
// @access Private Admin
const getUndeliveredOrders = asyncHandler(async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: { $ne: "DELIVERED" },
    })
      .populate("user", "name email")
      .populate("orderItems.product", "brandname images price");

    res.json(orders);
  } catch (error) {
    console.error("❌ Error inside getUndeliveredOrders:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc Assign order to delivery person
// @route PUT /api/orders/:id/assign
// @access Private Admin
const assignOrderToDeliveryPerson = asyncHandler(async (req, res) => {
  const { deliveryPersonId } = req.body;
  const order = await Order.findById(req.params.id)
    .populate("user", "name email profilePicture")
    .populate("deliveryPerson", "name profilePicture")
    .populate("orderItems.product", "name image");
  if (order) {
    if (!["CREATED", "CONFIRMED", "PACKED"].includes(order.orderStatus)) {
      res.status(400);
      throw new Error(`Can't assign an order that is ${order.orderStatus}`);
    }
    const deliveryUser = mongoose.isValidObjectId(deliveryPersonId)
      ? await User.findById(deliveryPersonId).select("isDelivery")
      : null;
    if (!deliveryUser?.isDelivery) {
      res.status(400);
      throw new Error("Selected user is not a delivery person");
    }
    order.deliveryPerson = deliveryPersonId;
    order.orderStatus = "PACKED";
    await order.save();
    res.json({ message: "Order assigned to delivery person" });
  } else {
    res.status(404);
    throw new Error("Order not found");
  }
});

// @desc    Generate (or fetch existing) formal invoice for an order.
// Idempotent — if order.invoiceDetails already exists, it's returned as-is
// instead of minting a new invoice number. This is what powers the admin
// "Generate Invoice" button and the Invoices module: clicking it again
// never creates a duplicate.
// @route   GET /api/orders/admin/order/:id/invoice
// @access  Private/Admin
const generateInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "name email")
    .populate(
      "orderItems.product",
      "hsnCode brandname oldPrice discount productdetails",
    );

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // ✅ Already generated — return it, never duplicate.
  if (order.invoiceDetails) {
    return res.json(order.invoiceDetails);
  }

  // Separate numbering series (IDT-YYYY-NNNNNN) from order.invoiceNumber
  // (VF-YYYY-NNNN), which is already assigned automatically at order
  // creation time and used elsewhere in the admin (e.g. the Shipping
  // page's "Order" column). This is the formal, customer-facing invoice
  // number, minted only once — here — the first time an invoice is
  // actually generated for this order.
  const year = new Date().getFullYear();
  const counter = await Counter.findByIdAndUpdate(
    `invoice-${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const invoiceNumber = `IDT-${year}-${String(counter.seq).padStart(6, "0")}`;

  const orderItems = order.orderItems.map((item) => {
    const product = item.product;
    const unitPrice =
      item.qty > 0
        ? Math.round((item.price / item.qty) * 100) / 100
        : item.price;
    const mrp = product?.oldPrice > 0 ? product.oldPrice : unitPrice;
    const discountAmount = Math.max((mrp - unitPrice) * item.qty, 0);

    return {
      name: item.name,
      image: item.image,
      size: item.size,
      color: product?.productdetails?.color || "",
      variant: product?.productdetails?.type || "",
      hsnCode: product?.hsnCode || "6109",
      qty: item.qty,
      unitPrice,
      mrp,
      discountAmount: Math.round(discountAmount * 100) / 100,
      lineTotal: item.price,
    };
  });

  const shipping = order.shippingAddress || {};
  const customerName =
    order.user?.name ||
    [shipping.firstName, shipping.lastName].filter(Boolean).join(" ") ||
    "N/A";

  const invoiceDetails = {
    invoiceNumber,
    invoiceDate: new Date(),
    orderId: order._id,
    orderNumber:
      order.invoiceNumber || order._id.toString().slice(-8).toUpperCase(),
    customer: {
      name: customerName,
      email: order.user?.email || shipping.email || "N/A",
      phone: shipping.phoneNumber || shipping.secondaryPhone || "N/A",
    },
    // This system captures a single delivery address per order — billing
    // and shipping are the same until a separate billing-address field
    // exists, so both sections of the invoice reuse it.
    billingAddress: shipping,
    shippingAddress: shipping,
    orderItems,
    pricing: {
      subtotal: order.orderItems.reduce((sum, i) => sum + i.price, 0),
      cgstPrice: order.cgstPrice,
      sgstPrice: order.sgstPrice,
      taxPrice: order.taxPrice,
      shippingPrice: order.shippingPrice,
      discountAmount: order.coupon?.discountAmount || 0,
      totalPrice: order.totalPrice,
    },
    coupon: order.coupon || null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.isPaid ? "Paid" : "Unpaid",
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
  };

  order.invoiceDetails = invoiceDetails;
  await order.save();

  res.json(invoiceDetails);
});

// @desc    List every order that has a generated invoice — powers the
// admin "Invoices" list page.
// @route   GET /api/orders/admin/invoices
// @access  Private/Admin
const getAllInvoices = asyncHandler(async (req, res) => {
  const orders = await Order.find({ invoiceDetails: { $ne: null } })
    .select(
      "invoiceDetails invoiceNumber totalPrice isPaid orderStatus createdAt user",
    )
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  const invoices = orders.map((o) => ({
    orderId: o._id,
    invoiceNumber: o.invoiceDetails?.invoiceNumber,
    invoiceDate: o.invoiceDetails?.invoiceDate,
    customerName: o.user?.name || o.invoiceDetails?.customer?.name || "N/A",
    customerEmail: o.user?.email || o.invoiceDetails?.customer?.email || "N/A",
    totalPrice: o.totalPrice,
    isPaid: o.isPaid,
    orderStatus: o.orderStatus,
  }));

  res.json(invoices);
});

// @desc    Email the generated invoice to the customer on file for the order.
// @route   POST /api/orders/admin/order/:id/invoice/email
// @access  Private/Admin
const emailInvoiceToCustomer = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    "user",
    "name email",
  );

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (!order.invoiceDetails) {
    res.status(400);
    throw new Error("Generate the invoice before emailing it");
  }

  const recipientEmail =
    order.user?.email || order.invoiceDetails.customer?.email;
  if (!recipientEmail || recipientEmail === "N/A") {
    res.status(400);
    throw new Error("This order has no customer email on file");
  }

  try {
    // Render the SAME template as the admin's InvoiceDocument, as a PDF.
    const pdfBuffer = await generateInvoicePdfBuffer(order.invoiceDetails);

    await sendEmail({
      email: recipientEmail,
      status: "INVOICE",
      invoice: order.invoiceDetails,
      attachments: [
        {
          filename: `${order.invoiceDetails.invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
    res.json({ message: `Invoice emailed to ${recipientEmail}` });
  } catch (err) {
    console.error("❌ Invoice email failed:", err);
    res.status(500).json({
      message: "Couldn't send automatically — use the mailto fallback instead.",
    });
  }
});
// @desc  getlocations
// @route GET /api/incomebycity
// @access Private/Admin
const incomebycity = asyncHandler(async (req, res) => {
  const orders = await Order.find({ isPaid: true });

  const totalIncome = orders.reduce((acc, order) => acc + order.totalPrice, 0);
  const formattedTotalIncome = `Rs.${totalIncome}`;

  const incomeByCity = orders.reduce((acc, order) => {
    const city = order.shippingAddress.city || "Unknown";
    acc[city] = (acc[city] || 0) + order.totalPrice;
    return acc;
  }, {});

  res.setHeader("Cache-Control", "no-store");
  res.json({
    totalIncome: formattedTotalIncome,
    incomeByCity: Object.entries(incomeByCity).map(([city, income]) => ({
      city,
      income: `Rs. ${income}`,
    })),
  });
});

// @desc    Fetch transaction details with filters
// @route   GET /api/orders/transactions
// @access  Private/Admin
const getTransactions = asyncHandler(async (req, res) => {
  let { startDate, endDate, paymentType, status } = req.query;

  let query = {};

  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  if (paymentType) {
    query.paymentMethod = paymentType;
  }

  if (status) {
    if (status === "Paid") {
      query.isPaid = true;
    } else if (status === "Unpaid") {
      query.isPaid = false;
    } else if (status === "Delivered") {
      query.isDelivered = true;
    }
  }

  const transactions = await Order.find(query).select(
    "createdAt paymentMethod isPaid isDelivered totalPrice taxPrice shippingPrice orderItems cgstPrice sgstPrice",
  );

  res.json(transactions);
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Shared by the verify endpoint and the webhook: confirms the payment with
// Razorpay itself (not the browser), then creates the order exactly once.
// If stock ran out while the customer was paying, the payment is refunded.
const completeOnlineCheckout = async (pending, paymentId) => {
  if (pending.order) return Order.findById(pending.order);
  if (pending.status === "REFUNDED") {
    const err = new Error(pending.failureReason || "Payment was refunded");
    err.status = 409;
    throw err;
  }

  // The Razorpay SDK rejects with plain objects ({ statusCode, error }), not Errors.
  const rzpError = (e, fallback) => {
    const err = new Error(e?.error?.description || e?.message || fallback);
    err.status = e?.statusCode >= 400 && e?.statusCode < 500 ? 400 : 502;
    return err;
  };

  let payment;
  try {
    payment = await razorpay.payments.fetch(paymentId);
  } catch (e) {
    throw rzpError(e, "Payment not found");
  }
  if (payment.order_id !== pending.razorpayOrderId) {
    const err = new Error("Payment does not belong to this order");
    err.status = 400;
    throw err;
  }
  if (Number(payment.amount) !== pending.amountPaise || payment.currency !== "INR") {
    const err = new Error("Payment amount mismatch");
    err.status = 400;
    throw err;
  }
  if (payment.status === "authorized") {
    try {
      payment = await razorpay.payments.capture(paymentId, pending.amountPaise, "INR");
    } catch (e) {
      throw rzpError(e, "Couldn't capture the payment");
    }
  }
  if (payment.status !== "captured") {
    const err = new Error(`Payment not completed (status: ${payment.status})`);
    err.status = 400;
    throw err;
  }

  try {
    const order = await placeOrder({
      userId: pending.user,
      quote: pending.quote,
      paymentMethod: "RAZORPAY",
      payment: { id: payment.id, orderId: pending.razorpayOrderId, status: payment.status },
    });
    pending.order = order._id;
    pending.status = "COMPLETED";
    await pending.save();
    return order;
  } catch (err) {
    if (err.status === 409) {
      // Out of stock after payment — give the money back.
      await razorpay.payments
        .refund(payment.id, { amount: pending.amountPaise })
        .catch((e) => console.error("[razorpay] refund failed:", e?.error || e.message));
      pending.status = "REFUNDED";
      pending.failureReason = `${err.message}. Your payment has been refunded.`;
      await pending.save();
      err.message = pending.failureReason;
    }
    throw err;
  }
};

// @desc   Start an online payment: price on the server, remember it, create the Razorpay order
// @route  POST /api/orders/razorpay
// @access Private
const createRazorpayOrder = asyncHandler(async (req, res) => {
  const quote = await buildQuote(req.user, req.body);
  await assertInStock(quote.lines);

  const amountPaise = Math.round(quote.pricing.total * 100);
  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `chk_${Date.now()}`,
    notes: { userId: req.user._id.toString() },
  });

  await PendingCheckout.create({
    razorpayOrderId: razorpayOrder.id,
    user: req.user._id,
    source: quote.source,
    quote,
    amountPaise,
  });

  res.json({
    id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    priceBreakdown: quote.pricing,
    coupon: quote.coupon,
  });
});

// @desc   Verify an online payment and create the order
// @route  POST /api/orders/razorpay/verify
// @access Private
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400);
    throw new Error("Missing payment fields");
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (!safeEqualHex(expected, razorpay_signature)) {
    res.status(400);
    throw new Error("Invalid payment signature");
  }

  const pending = await PendingCheckout.findOne({ razorpayOrderId: razorpay_order_id });
  if (!pending || !sameId(pending.user, req.user._id)) {
    res.status(404);
    throw new Error("Checkout not found");
  }

  const order = await completeOnlineCheckout(pending, razorpay_payment_id);
  res.status(201).json(order);
});

// Allowed admin status changes. Forward jumps are allowed (small teams often
// skip steps), going backwards is not.
const STATUS_FLOW = ["CREATED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
const canMoveTo = (from, to) => {
  if (from === to) return true;
  if (to === "CANCELLED") return ["CREATED", "CONFIRMED", "PACKED"].includes(from);
  if (to === "RETURN_APPROVED") return from === "DELIVERED";
  if (to === "RETURN_COMPLETED") return from === "RETURN_APPROVED";
  const a = STATUS_FLOW.indexOf(from);
  const b = STATUS_FLOW.indexOf(to);
  return a !== -1 && b !== -1 && b > a;
};

// @desc    Update order status (admin)
// @route   PUT /api/orders/:id/updateorderstatus
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "email name")
    .populate("orderItems.product");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const previousStatus = order.orderStatus;
  const newStatus = String(req.body.status || "").toUpperCase();

  if (!Order.schema.path("orderStatus").enumValues.includes(newStatus)) {
    res.status(400);
    throw new Error(`Unknown status "${req.body.status}"`);
  }
  if (!canMoveTo(previousStatus, newStatus)) {
    res.status(400);
    throw new Error(`Can't change an order from ${previousStatus} to ${newStatus}`);
  }
  if (previousStatus === newStatus) {
    return res.json({ message: "Order status unchanged" });
  }

  order.orderStatus = newStatus;
  if (newStatus === "DELIVERED") {
    order.deliveredAt = Date.now();
    if (order.paymentMethod === "COD" && !order.isPaid) {
      order.isPaid = true;
      order.paidAt = Date.now();
    }
  }
  if (newStatus === "CANCELLED") {
    order.cancelledAt = Date.now();
    await returnStock(
      order.orderItems.map((i) => ({
        product: i.product?._id || null,
        size: i.size,
        qty: i.qty,
      })),
    );
  }
  await order.save();

  if (["PACKED", "OUT_FOR_DELIVERY"].includes(newStatus)) {
    await sendEmail({ email: order.user?.email, status: newStatus, order }).catch((e) =>
      console.error("[order] status email failed:", e.message),
    );
  }

  res.json({
    message:
      newStatus === "CANCELLED" && order.isPaid
        ? "Order cancelled. It was paid online — issue the refund from the Razorpay dashboard."
        : "Order status updated successfully",
  });
});

// @desc   Get order statuses count
// @route  GET /api/orders/status-count
// @access Admin
const getOrderStatusCounts = asyncHandler(async (req, res) => {
  const created = await Order.countDocuments({ orderStatus: "CREATED" });
  const cancelled = await Order.countDocuments({ orderStatus: "CANCELLED" });
  const confirmed = await Order.countDocuments({ orderStatus: "CONFIRMED" });
  const packed = await Order.countDocuments({ orderStatus: "PACKED" });
  const outForDelivery = await Order.countDocuments({
    orderStatus: "OUT_FOR_DELIVERY",
  });
  const returnApproved = await Order.countDocuments({
    orderStatus: "RETURN_APPROVED",
  });
  const returnCompleted = await Order.countDocuments({
    orderStatus: "RETURN_COMPLETED",
  });
  const delivered = await Order.countDocuments({ orderStatus: "DELIVERED" });

  const allOrders =
    created +
    confirmed +
    packed +
    outForDelivery +
    returnApproved +
    returnCompleted +
    delivered;

  res.json({
    allOrders,
    created,
    cancelled,
    confirmed,
    packed,
    outForDelivery,
    returnApproved,
    returnCompleted,
    delivered,
  });
});

// @desc   Create billing invoice
// @route  POST /api/orders/billinginvoice
// @access Private/Admin
const createBillingInvoice = asyncHandler(async (req, res) => {
  const { logo, from, to, date, items, notes, signature } = req.body;

  const normalizedItems = items.map((item) => ({
    description: item.description,
    hsnCode: item.hsnCode || "6109",
    rate: item.rate,
    qty: item.qty,
    cgst: item.cgst || 0,
    sgst: item.sgst || 0,
    amount: item.rate * item.qty,
  }));

  const subtotal = normalizedItems.reduce(
    (sum, item) => sum + item.rate * item.qty,
    0,
  );
  const cgstTotal = normalizedItems.reduce(
    (sum, item) => sum + ((item.cgst || 0) / 100) * item.rate * item.qty,
    0,
  );
  const sgstTotal = normalizedItems.reduce(
    (sum, item) => sum + ((item.sgst || 0) / 100) * item.rate * item.qty,
    0,
  );
  const total = subtotal + cgstTotal + sgstTotal;

  const invoice = new BillingInvoice({
    logo,
    from,
    to,
    date,
    items: normalizedItems,
    subtotal,
    cgstTotal,
    sgstTotal,
    total,
    notes,
    signature,
  });

  const createdInvoice = await invoice.save();

  res.status(201).json({
    message: "Billing invoice created successfully",
    invoice: createdInvoice,
  });
});

// @desc   Get billing invoice by number
// @route  GET /api/orders/billinginvoice/:invoiceNumber
// @access Private/Admin
const getBillingInvoiceByNumber = asyncHandler(async (req, res) => {
  const invoice = await BillingInvoice.findOne({
    invoiceNumber: req.params.invoiceNumber,
  });

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  res.json(invoice);
});

const getIncomeByPincode = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    {
      $match: {
        "shippingAddress.pin": { $ne: null },
        isPaid: true,
      },
    },
    {
      $group: {
        _id: "$shippingAddress.pin",
        income: { $sum: "$totalPrice" },
      },
    },
    {
      $project: {
        _id: 0,
        pinCode: "$_id",
        income: 1,
      },
    },
    { $sort: { income: -1 } },
  ]);

  res.status(200).json(data);
});

// @desc    Razorpay webhook — safety net if the browser closes after paying
//          (before /razorpay/verify runs). Configure in the Razorpay dashboard
//          with events payment.captured + order.paid and set RAZORPAY_WEBHOOK_SECRET.
// @route   POST /api/orders/razorpay/webhook   (mounted with express.raw in server.js)
// @access  Public (verified by signature)
const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ message: "Webhook not configured" });

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqualHex(digest, req.headers["x-razorpay-signature"])) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  try {
    const payload = JSON.parse(rawBody.toString("utf8"));
    const payment = payload?.payload?.payment?.entity;

    if (["payment.captured", "order.paid"].includes(payload.event) && payment?.order_id) {
      const pending = await PendingCheckout.findOne({ razorpayOrderId: payment.order_id });
      if (pending) await completeOnlineCheckout(pending, payment.id);
    }
    res.json({ status: "ok" });
  } catch (error) {
    console.error("[razorpay] webhook error:", error.message);
    // 409 = already handled (refunded); don't make Razorpay retry it.
    res.status(error.status === 409 ? 200 : 500).json({ message: error.message });
  }
};

export {
  addorderitems,
  getOrderById,
  updateOrderToPaid,
  GetMyOrders,
  GetOrders,
  updateOrderToDelivered,
  getUndeliveredOrders,
  getOrdersForDeliveryPerson,
  acceptOrder,
  rejectOrder,
  markOrderAsCompleted,
  markOrderAsReturned,
  assignOrderToDeliveryPerson,
  generateInvoice,
  getAllInvoices,
  emailInvoiceToCustomer,
  incomebycity,
  getTransactions,
  getOrderStatusCounts,
  updateOrderStatus,
  getCheckoutQuote,
  createBillingInvoice,
  getBillingInvoiceByNumber,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getIncomeByPincode,
  razorpayWebhook,
};
