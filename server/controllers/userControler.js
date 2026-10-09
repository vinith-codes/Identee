import asyncHandler from "express-async-handler";
import { deleteStoredFile } from "../utils/imageStorage.js";
import generateToken from "../utils/generateToken.js";
import User from "../models/userModel.js";
import Product from "../models/productModel.js";
import jwt from "jsonwebtoken";
import OtpChallenge from "../models/otpChallengeModel.js";
import { deliverOtp } from "../services/otpSender.js";
import {
  normalizeIdentifier,
  generateOtp,
  hashOtp,
  otpMatches,
  maskIdentifier,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  SEND_WINDOW_MS,
  MAX_SENDS_PER_WINDOW,
  MAX_VERIFY_ATTEMPTS,
} from "../utils/otp.js";
import Subscription from "../models/subscriptionModel.js";
import Order from "../models/orderModel.js";
import ShippingCost from "../models/shippingcostModel.js";
import { addressProblem } from "../utils/address.js";
import path from "path";
import fs from "fs";
/* ===================== OTP LOGIN (email or phone) =====================
 * 1. POST /api/users/otp/request  { identifier }       -> code sent
 * 2. POST /api/users/otp/verify   { identifier, otp }  -> logged in, or
 *    { needsProfile, signupToken } when no account exists yet
 * 3. POST /api/users/otp/complete { signupToken, name } -> account created
 */

const authPayload = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  isAdmin: user.isAdmin,
  isSeller: user.isSeller,
  isDelivery: user.isDelivery,
  subscription: user.subscription,
  token: generateToken(user._id),
});

const findUserByIdentifier = (identifier, channel) =>
  User.findOne(channel === "email" ? { email: identifier } : { phone: identifier });

// Phone login is built but off until an SMS provider is set up.
// Turn on with PHONE_LOGIN_ENABLED=true (and VITE_PHONE_LOGIN=true on the frontend).
const phoneLoginEnabled = () => process.env.PHONE_LOGIN_ENABLED === "true";

const parseIdentifier = (req, res) => {
  const parsed = normalizeIdentifier(req.body.identifier);
  if (!parsed || (parsed.channel === "phone" && !phoneLoginEnabled())) {
    res.status(400);
    throw new Error(
      phoneLoginEnabled()
        ? "Enter a valid email address or 10-digit mobile number"
        : "Enter a valid email address",
    );
  }
  return parsed;
};

// @desc   Send a login OTP to an email or mobile number
// @route  POST /api/users/otp/request
// @access Public
const requestLoginOtp = asyncHandler(async (req, res) => {
  const { identifier, channel } = parseIdentifier(req, res);
  const now = Date.now();

  let challenge = await OtpChallenge.findOne({ identifier });

  if (challenge) {
    const sinceLast = now - (challenge.lastSentAt?.getTime() || 0);
    if (sinceLast < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
      res.status(429);
      throw new Error(`Please wait ${retryAfter}s before requesting a new code`);
    }
    if (now - challenge.windowStart.getTime() > SEND_WINDOW_MS) {
      challenge.windowStart = new Date(now);
      challenge.sendCount = 0;
    }
    if (challenge.sendCount >= MAX_SENDS_PER_WINDOW) {
      res.status(429);
      throw new Error("Too many codes requested. Please try again in 15 minutes.");
    }
  } else {
    challenge = new OtpChallenge({ identifier, channel, windowStart: new Date(now) });
  }

  const code = generateOtp();

  // Deliver first: if sending fails nothing is stored and the user can retry.
  try {
    await deliverOtp(channel, identifier, code);
  } catch (err) {
    res.status(err.status || 502);
    throw err;
  }

  challenge.channel = channel;
  challenge.codeHash = hashOtp(identifier, code);
  challenge.expiresAt = new Date(now + OTP_TTL_MS);
  challenge.attempts = 0;
  challenge.lastSentAt = new Date(now);
  challenge.sendCount += 1;
  await challenge.save();

  res.json({
    message: `Code sent to ${maskIdentifier(identifier, channel)}`,
    channel,
    resendAfter: RESEND_COOLDOWN_MS / 1000,
  });
});

// @desc   Verify a login OTP; logs in an existing user or starts signup
// @route  POST /api/users/otp/verify
// @access Public
const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { identifier, channel } = parseIdentifier(req, res);
  const otp = String(req.body.otp || "").trim();

  const challenge = await OtpChallenge.findOne({ identifier });

  if (!challenge?.codeHash || challenge.expiresAt < new Date()) {
    res.status(400);
    throw new Error("Code expired or not requested. Please request a new one.");
  }

  if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    res.status(429);
    throw new Error("Too many wrong attempts. Please request a new code.");
  }

  if (!otpMatches(identifier, otp, challenge.codeHash)) {
    challenge.attempts += 1;
    await challenge.save();
    const left = MAX_VERIFY_ATTEMPTS - challenge.attempts;
    res.status(400);
    throw new Error(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many wrong attempts. Please request a new code.",
    );
  }

  // Single use: clear the code but keep the doc so send rate limits still apply.
  challenge.codeHash = undefined;
  challenge.expiresAt = undefined;
  await challenge.save();

  const user = await findUserByIdentifier(identifier, channel);

  // name "temp" = half-finished signup from the old flow: ask for the name again.
  if (user && user.name !== "temp") {
    const verifiedField = channel === "email" ? "isEmailVerified" : "isPhoneVerified";
    user[verifiedField] = true;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    return res.json(authPayload(user));
  }

  // New user: hand back a short-lived token proving this identifier was verified.
  const signupToken = jwt.sign(
    { purpose: "signup", identifier, channel },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
  res.json({ needsProfile: true, signupToken, channel });
});

// @desc   Create the account for a verified identifier
// @route  POST /api/users/otp/complete
// @access Public (requires signupToken from verify)
const completeOtpSignup = asyncHandler(async (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(String(req.body.signupToken || ""), process.env.JWT_SECRET);
  } catch {
    decoded = null;
  }
  if (decoded?.purpose !== "signup") {
    res.status(401);
    throw new Error("Your verification expired. Please log in again.");
  }

  const name = String(req.body.name || "").trim();
  if (name.length < 2 || name.length > 50) {
    res.status(400);
    throw new Error("Please enter your name (2–50 characters)");
  }

  const { identifier, channel } = decoded;

  // Double submit / race: the account may already exist — just log in.
  const existing = await findUserByIdentifier(identifier, channel);
  if (existing) {
    if (existing.name === "temp") {
      // Legacy half-finished signup: claim it (its old password is discarded).
      existing.name = name;
      existing.password = undefined;
      existing.otp = undefined;
      existing.expiresAt = undefined;
    }
    existing[channel === "email" ? "isEmailVerified" : "isPhoneVerified"] = true;
    existing.lastLoginAt = new Date();
    await existing.save({ validateBeforeSave: false });
    return res.json(authPayload(existing));
  }

  const user = await User.create({
    name,
    ...(channel === "email"
      ? { email: identifier, isEmailVerified: true }
      : { phone: identifier, isPhoneVerified: true }),
    addresses: [],
    lastLoginAt: new Date(),
  });

  res.status(201).json(authPayload(user));
});

// @desc Delete user's profile picture
// @route DELETE /api/users/profile-picture
// @access Private
const deleteProfilePicture = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.profilePicture && !user.profilePicture.includes("default-profile")) {
    await deleteStoredFile(user.profilePicture);
  }

  user.profilePicture = "/images/default-profile.png";
  await user.save();

  res.status(200).json({ message: "Profile picture deleted" });
});

// ROUTER:
// router.post("/resetPassword", resetPasswordWithOtp); // No change needed here
// @desc Get user profile
// @route GET /api/users/profile
// @access Private
// const getUserProfile = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.user._id);

//   if (user) {
//     res.json({
//       _id: user._id,
//       name: user.name,
//       email: user.email,
//       lastName: user.lastName,
//       gender: user.gender,
//       dateOfBirth: user.dateOfBirth,
//       isAdmin: user.isAdmin,
//       profilePicture: user.profilePicture,
//       isDelivery: user.isDelivery,
//       addresses: user.addresses,
//       subscription: user.subscription,
//       isSubscribed: user.isSubscribed,
//     });
//   } else {
//     res.status(404);
//     throw new Error("User not found");
//   }
// });

// @desc Get user profile with full subscription details
// @route GET /api/users/profile
// @access Private
const getUserProfile = asyncHandler(async (req, res) => {
  // Find user and populate subscription details
  const user = await User.findById(req.user._id)
    .populate(
      "subscription.subscriptionId",
      "title description offers price discountPercent startDate endDate",
    )
    .select("-password");

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      lastName: user.lastName,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      isAdmin: user.isAdmin,
      profilePicture: user.profilePicture,
      isDelivery: user.isDelivery,
      addresses: user.addresses,
      subscription: user.subscription
        ? {
            subscriptionId: user.subscription.subscriptionId?._id,
            title: user.subscription.subscriptionId?.title,
            description: user.subscription.subscriptionId?.description,
            offers: user.subscription.subscriptionId?.offers,
            planName: user.subscription.planName,
            price: user.subscription.price,
            discountPercent: user.subscription.discountPercent,
            isActive: user.subscription.isActive,
            startDate: user.subscription.startDate,
            endDate: user.subscription.endDate,
          }
        : null,
      isSubscribed: user.isSubscribed,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc Update user profile
// @route PUT /api/users/profile
// @access Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Store old profile picture path BEFORE any changes
  const oldProfilePicture = user.profilePicture;

  /* ---------- BASIC FIELDS ---------- */
  // email/phone are login identifiers verified by OTP, so they can't be
  // changed here (that would let anyone claim an unverified address).
  user.name = req.body.name ?? user.name;
  user.lastName = req.body.lastName ?? user.lastName;
  user.gender = req.body.gender ?? user.gender;
  user.dateOfBirth = req.body.dateOfBirth ?? user.dateOfBirth;

  /* ---------- ADDRESSES ---------- */
  if (req.body.addresses) {
    let addresses =
      typeof req.body.addresses === "string"
        ? JSON.parse(req.body.addresses)
        : req.body.addresses;

    addresses = addresses.map((addr) => ({
      ...addr,
      pin: addr.pin ? Number(addr.pin) : null,
      phoneNumber: addr.phoneNumber ? Number(addr.phoneNumber) : null,
    }));

    if (!addresses.some((a) => a.isDefault) && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    // ✅ NEW — validate every address's state against the live ShippingCost
    // rules before saving. The frontend Account page now uses a <select>
    // fed from this same collection, so normal usage can't produce a bad
    // state string — but a direct API call still could, and a bad state
    // saved here is exactly what silently broke checkout later (the
    // "Shipping not available for state: X" error, or the address
    // slipping through with an unmatched state entirely). Reject up front
    // instead of saving addresses that can never actually be delivered to.
    const shippingSettings = await ShippingCost.findOne();
    const validStates = (shippingSettings?.shippingRules || []).map((r) =>
      r.state.trim().toLowerCase(),
    );

    if (validStates.length > 0) {
      const invalidAddress = addresses.find(
        (addr) =>
          !addr.state || !validStates.includes(addr.state.trim().toLowerCase()),
      );
      if (invalidAddress) {
        res.status(400);
        throw new Error(
          `"${invalidAddress.state || "(empty)"}" is not a state we currently deliver to. Please select a valid state.`,
        );
      }
    }
    // If no shipping rules are configured at all yet, skip this check —
    // there's nothing to validate against, and blocking address saves
    // entirely in that case would be worse than letting them through.

    // Validate new/edited addresses only, so an old saved address that
    // predates these rules doesn't block every profile save.
    const fieldsKey = (a) =>
      ["doorNo", "street", "nearestLandmark", "city", "state", "pin", "phoneNumber"]
        .map((k) => String(a?.[k] ?? "").trim())
        .join("|");
    const unchanged = new Set((user.addresses || []).map(fieldsKey));
    for (const addr of addresses) {
      if (unchanged.has(fieldsKey(addr))) continue;
      const problem = addressProblem(addr);
      if (problem) {
        res.status(400);
        throw new Error(problem);
      }
    }

    user.addresses = addresses;
  }

  /* ---------- PROFILE IMAGE ---------- */
  if (req.file) {
    // Set new profile picture path
    user.profilePicture = req.file.path;
  }

  // Save the updated user FIRST
  const updatedUser = await user.save();

  /* ---------- DELETE OLD IMAGE AFTER SUCCESSFUL SAVE ---------- */
  // Only delete old image if:
  // 1. A new file was uploaded
  // 2. Old picture exists and is not default
  // 3. Old picture is different from new picture
  if (
    req.file &&
    oldProfilePicture &&
    !oldProfilePicture.includes("default-profile") &&
    oldProfilePicture !== updatedUser.profilePicture
  ) {
    await deleteStoredFile(oldProfilePicture); // never throws
  }

  res.json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    phone: updatedUser.phone,
    profilePicture: updatedUser.profilePicture,
    addresses: updatedUser.addresses,
    isAdmin: updatedUser.isAdmin,
    isSeller: updatedUser.isSeller,
    isDelivery: updatedUser.isDelivery,
    token: generateToken(updatedUser._id),
  });
});

// @desc Update user user
// @route PUT /api/users/:id
// @access Private/Admin

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.isAdmin = req.body.isAdmin ?? user.isAdmin;
    user.isDelivery = req.body.isDelivery ?? user.isDelivery;
    user.isSeller = req.body.isSeller ?? user.isSeller;
    user.hideUserManagement =
      req.body.hideUserManagement ?? user.hideUserManagement;

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      isDelivery: updatedUser.isDelivery,
      isSeller: updatedUser.isSeller,
      hideUserManagement: updatedUser.hideUserManagement,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc Get All users
// @route GET /api/users
// @access Private/admin
// const getUsers = asyncHandler(async (req, res) => {
//   const users = await User.find({}).populate(
//     "orderHistory",
//     "totalPrice isPaid createdAt _id"
//   );
//   res.json(users);
// });

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select("-password");

  const usersWithOrderCount = await Promise.all(
    users.map(async (user) => {
      const orderCount = await Order.countDocuments({ user: user._id });

      return {
        ...user.toObject(),
        orderCount,
      };
    }),
  );

  res.json(usersWithOrderCount);
});

// @desc Get user by ID
// @route GET /api/users/:id
// @access Private/admin
const getUserByID = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (user) {
    res.json(user);
    console.log(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
// @desc Delete User
// @route DELETE /api/users/:id
// @access Private/admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    await user.deleteOne({ _id: req.params.id });
    res.json({ message: "User removed" });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
// @desc Add or Remove from Favorites
// @route POST /api/products/favorites/:id
// @access Private
const toggleFavorite = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const product = await Product.findById(req.params.id);
  const user = await User.findById(userId).populate("favorites");

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const isFavorite = user.favorites.some(
    (item) => item._id.toString() === product._id.toString(),
  );

  if (isFavorite) {
    user.favorites = user.favorites.filter(
      (item) => item._id.toString() !== product._id.toString(),
    );
    await user.save();
    res
      .status(200)
      .json({ message: "Removed from favorites", favorites: user.favorites });
  } else {
    user.favorites.push(product);
    await user.save();
    res
      .status(200)
      .json({ message: "Added to favorites", favorites: user.favorites });
  }
});

// @desc Get user favorites
// @route GET /api/products/favorites
// @access Private
const getFavorites = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Check if the user exists and populate favorites
  const user = await User.findById(userId)
    .select("favorites")
    .populate("favorites");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json(user.favorites);
});
// @desc Get logged-in user's cart items (populated)
// @route GET /api/users/cart
// @access Private
const getCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate("cartItems.product", "brandname images price")
    .populate("cartItems.customization", "name garmentType color size mockups orderedAt");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  res.json(user.cartItems);
});

// @desc Activate user subscription after payment
// @route POST /api/users/subscribe
// @access Private

export {
  requestLoginOtp,
  verifyLoginOtp,
  completeOtpSignup,
  getUserProfile,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserByID,
  updateUser,
  toggleFavorite,
  getFavorites,
  deleteProfilePicture,
  getCart,
};
