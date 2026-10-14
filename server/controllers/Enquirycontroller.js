// controllers/enquiryController.js
// ─────────────────────────────────────────────────────────────
// Handles business logic for:
//   bulkEnquiry        → POST /api/enquiry/bulk
//   internationalEnquiry → POST /api/enquiry/international
//
// Validation lives in routes/enquiryRoutes.js (express-validator).
// Email sending uses utils/enquiryMailSender.js.
// ─────────────────────────────────────────────────────────────

import { validationResult } from "express-validator";
import {
  transporter,
  emailWrapper,
  fieldRow,
  autoReplyBody,
} from "../utils/enquiryMailSender.js";
import { fromAddress, shopInbox } from "../utils/mailer.js";

const SENDER = () => fromAddress("IDENTEE");

// ── Helper: check express-validator result ────────────────────
const checkValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return false;
  }
  return true;
};

// ════════════════════════════════════════════════════════════
//  bulkEnquiry
//  POST /api/enquiry/bulk
// ════════════════════════════════════════════════════════════
const bulkEnquiry = async (req, res) => {
  if (!checkValidation(req, res)) return;

  const {
    firstName,
    email,
    phone,
    preferredTime,
    gender,
    dobMM,
    dobDD,
    dobYYYY,
    companyName,
    message,
  } = req.body;

  const birthday =
    dobMM && dobDD && dobYYYY ? `${dobMM} / ${dobDD} / ${dobYYYY}` : null;

  // ── Admin notification ──────────────────────────────────────
  const adminHtml = `
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
      A new <strong>Bulk Purchase</strong> enquiry has been submitted.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${fieldRow("First Name", firstName)}
      ${fieldRow(
        "Email",
        `<a href="mailto:${email}" style="color:#09254a;">${email}</a>`,
      )}
      ${fieldRow("Phone", phone)}
      ${fieldRow("Preferred Call Time", preferredTime)}
      ${fieldRow("Gender", gender || "—")}
      ${fieldRow("Birthday", birthday || "—")}
      ${fieldRow("Company", companyName || "—")}
      ${fieldRow("Message", message ? message.replace(/\n/g, "<br/>") : "—")}
    </table>`;

  // ── Customer auto-reply ─────────────────────────────────────
  const customerHtml = autoReplyBody(
    firstName,
    "Bulk Purchase",
    `Our team will call you during your preferred time slot:
     <strong>${preferredTime}</strong>.`,
  );

  try {
    await Promise.all([
      // → store owner / admin
      transporter.sendMail({
        from: SENDER(),
        to: await shopInbox(),
        replyTo: email,
        subject: `📦 Bulk / Corporate Orders — ${firstName}`,
        html: emailWrapper("Bulk / Corporate Orders Enquiry", "#dba751", adminHtml),
      }),
      // → customer confirmation
      transporter.sendMail({
        from: SENDER(),
        to: email,
        subject: `We received your bulk enquiry, ${firstName}!`,
        html: emailWrapper("Enquiry Received", "#dba751", customerHtml),
      }),
    ]);

    return res
      .status(200)
      .json({ success: true, message: "Enquiry sent successfully." });
  } catch (err) {
    console.error("[bulkEnquiry] Mailer error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send email. Please try again later.",
    });
  }
};

// ════════════════════════════════════════════════════════════
//  internationalEnquiry
//  POST /api/enquiry/international
// ════════════════════════════════════════════════════════════
const internationalEnquiry = async (req, res) => {
  if (!checkValidation(req, res)) return;

  const { firstName, email, phone, dobMM, dobDD, dobYYYY, gender } = req.body;

  const birthday = `${dobMM} / ${dobDD} / ${dobYYYY}`;

  // ── Admin notification ──────────────────────────────────────
  const adminHtml = `
    <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
      A new <strong>International Purchase</strong> enquiry has been submitted.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${fieldRow("First Name", firstName)}
      ${fieldRow(
        "Email",
        `<a href="mailto:${email}" style="color:#09254a;">${email}</a>`,
      )}
      ${fieldRow("Phone", phone)}
      ${fieldRow("Birthdate", birthday)}
      ${fieldRow("Gender", gender)}
    </table>`;

  // ── Customer auto-reply ─────────────────────────────────────
  const customerHtml = autoReplyBody(
    firstName,
    "International Purchase",
    "Our international team will reach out shortly with pricing, shipping estimates, and customs guidance for your country.",
  );

  try {
    await Promise.all([
      // → store owner / admin
      transporter.sendMail({
        from: SENDER(),
        to: await shopInbox(),
        replyTo: email,
        subject: `🌐 International Purchase Enquiry — ${firstName}`,
        html: emailWrapper(
          "International Purchase Enquiry",
          "#60a5fa",
          adminHtml,
        ),
      }),
      // → customer confirmation
      transporter.sendMail({
        from: SENDER(),
        to: email,
        subject: `We received your international enquiry, ${firstName}!`,
        html: emailWrapper("Enquiry Received", "#60a5fa", customerHtml),
      }),
    ]);

    return res
      .status(200)
      .json({ success: true, message: "Enquiry sent successfully." });
  } catch (err) {
    console.error("[internationalEnquiry] Mailer error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send email. Please try again later.",
    });
  }
};

export { bulkEnquiry, internationalEnquiry };
