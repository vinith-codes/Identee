import express from "express";

import {
  getShippingCost,
  addStateShipping,
  updateStateShipping,
  updateFreeShipping,
  updateFlatShipping,
  deleteStateShipping,
  getShippingCostByState,
} from "../controllers/shippingControler.js";
import { protect, adminOnly} from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/getshippingcost").get(getShippingCost);
router.route("/addstate").post(protect, adminOnly, addStateShipping);
router
  .route("/updatestate/:id")
  .put(protect, adminOnly, updateStateShipping);
router.route("/updatefreeshipping").put(protect, adminOnly, updateFreeShipping);
// flat shipping by pieces (₹100, free from 3 pieces)
router.route("/flatshipping").put(protect, adminOnly, updateFlatShipping);
router.route("/deletestate/:id").delete(protect, adminOnly, deleteStateShipping);
router.route("/getshippingcostbystate").get(protect, getShippingCostByState);
router.get("/cost", protect, getShippingCostByState);
export default router;