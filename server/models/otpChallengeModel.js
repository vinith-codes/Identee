import mongoose from "mongoose";

// One pending OTP per identifier (normalised email or +91 phone).
// Kept out of the User collection so requesting an OTP never creates a user.
const otpChallengeSchema = mongoose.Schema(
  {
    identifier: { type: String, required: true, unique: true },
    channel: { type: String, enum: ["email", "phone"], required: true },
    codeHash: { type: String },
    expiresAt: { type: Date },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
    // Rate-limit window: sendCount OTPs since windowStart.
    windowStart: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Mongo removes stale challenges 30 minutes after their window opened.
otpChallengeSchema.index({ windowStart: 1 }, { expireAfterSeconds: 30 * 60 });

const OtpChallenge = mongoose.model("OtpChallenge", otpChallengeSchema);
export default OtpChallenge;
