// Turns a server-built quote (see checkoutService.buildQuote) into an Order.
// Used by COD checkout, the Razorpay verify endpoint and the Razorpay webhook.
import Customization from "../models/customizationModel.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import Offer from "../models/OfferModel.js";
import Counter from "../models/counterModel.js";
import sendEmail from "../utils/sendEmail.js";
import { takeStock, returnStock } from "./checkoutService.js";

const nextOrderNumber = async () => {
  const year = new Date().getFullYear();
  const counter = await Counter.findByIdAndUpdate(
    `order-invoice-${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `VF-${year}-${String(counter.seq).padStart(4, "0")}`;
};

const isDuplicateKey = (err) => err?.code === 11000;

/**
 * @param {object}  args
 * @param {string}  args.userId
 * @param {object}  args.quote          result of buildQuote (or its stored copy)
 * @param {"COD"|"RAZORPAY"} args.paymentMethod
 * @param {object}  [args.payment]      verified Razorpay payment { id, orderId, status }
 * @returns {Promise<Order>}
 * @throws HttpError(409) when stock ran out — nothing is saved in that case
 */
export const placeOrder = async ({ userId, quote, paymentMethod, payment }) => {
  const isOnline = paymentMethod === "RAZORPAY";

  // Online orders are idempotent per Razorpay order (verify + webhook may race).
  if (isOnline) {
    const existing = await Order.findOne({ razorpayOrderId: payment.orderId });
    if (existing) return existing;
  }

  await takeStock(quote.lines);

  let order;
  try {
    order = await Order.create({
      user: userId,
      orderItems: quote.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        image: l.image,
        price: l.price,
        size: l.size,
        product: l.product || undefined,
        customization: l.customization || undefined,
      })),
      shippingAddress: quote.shippingAddress,
      paymentMethod,
      cgstPrice: quote.pricing.cgstAmount,
      sgstPrice: quote.pricing.sgstAmount,
      taxPrice: quote.pricing.taxAmount,
      shippingPrice: quote.pricing.shippingAmount,
      totalPrice: quote.pricing.total,
      coupon: quote.coupon,
      invoiceNumber: await nextOrderNumber(),
      razorpayOrderId: isOnline ? payment.orderId : undefined,
      isPaid: isOnline,
      paidAt: isOnline ? Date.now() : undefined,
      orderStatus: isOnline ? "CONFIRMED" : "CREATED",
      paymentResult: isOnline
        ? { id: payment.id, status: payment.status, update_time: new Date().toISOString() }
        : undefined,
    });
  } catch (err) {
    await returnStock(quote.lines);
    if (isOnline && isDuplicateKey(err)) {
      return Order.findOne({ razorpayOrderId: payment.orderId });
    }
    throw err;
  }

  // Side effects below must never undo a placed order.
  // Lock ordered designs so the print team prints exactly what was paid for.
  const designIds = quote.lines.map((l) => l.customization).filter(Boolean);
  if (designIds.length) {
    await Customization.updateMany({ _id: { $in: designIds }, orderedAt: null }, { $set: { orderedAt: new Date() } }).catch((e) =>
      console.error("[order] design lock failed:", e.message),
    );
  }
  if (quote.coupon?.code) {
    await Offer.updateOne(
      { code: quote.coupon.code },
      { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } },
    ).catch((e) => console.error("[order] coupon update failed:", e.message));
  }

  if (quote.source === "cart") {
    await User.updateOne({ _id: userId }, { $set: { cartItems: [] } }).catch((e) =>
      console.error("[order] cart clear failed:", e.message),
    );
  }

  try {
    const user = await User.findById(userId).select("email");
    const populated = await Order.findById(order._id).populate(
      "orderItems.product",
      "images brandname",
    );
    await sendEmail({ email: user?.email, status: "ORDERED", order: populated });
  } catch (e) {
    console.error("[order] confirmation email failed:", e.message);
  }

  return order;
};
