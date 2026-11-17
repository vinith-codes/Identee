// services/shareService.js — "Share my tee" to WhatsApp (17 Nov 2026; server: /api/share, controllers/shareController.js)
// The tee's share card goes to the server, which gives back a small public page; WhatsApp opens with a message and that
// link, and shows the tee picture as the link's preview.
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("The picture couldn’t be read."));
    r.readAsDataURL(blob);
  });

/** Uploads the share card. @returns {Promise<{ id: string, page: string, image: string }>} */
export async function makeShareLink(blob, title) {
  const image = await toDataUrl(blob);
  return (await axios.post(`${BACKEND_URL}/api/share`, { image, title }, { timeout: 60000 })).data;
}

/** WhatsApp's own "send this message" address: opens the app on a phone, WhatsApp Web on a laptop. */
export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** The message that goes with the link (the link last, so WhatsApp makes its preview from it). */
export const shareMessage = (garmentLabel, page) => `My ${garmentLabel || "tee"} design on IDENTEE 👕 What do you think?\n${page}`;
