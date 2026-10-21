import express from "express";
import {sendContactEmail} from "../controllers/contactController.js";
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

router.post("/send", formLimit, sendContactEmail);

export default router;
