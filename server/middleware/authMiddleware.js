import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import { dbReady, DB_STARTING } from "../utils/dbReady.js";

// "Not authorized, token failed" makes the website log the person out (frontend utils/sessionExpiry.js), so it is
// only for a login that is really no good: a bad or expired token, a signup-only token, or a deleted account.
// A database that can't be reached (the backend just started, a network hiccup) is a 503 "try again in a moment"
// (13 Nov 2026: it used to be "token failed" too, and the admin was logged out after every quiet spell).
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer")) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  let decoded = null;
  try {
    decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    decoded = null;
  }
  if (!decoded?.id || !mongoose.isValidObjectId(decoded.id)) {
    res.status(401);
    throw new Error("Not authorized, token failed");
  }

  let user;
  try {
    await dbReady();
    user = await User.findById(decoded.id).select("-password");
  } catch (e) {
    console.warn(`⚠️  Login check: the database didn't answer (${e.message}) — answered 503, not "token failed"`);
    res.status(503);
    throw new Error(DB_STARTING);
  }
  if (!user) {
    res.status(401);
    throw new Error("Not authorized, token failed");
  }
  req.user = user;
  return next();
});

const adminOrSeller = (req, res, next) => {
  if (req.user && (req.user.isAdmin || req.user.isSeller)) {
    next();
  } else {
    res.status(403);
    throw new Error("Not authorized as Admin or Seller");
  }
};
const isDelivery = (req, res, next) => {
  if (req.user && req.user.isDelivery) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a delivery person");
  }
};
const adminOnly = (req, res, next) => {
  if (req.user && req.user.isAdmin && !req.user.isSeller) {
    next();
  } else {
    res.status(403);
    throw new Error("Not authorized as Admin without seller privileges");
  }
};

// Any admin (also admins who are sellers).
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403);
    throw new Error("Not authorized as Admin");
  }
};

export { protect, admin, adminOrSeller, isDelivery, adminOnly };
