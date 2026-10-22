import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Waitlist from "../models/waitlistModel.js";
import { mailer, fromAddress, isEmail } from "../utils/mailer.js";
import { siteAddress } from "../utils/siteAddress.js";

// One click of "Send" emails at most this many people, one after the other: the mail service stays within its
// limits and the request ends long before the web server's time limit. The admin page clicks again for the rest.
const SEND_AT_ONCE = 40;

const escapeHtml = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// the logged-in visitor's id, if a valid login came with the request (joining works without one)
const optionalUserId = (req) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  try {
    const id = jwt.verify(h.slice(7), process.env.JWT_SECRET)?.id;
    return mongoose.isValidObjectId(id) ? id : null;
  } catch {
    return null;
  }
};

// @desc   Join the "Notify me" list (the strip at the top of the site)
// @route  POST /api/waitlist   { email }
// @access Public (5 per 15 minutes per visitor)
const joinWaitlist = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isEmail(email) || email.length > 200) {
    res.status(400);
    throw new Error("Enter a valid email address");
  }
  const user = optionalUserId(req);
  await Waitlist.updateOne(
    { email },
    { $setOnInsert: { email, notifiedAt: null }, ...(user ? { $set: { user } } : {}) },
    { upsert: true },
  );
  // the same answer for a new and an existing email, so nobody can test who is on the list
  res.status(201).json({ message: "You're on the list. We'll email you the day the new designs arrive." });
});

// @desc   The list, newest first, with counts
// @route  GET /api/waitlist
// @access Admin
const getWaitlist = asyncHandler(async (req, res) => {
  const entries = await Waitlist.find().sort({ createdAt: -1 }).limit(5000).populate("user", "name").lean();
  const waiting = entries.filter((e) => !e.notifiedAt).length;
  res.json({
    total: entries.length,
    waiting,
    notified: entries.length - waiting,
    entries: entries.map((e) => ({
      _id: e._id,
      email: e.email,
      name: e.user?.name || "",
      loggedIn: !!e.user,
      createdAt: e.createdAt,
      notifiedAt: e.notifiedAt,
    })),
  });
});

// @desc   Email "it's here" to the people not told yet (SEND_AT_ONCE per click)
// @route  POST /api/waitlist/notify   { subject, message, link? }
// @access Admin
const notifyWaitlist = asyncHandler(async (req, res) => {
  const subject = String(req.body?.subject || "").trim().slice(0, 150);
  const message = String(req.body?.message || "").trim().slice(0, 2000);
  if (!subject || !message) {
    res.status(400);
    throw new Error("Write the email's subject and message first.");
  }
  const site = await siteAddress();
  const rawLink = String(req.body?.link || "").trim();
  const link = /^https:\/\//i.test(rawLink) ? rawLink : site;

  const batch = await Waitlist.find({ notifiedAt: null }).sort({ createdAt: 1 }).limit(SEND_AT_ONCE);
  const html = `<div style="font-family:Arial, sans-serif; max-width:560px; margin:auto; color:#15130F;">
    <p style="margin:0 0 6px; font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#B8912F;">IDENTEE</p>
    <h2 style="margin:0 0 14px; font-size:22px;">${escapeHtml(subject)}</h2>
    <p style="margin:0 0 22px; font-size:15px; line-height:1.6; white-space:pre-line;">${escapeHtml(message)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block; background:#15130F; color:#F0D585; text-decoration:none; padding:12px 24px; border-radius:999px; font-weight:bold;">Visit IDENTEE</a>
    <p style="margin:28px 0 0; font-size:12px; color:#8A8270;">You're getting this one email because you asked us to tell you on ${escapeHtml(site.replace(/^https?:\/\//, ""))}.</p>
  </div>`;

  let sent = 0;
  let failed = 0;
  for (const entry of batch) {
    try {
      await mailer().sendMail({ from: fromAddress(), to: entry.email, subject, html });
      entry.notifiedAt = new Date();
      await entry.save();
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error("[waitlist] email failed:", entry.email, err?.code || "", err?.message || err);
    }
  }
  const left = await Waitlist.countDocuments({ notifiedAt: null });
  res.json({
    sent,
    failed,
    left,
    message:
      `${sent} email${sent === 1 ? "" : "s"} sent` +
      (failed ? `, ${failed} couldn't be sent (check the email settings)` : "") +
      "." +
      (left ? ` ${left} still waiting — click Send again for the next ${Math.min(left, SEND_AT_ONCE)}.` : " Everyone on the list has been told."),
  });
});

// @desc   Remove one email from the list (someone asked to be taken off)
// @route  DELETE /api/waitlist/:id
// @access Admin
const removeFromWaitlist = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404);
    throw new Error("Not found");
  }
  await Waitlist.deleteOne({ _id: req.params.id });
  res.json({ message: "Removed from the list" });
});

export { joinWaitlist, getWaitlist, notifyWaitlist, removeFromWaitlist };
