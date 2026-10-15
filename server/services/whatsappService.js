// services/whatsappService.js — WhatsApp messages through Meta's WhatsApp Cloud API (no middleman).
//
// Off until the server's settings file has both:
//   WHATSAPP_TOKEN            a permanent access token (a "system user" token from Meta Business settings)
//   WHATSAPP_PHONE_NUMBER_ID  the ID of the business phone number (WhatsApp Manager → Phone numbers)
// Optional: WHATSAPP_API_VERSION (default v21.0), WHATSAPP_LANG (template language, default "en").
// The token is never logged or sent anywhere but Meta.
//
// A business may message a customer first only with a TEMPLATE approved by Meta (see utils/orderWhatsapp.js
// for the order templates and their exact wording).

const API = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}`;

export const whatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
export const whatsappLanguage = () => process.env.WHATSAPP_LANG?.trim() || "en";

// A customer's number in the form WhatsApp wants (country code, digits only), or null.
// Indian numbers are stored as 10 digits: they get 91 in front.
export function toWhatsappNumber(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  if (d.length === 12 && d.startsWith("91") && /^[6-9]/.test(d[2])) return d;
  return null;
}
// for logs and the admin page: +91 98•••••210
export const maskNumber = (n) => (n ? `+${n.slice(0, 2)} ${n.slice(2, 4)}•••••${n.slice(-3)}` : "");

/**
 * Send an approved template.
 * @param {{ to: string, name: string, params?: string[], language?: string }} msg
 *   to = digits with country code (toWhatsappNumber); params fill the template's {{1}}, {{2}}, … in order
 * @returns {Promise<{ id: string }>}  Meta's message id
 */
export async function sendTemplate({ to, name, params = [], language }) {
  if (!whatsappConfigured()) throw Object.assign(new Error("WhatsApp is not set up on the server."), { status: 503 });
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language || whatsappLanguage() },
      ...(params.length ? { components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t).slice(0, 900) })) }] } : {}),
    },
  };
  const res = await fetch(`${API()}/${process.env.WHATSAPP_PHONE_NUMBER_ID.trim()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Meta's own words, e.g. "Template name does not exist in the translation" — useful on the admin page
    const why = data?.error?.error_data?.details || data?.error?.message || `WhatsApp answered ${res.status}`;
    throw Object.assign(new Error(why), { status: res.status, code: data?.error?.code });
  }
  return { id: data?.messages?.[0]?.id || "" };
}
