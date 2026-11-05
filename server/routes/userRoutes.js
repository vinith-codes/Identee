import express from "express";
const router = express.Router();
import {
  addTeamMember,
  startTestVisit,
  claimTestVisit,
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
  getCart,
  deleteProfilePicture,
} from "../controllers/userControler.js";
import { uploadProfileImage } from "../multer/multer.js";
import {
  adminOrSeller,
  adminOnly,
  protect,
} from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

// Per-IP cap on top of the per-identifier limits in the OTP controller.
const otpIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.route("/").get(protect, adminOrSeller, getUsers);

// Login is OTP-only (email or mobile). See userControler.js for the flow.
router.post("/otp/request", otpIpLimiter, requestLoginOtp);
router.post("/otp/verify", otpIpLimiter, verifyLoginOtp);
router.post("/otp/complete", otpIpLimiter, completeOtpSignup);
router.route("/favorites/:id").post(protect, toggleFavorite);
router.route("/getfavorites").get(protect, getFavorites);
router.route("/cart").get(protect, getCart);

router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, uploadProfileImage, updateUserProfile);

router.delete("/profile/picture", protect, deleteProfilePicture);

// Admin → Customers → "Add an admin": give access to an email, making the account if needed
router.post("/team", protect, adminOnly, addTeamMember);
// Admin → Design Studio → Test as a customer: a one-time code, and the shop's swap of it for a test-mode login
router.post("/test-visit", protect, adminOrSeller, startTestVisit);
router.post("/test-visit/claim", otpIpLimiter, claimTestVisit);

router
  .route("/:id")
  .delete(protect, adminOnly, deleteUser)
  .get(protect, adminOnly, getUserByID)
  .put(protect, adminOnly, updateUser);

export default router;
