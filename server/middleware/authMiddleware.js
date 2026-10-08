import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = decoded.id
        ? await User.findById(decoded.id).select("-password")
        : null;
    } catch (error) {
      req.user = null;
    }

    // Bad/expired token, a signup-only token, or a deleted account.
    if (!req.user) {
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
    return next();
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }
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
