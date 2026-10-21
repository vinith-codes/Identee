// routes/enquiryRoutes.js
// ─────────────────────────────────────────────────────────────
// Validation rules (express-validator) + controller binding.
//
// Mount in server.js / app.js:
//   const enquiryRoutes = require("./routes/enquiryRoutes");
//   app.use("/api/enquiry", enquiryRoutes);
// ─────────────────────────────────────────────────────────────

import express from "express";
import { body } from "express-validator";
import {
  bulkEnquiry,
  internationalEnquiry,
} from "../controllers/Enquirycontroller.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

// Visitors can write without logging in, so one address may send 5 messages per 15 minutes — enough for anyone,
// and someone can't flood the shop's inbox with hundreds of emails (21 Oct 2026). Behind a proxy (the live server)
// this needs TRUST_PROXY=1 in .env, else every visitor would share one count.
const formLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "You've sent a few messages already. Please wait a few minutes, or email us at info@identee.co.in.",
});

// ── Shared validation chains ──────────────────────────────────
const commonRules = [
  body("firstName").trim().notEmpty().withMessage("First name is required."),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("A valid email address is required."),
  body("phone").trim().notEmpty().withMessage("Phone number is required."),
];

// ════════════════════════════════════════════════════════════
//  POST /api/enquiry/bulk
// ════════════════════════════════════════════════════════════
router.post(
  "/bulk",
  formLimit,
  [
    ...commonRules,
    body("preferredTime")
      .notEmpty()
      .withMessage("Preferred call time is required."),
    // Optional fields — sanitise only
    body("gender").optional().trim(),
    body("dobMM").optional().trim(),
    body("dobDD").optional().trim(),
    body("dobYYYY").optional().trim(),
    body("companyName").optional().trim(),
    body("message").optional().trim(),
  ],
  bulkEnquiry,
);

// ════════════════════════════════════════════════════════════
//  POST /api/enquiry/international
// ════════════════════════════════════════════════════════════
router.post(
  "/international",
  formLimit,
  [
    ...commonRules,
    body("dobMM").notEmpty().withMessage("Birth month is required."),
    body("dobDD").notEmpty().withMessage("Birth day is required."),
    body("dobYYYY").notEmpty().withMessage("Birth year is required."),
    body("gender").notEmpty().withMessage("Gender is required."),
  ],
  internationalEnquiry,
);

export default router;
