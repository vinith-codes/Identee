import express from "express";
import { getOfferByCouponCode,createOffer, updateOffer,getAllOffers,deleteOffer, getOnSiteOffer } from "../controllers/offerController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// public: the coupon shown next to prices (before "/:couponCode", which would take "on-site" as a code)
router.get("/on-site", getOnSiteOffer);
router.route("/:couponCode").get(protect,getOfferByCouponCode);
router.route("/").post(protect, adminOnly, createOffer);
router.route("/:id").put(protect, adminOnly, updateOffer);
router.route("/").get(protect, adminOnly, getAllOffers);
router.route("/:id").delete(protect, adminOnly, deleteOffer);

export default router;
