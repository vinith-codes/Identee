// Cancelling an order (7 Nov 2026) — one place for everything a cancel does, whoever starts it: the customer
// (My orders → Cancel order), the admin (status → Cancelled), or the admin approving a customer's request.
//   1. the customer may cancel straight away only while the order is not packed AND its print files have not gone to
//      the print team; after that they can only ASK, and the admin approves or declines (the tee may be printing)
//   2. a paid online order is refunded through Razorpay at once (by hand only if that fails)
//   3. the customer is emailed (cancelled + refund, or the answer to their request)
//   4. the coupon is given back
//   5. the order remembers who cancelled and what happened to the money (shown in Admin → Orders)
// The print team is emailed "don't print" when the order's files were already sent to them.
import Razorpay from "razorpay";
import Order from "../models/orderModel.js";
import Offer from "../models/OfferModel.js";
import sendEmail from "../utils/sendEmail.js";
import { mailer, fromAddress, shopInbox } from "../utils/mailer.js";
import { returnStock } from "./checkoutService.js";

export const NOT_PACKED = ["CREATED", "CONFIRMED"];
export const ASKABLE = [...NOT_PACKED, "PACKED"];

const httpError = (status, message) => Object.assign(new Error(message), { status });
const orderNo = (order) => order.invoiceNumber || String(order._id).slice(-8).toUpperCase();
const printTeam = () => process.env.PRINT_TEAM_EMAIL?.trim() || "millionmarks16@gmail.com";
const plain = (s) => String(s || "").replace(/[<>&"]/g, "");

export const sentToPrintTeam = (order) => (order?.printFiles || []).some((f) => f.sentAt);

/**
 * What the customer's "Cancel order" button does for this order:
 *   "now"   cancel straight away (not packed, print files not sent)
 *   "ask"   send a request (packed, or the print team already has the files)
 *   "asked" a request is waiting for the shop's answer
 *   null    nothing (cancelled, out for delivery, delivered, or a request was declined)
 */
export const customerCancelMode = (order) => {
  if (!order || order.orderStatus === "CANCELLED") return null;
  const req = order.cancelRequest?.status;
  if (req === "pending") return "asked";
  if (req === "declined") return null;
  if (NOT_PACKED.includes(order.orderStatus) && !sentToPrintTeam(order)) return "now";
  if (ASKABLE.includes(order.orderStatus)) return "ask";
  return null;
};

// what the customer's own order looks like to them: no print-file links (they are the print team's), plus the button
export const forCustomer = (order) => {
  const o = typeof order?.toObject === "function" ? order.toObject() : { ...order };
  delete o.printFiles;
  o.cancelMode = customerCancelMode(order);
  return o;
};

let client = null;
const razorpay = () => {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key_id || !key_secret) return null;
  if (!client) client = new Razorpay({ key_id, key_secret });
  return client;
};

/** The order's refund, or null when nothing was refunded (the saved order always has an empty refund box). */
export const refundOf = (order) => (order?.refund?.status ? order.refund : null);

/** Gives a paid order's money back. Never throws: the result says what happened (kept on the order as order.refund). */
export const refundOrder = async (order, { gateway = razorpay() } = {}) => {
  if (!order.isPaid) return null;
  const amount = Number(order.totalPrice) || 0;
  const at = new Date();
  if (order.paymentMethod !== "RAZORPAY" || !order.paymentResult?.id) {
    return { status: "manual", amount, at, error: "Not paid online through Razorpay, so it is refunded by hand." };
  }
  if (!gateway) return { status: "failed", amount, at, error: "The Razorpay keys are not set on this server." };
  try {
    const r = await gateway.payments.refund(order.paymentResult.id, {
      amount: Math.round(amount * 100),
      speed: "normal",
      notes: { order: orderNo(order), reason: "Order cancelled" },
    });
    return {
      id: r.id,
      status: r.status === "processed" ? "processed" : "pending",
      amount: (Number(r.amount) || Math.round(amount * 100)) / 100,
      at,
    };
  } catch (e) {
    return { status: "failed", amount, at, error: String(e?.error?.description || e?.message || "Razorpay refused the refund").slice(0, 300) };
  }
};

// the coupon can be used again: one use fewer, and the customer may use it again unless another live order has it
const giveCouponBack = async (order) => {
  const code = order.coupon?.code;
  if (!code) return;
  const user = order.user?._id || order.user;
  try {
    const stillUsed = await Order.exists({ _id: { $ne: order._id }, user, "coupon.code": code, orderStatus: { $ne: "CANCELLED" } });
    await Offer.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 }, ...(stillUsed ? {} : { $pull: { usedBy: user } }) });
  } catch (e) {
    console.error("[cancel] coupon give-back failed:", e.message);
  }
};

const refundLine = (refund) => {
  if (!refund) return "It was not paid yet (cash on delivery), so there is nothing to refund.";
  if (refund.status === "processed" || refund.status === "pending") return `Refunded ₹${refund.amount} through Razorpay (refund ${refund.id}).`;
  if (refund.status === "manual") return `<b>Refund ₹${refund.amount} by hand</b>: ${plain(refund.error)}`;
  return `<b>The automatic refund of ₹${refund.amount} FAILED — refund it from the Razorpay dashboard.</b> Reason: ${plain(refund.error)}`;
};

const tellShop = (subject, html) =>
  shopInbox()
    .then((to) => to && mailer().sendMail({ from: fromAddress(), to, subject, html: `<div style="font-family:Arial, sans-serif">${html}</div>` }))
    .catch((e) => console.error("[cancel] shop email failed:", e.message));

const tellPrintTeam = (order) =>
  shopInbox()
    .then((cc) =>
      mailer().sendMail({
        from: fromAddress(),
        to: printTeam(),
        cc: cc || undefined,
        subject: `CANCELLED — please don't print IDENTEE order ${orderNo(order)}`,
        html: `<div style="font-family:Arial, sans-serif"><h2 style="color:#B42318;margin:0 0 8px">Order ${orderNo(order)} is cancelled</h2><p>Please <b>don't print</b> the files we sent for this order. If it is already printed, reply to this email so we know.</p><p style="color:#999;font-size:12px">IDENTEE · info@identee.co.in</p></div>`,
      }),
    )
    .catch((e) => console.error("[cancel] print team email failed:", e.message));

/**
 * Cancels the order. `from`: the statuses it may be cancelled from (claimed in one step, so a double click, or a
 * customer and an admin at the same moment, can't cancel — and refund — twice).
 * @returns the saved order (user populated)
 */
export const cancelOrder = async (orderId, { by, from, gateway } = {}) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, orderStatus: { $in: from } },
    { $set: { orderStatus: "CANCELLED", cancelledAt: new Date(), cancelledBy: by }, $unset: { statusUndo: 1 } },
    { new: true },
  ).populate("user", "name email");
  if (!order) {
    const now = await Order.findById(orderId).select("orderStatus");
    if (!now) throw httpError(404, "Order not found");
    throw httpError(409, `This order is already ${now.orderStatus.toLowerCase().replace(/_/g, " ")}, so it can't be cancelled.`);
  }

  await returnStock(order.orderItems.map((i) => ({ product: i.product || null, size: i.size, qty: i.qty }))).catch((e) =>
    console.error("[cancel] stock give-back failed:", e.message),
  );
  await giveCouponBack(order);
  const refund = await refundOrder(order, gateway === undefined ? undefined : { gateway });
  if (refund) order.refund = refund;
  if (order.cancelRequest?.status === "pending") {
    order.cancelRequest.status = "approved";
    order.cancelRequest.decidedAt = new Date();
  }
  await order.save();

  // emails: they never undo the cancel
  if (!order.isTest) {
    await tellShop(
      `Order ${orderNo(order)} cancelled${by === "customer" ? " by the customer" : ""}`,
      `<p>Order <b>${orderNo(order)}</b> (${order.orderItems.length} item${order.orderItems.length === 1 ? "" : "s"}, ₹${order.totalPrice}) is cancelled${by === "customer" ? " by the customer" : ""}.</p><p>${refundLine(refund)}</p>${sentToPrintTeam(order) ? "<p>Its print files had gone to the print team: they have been emailed not to print it.</p>" : ""}`,
    );
    if (sentToPrintTeam(order)) await tellPrintTeam(order);
  }
  if (order.user?.email) {
    await sendEmail({ email: order.user.email, status: "CANCELLED", order, refund, copy: false }).catch((e) =>
      console.error("[cancel] customer email failed:", e.message),
    );
  }
  return order;
};

/** The customer asks to cancel an order that is packed or already with the print team. */
export const requestCancel = async (orderId, { reason = "" } = {}) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, orderStatus: { $in: ASKABLE }, "cancelRequest.status": { $nin: ["pending", "declined"] } },
    { $set: { cancelRequest: { status: "pending", at: new Date(), reason: plain(reason).slice(0, 300) } } },
    { new: true },
  ).populate("user", "name email");
  if (!order) throw httpError(409, "This order can't be cancelled any more. Please contact us and we'll help.");
  if (!order.isTest) {
    await tellShop(
      `Cancel request: order ${orderNo(order)}`,
      `<p>The customer asks to cancel order <b>${orderNo(order)}</b> (₹${order.totalPrice}, ${order.orderStatus.toLowerCase().replace(/_/g, " ")}${sentToPrintTeam(order) ? ", print files already sent to the print team" : ""}).</p>${order.cancelRequest.reason ? `<p>Reason: ${order.cancelRequest.reason}</p>` : ""}<p>Approve or decline it in <b>Admin → Orders</b>.</p>`,
    );
  }
  return order;
};

/** The admin's answer to a cancel request: "approve" cancels (and refunds), "decline" keeps the order. */
export const decideCancelRequest = async (orderId, decision, { gateway } = {}) => {
  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) throw httpError(404, "Order not found");
  if (order.cancelRequest?.status !== "pending") throw httpError(409, "There is no cancel request waiting on this order.");
  if (decision === "approve") return cancelOrder(order._id, { by: "customer", from: ASKABLE, gateway });
  if (decision !== "decline") throw httpError(400, 'decision must be "approve" or "decline"');
  order.cancelRequest.status = "declined";
  order.cancelRequest.decidedAt = new Date();
  await order.save();
  if (order.user?.email) {
    await sendEmail({ email: order.user.email, status: "CANCEL_DECLINED", order, copy: false }).catch((e) =>
      console.error("[cancel] decline email failed:", e.message),
    );
  }
  return order;
};

// Razorpay webhook: a refund finished or failed later
export const refundUpdate = async (entity) => {
  if (!entity?.id) return;
  const status = entity.status === "processed" ? "processed" : entity.status === "failed" ? "failed" : "pending";
  await Order.updateOne({ "refund.id": entity.id }, { $set: { "refund.status": status } });
};
