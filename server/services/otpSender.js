import nodemailer from "nodemailer";
import axios from "axios";

// Delivers login OTPs by email or SMS.
//
// SMS provider is picked with SMS_PROVIDER in .env:
//   console (default) — prints the code to the server console. Development only;
//                       in production phone login is reported as unavailable.
//   msg91             — needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID (a DLT-approved
//                       template whose variable is named "otp").
// To add another provider, add a function to smsProviders below.

const isProduction = process.env.NODE_ENV === "production";

export class OtpDeliveryError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/* ---------------- EMAIL ---------------- */

let transporter;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
};

const sendEmailOtp = async (email, code) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    if (isProduction) {
      throw new OtpDeliveryError("Email delivery is not configured", 503);
    }
    console.log(`[OTP][email:dev] ${email} -> ${code}`);
    return;
  }

  try {
    await getTransporter().sendMail({
      from: `"IDENTEE" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${code} is your IDENTEE login code`,
      text: `Your IDENTEE login code is ${code}. It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;line-height:1.6;">
          <h2 style="color:#8A6F2E;margin-bottom:4px;">IDENTEE</h2>
          <p>Your login code is:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:6px;background:#f5f1e6;padding:12px 18px;display:inline-block;border-radius:8px;">${code}</p>
          <p>It expires in <strong>10 minutes</strong>. Never share this code with anyone.</p>
          <p style="color:gray;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>`,
    });
  } catch (err) {
    console.error("[OTP] email send failed:", err.message);
    throw new OtpDeliveryError("Couldn't send the email. Please try again.");
  }
};

/* ---------------- SMS ---------------- */

const smsProviders = {
  console: async (phone, code) => {
    if (isProduction) {
      throw new OtpDeliveryError(
        "Login with mobile number isn't available yet. Please use your email.",
        503,
      );
    }
    console.log(`[OTP][sms:dev] ${phone} -> ${code}`);
  },

  msg91: async (phone, code) => {
    const { MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID } = process.env;
    if (!MSG91_AUTH_KEY || !MSG91_OTP_TEMPLATE_ID) {
      throw new OtpDeliveryError("SMS delivery is not configured", 503);
    }
    try {
      await axios.post(
        "https://control.msg91.com/api/v5/flow",
        {
          template_id: MSG91_OTP_TEMPLATE_ID,
          short_url: "0",
          recipients: [{ mobiles: phone.replace("+", ""), otp: code }],
        },
        { headers: { authkey: MSG91_AUTH_KEY }, timeout: 10000 },
      );
    } catch (err) {
      console.error("[OTP] MSG91 send failed:", err.response?.data || err.message);
      throw new OtpDeliveryError("Couldn't send the SMS. Please try again.");
    }
  },
};

const sendSmsOtp = async (phone, code) => {
  const name = (process.env.SMS_PROVIDER || "console").toLowerCase();
  const provider = smsProviders[name];
  if (!provider) throw new OtpDeliveryError(`Unknown SMS_PROVIDER "${name}"`, 500);
  await provider(phone, code);
};

export const deliverOtp = (channel, identifier, code) =>
  channel === "email" ? sendEmailOtp(identifier, code) : sendSmsOtp(identifier, code);
