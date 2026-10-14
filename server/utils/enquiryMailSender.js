
// ─────────────────────────────────────────────────────────────
// Nodemailer transporter + reusable HTML email template helpers.
// Imported by controllers/enquiryController.js
// ─────────────────────────────────────────────────────────────

import { mailer, fromEmail } from "./mailer.js";

// ── Transporter: the shared email setup (utils/mailer.js) ─────
const transporter = mailer();

// Verify connection once on startup
transporter.verify((err) => {
  if (err) {
    console.error("❌  Mailer connection failed:", err.message);
  } else {
    console.log("✅  Mailer connected and ready");
  }
});

// ── Branded HTML wrapper ──────────────────────────────────────
/**
 * @param {string} title        - Heading inside the email
 * @param {string} accentColor  - Hex color for the decorative underline
 * @param {string} bodyHtml     - Inner HTML content
 */
const emailWrapper = (title, accentColor, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;
             font-family:'Trebuchet MS',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f6fb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;
                      border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#09254a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;
                         font-weight:700;letter-spacing:-0.02em;">
                ${title}
              </h1>
              <div style="width:40px;height:3px;background:${accentColor};
                          margin:12px auto 0;border-radius:2px;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">${bodyHtml}</td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f6fb;padding:20px 40px;
                       text-align:center;border-top:1px solid #e5e9f0;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Submitted via the website contact form.
                Please do not reply to this email directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── Field row for admin table ─────────────────────────────────
/**
 * Renders one label/value row. Skips row if value is falsy.
 * @param {string} label
 * @param {string} value
 */
const fieldRow = (label, value) =>
  value
    ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f2f5;
                   vertical-align:top;width:38%;">
          <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;
                       text-transform:uppercase;color:#6b7280;">${label}</span>
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid #f0f2f5;
                   vertical-align:top;">
          <span style="font-size:15px;color:#111827;">${value}</span>
        </td>
       </tr>`
    : "";

// ── Customer auto-reply body ──────────────────────────────────
/**
 * @param {string} firstName
 * @param {string} type        - e.g. "Bulk Purchase"
 * @param {string} extraLine   - optional follow-up sentence (HTML allowed)
 */
const autoReplyBody = (firstName, type, extraLine = "") => `
  <p style="font-size:16px;color:#111827;margin:0 0 16px;">
    Hi <strong>${firstName}</strong>,
  </p>
  <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 16px;">
    Thank you for submitting your <strong>${type}</strong> enquiry.
    We have received your details and our team will be in touch shortly.
  </p>
  ${
    extraLine
      ? `<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">
           ${extraLine}
         </p>`
      : ""
  }
  <div style="background:#09254a;border-radius:8px;
              padding:20px 24px;margin:24px 0;">
    <p style="margin:0;color:rgba(255,255,255,0.65);font-size:13px;">
      Need help in the meantime?
    </p>
    <p style="margin:6px 0 0;color:#fbd983;font-size:14px;font-weight:600;">
      ${fromEmail()}
    </p>
  </div>
  <p style="font-size:14px;color:#6b7280;margin:0;">
    Warm regards,<br/>
    <strong style="color:#09254a;">
      The IDENTEE Team
    </strong>
  </p>`;

export { transporter, emailWrapper, fieldRow, autoReplyBody };