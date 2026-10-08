import express from "express";
const router = express.Router();
import {
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

router
  .route("/:id")
  .delete(protect, adminOnly, deleteUser)
  .get(protect, adminOnly, getUserByID)
  .put(protect, adminOnly, updateUser);

export default router;
