import crypto from "crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
export const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between sends
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5;
export const MAX_VERIFY_ATTEMPTS = 5;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turns user input into { identifier, channel } or null if it is neither a
// valid email nor a valid Indian mobile number. Phones are stored as +91XXXXXXXXXX.
export const normalizeIdentifier = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.includes("@")) {
    const email = value.toLowerCase();
    return EMAIL_RX.test(email) ? { identifier: email, channel: "email" } : null;
  }

  let digits = value.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

  return /^[6-9]\d{9}$/.test(digits)
    ? { identifier: `+91${digits}`, channel: "phone" }
    : null;
};

export const generateOtp = () =>
  crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");

export const hashOtp = (identifier, code) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${identifier}:${code}`)
    .digest("hex");

export const otpMatches = (identifier, code, codeHash) => {
  if (!codeHash || !/^\d+$/.test(String(code || ""))) return false;
  const a = Buffer.from(hashOtp(identifier, String(code)), "hex");
  const b = Buffer.from(codeHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Shows "+91 98•••••210" / "jo•••@gmail.com" in API responses.
export const maskIdentifier = (identifier, channel) => {
  if (channel === "phone") {
    return `+91 ${identifier.slice(3, 5)}•••••${identifier.slice(-3)}`;
  }
  const [user, domain] = identifier.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
};
