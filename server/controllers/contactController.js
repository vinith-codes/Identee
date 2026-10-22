import ContactMessage from "../models/ContactMessage.js";
import mailer from "../utils/contactmailer.js";
import { fromAddress, isEmail, shopInbox } from "../utils/mailer.js";
import asyncHandler from "express-async-handler";

const sendContactEmail = asyncHandler(async (req, res) => {
  const { email, message } = req.body;
  // the page also asks for a name and a phone (both optional) — they go into the email to the shop (22 Oct 2026)
  const name = String(req.body.name || "").trim().slice(0, 100);
  const phone = String(req.body.phone || "").trim().slice(0, 30);

  if (!email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address" });
  }

  try {
    // 1. Save message in DB (optional but recommended)
    await ContactMessage.create({ email, message });

    // 2. Send email
    // to the shop's own email (Admin → Settings → General); pressing Reply answers the customer
    await mailer().sendMail({
      from: fromAddress("IDENTEE website"),
      to: await shopInbox(),
      replyTo: String(email).trim(),
      subject: "New message from the IDENTEE contact page",
      text: `From: ${name ? `${name} <${email}>` : email}${phone ? `\nPhone: ${phone}` : ""}\n\nMessage:\n${message}`,
    });

    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Email sending failed" });
  }
});

export { sendContactEmail };
