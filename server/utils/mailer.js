// utils/mailer.js
//
// One email setup for every email the website sends: login codes, order and invoice emails,
// contact-form messages, enquiries and review notices.
//
// .env:
//   EMAIL_USER / EMAIL_PASS   the sending mailbox and its (app) password
//   EMAIL_HOST / EMAIL_PORT   the mail service's SMTP server, e.g. Zoho: smtp.zoho.in (or smtp.zoho.com), 465
//                             — not set: Gmail, as before (fine for testing; often lands in spam)
//   EMAIL_FROM                the address customers see (defaults to EMAIL_USER); with Zoho it must be
//                             the mailbox itself or one of its aliases, e.g. info@identee.co.in
//
// Messages for the shop (contact form, enquiries, invoice copies) go to the shop's own email from
// Admin → Settings → General (support email, else store email).
import nodemailer from "nodemailer";
import Setting from "../models/settingModel.js";

let transporter;
// Made on first use, so .env is read after it has been loaded.
export const mailer = () => {
  if (!transporter) {
    const host = process.env.EMAIL_HOST?.trim();
    const port = Number(process.env.EMAIL_PORT) || 587;
    transporter = nodemailer.createTransport({
      ...(host ? { host, port, secure: port === 465 } : { service: "gmail" }),
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
};

export const fromEmail = () => process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER;
// `"IDENTEE" <info@identee.co.in>`
export const fromAddress = (name = "IDENTEE") => `"${name.replace(/"/g, "")}" <${fromEmail()}>`;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RX.test(String(v || "").trim());

// The shop's inbox: Admin → Settings → General (support email, else store email), else the sending address.
export async function shopInbox() {
  try {
    const rows = await Setting.find({ key: { $in: ["general.supportEmail", "general.storeEmail"] } }).lean();
    const value = (k) => String(rows.find((r) => r.key === k)?.value || "").trim();
    const found = [value("general.supportEmail"), value("general.storeEmail")].find(isEmail);
    if (found) return found;
  } catch (err) {
    console.error("[mail] couldn't read the shop email from settings:", err.message);
  }
  return fromEmail();
}
