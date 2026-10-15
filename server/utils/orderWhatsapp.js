// utils/orderWhatsapp.js — order updates on WhatsApp, next to the emails (utils/sendEmail.js).
//
// Sent only when: the server has the WhatsApp keys (services/whatsappService.js), the admin has not switched it
// off (Admin → Settings → WhatsApp, setting "whatsapp.enabled"), and the customer ticked "Send order updates on
// WhatsApp" at checkout (order.whatsapp.optIn — older orders without it get nothing). Never throws: a failed
// message is logged (WhatsappLog) and the order carries on.
//
// Each step uses a template that must be created and approved in Meta's WhatsApp Manager with EXACTLY this name,
// category "Utility", language English, and this body ({{1}}, {{2}}… are filled in from the order).
import Setting from "../models/settingModel.js";
import WhatsappLog from "../models/whatsappLogModel.js";
import { maskNumber, sendTemplate, toWhatsappNumber, whatsappConfigured } from "../services/whatsappService.js";

export const ORDER_TEMPLATES = {
  ORDERED: {
    name: "identee_order_placed",
    step: "Order placed",
    body: "Hi {{1}}, thank you for shopping with IDENTEE! Your order {{2}} for ₹{{3}} has been placed. We’ll message you here when it’s packed and on its way.",
    sample: ["Priya", "VF-2026-0026", "1,798"],
  },
  PACKED: {
    name: "identee_order_packed",
    step: "Packed",
    body: "Hi {{1}}, your IDENTEE order {{2}} is packed and will be handed to our delivery partner soon.",
    sample: ["Priya", "VF-2026-0026"],
  },
  OUT_FOR_DELIVERY: {
    name: "identee_order_shipped",
    step: "Out for delivery",
    body: "Hi {{1}}, your IDENTEE order {{2}} is on its way to {{3}}. It should reach you soon.",
    sample: ["Priya", "VF-2026-0026", "Chennai"],
  },
  DELIVERED: {
    name: "identee_order_delivered",
    step: "Delivered",
    body: "Hi {{1}}, your IDENTEE order {{2}} has been delivered. We hope you love it! If anything isn’t right, reply to this message.",
    sample: ["Priya", "VF-2026-0026"],
  },
  CANCELLED: {
    name: "identee_order_cancelled",
    step: "Cancelled",
    body: "Hi {{1}}, your IDENTEE order {{2}} has been cancelled. If you paid online, the refund will reach your account in 5–7 working days.",
    sample: ["Priya", "VF-2026-0026"],
  },
};

export const whatsappEnabled = async () => {
  const s = await Setting.findOne({ key: "whatsapp.enabled" }).select("value").lean();
  return s ? s.value !== false : true; // on unless the admin switched it off
};

const orderNumberOf = (order) => order.invoiceNumber || order._id.toString().slice(-8).toUpperCase();
const firstNameOf = (order) => {
  const a = order.shippingAddress || {};
  const name = a.firstName || order.user?.name || "";
  return String(name).trim().split(/\s+/)[0] || "there";
};
const paramsFor = (event, order) => {
  const base = [firstNameOf(order), orderNumberOf(order)];
  if (event === "ORDERED") return [...base, Number(order.totalPrice || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })];
  if (event === "OUT_FOR_DELIVERY") return [...base, order.shippingAddress?.city || "your address"];
  return base;
};

/**
 * Send the WhatsApp update for an order step (ORDERED, PACKED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED).
 * @returns {Promise<boolean>} true when Meta accepted it
 */
export async function notifyOrderWhatsapp(order, event) {
  const tpl = ORDER_TEMPLATES[event];
  try {
    if (!tpl || !order || !whatsappConfigured() || order.whatsapp?.optIn !== true) return false;
    if (!(await whatsappEnabled())) return false;
    const to = toWhatsappNumber(order.shippingAddress?.phoneNumber) || toWhatsappNumber(order.shippingAddress?.secondaryPhone);
    const log = { order: order._id, orderNumber: orderNumberOf(order), event, template: tpl.name, to: maskNumber(to) };
    if (!to) {
      await WhatsappLog.create({ ...log, ok: false, error: "No mobile number on this order that WhatsApp can use." });
      return false;
    }
    try {
      const { id } = await sendTemplate({ to, name: tpl.name, params: paramsFor(event, order) });
      await WhatsappLog.create({ ...log, ok: true, messageId: id });
      return true;
    } catch (err) {
      await WhatsappLog.create({ ...log, ok: false, error: String(err.message || err).slice(0, 300) });
      return false;
    }
  } catch (err) {
    console.error("[whatsapp] order update failed:", err.message);
    return false;
  }
}
