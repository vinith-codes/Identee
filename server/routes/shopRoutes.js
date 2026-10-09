// routes/shopRoutes.js — the customer's ready-made shop
import express from "express";
import optionalAuth from "../middleware/optionalAuthMiddleware.js";
import { listShopProducts } from "../controllers/shopController.js";

const router = express.Router();

router.get("/products", optionalAuth, listShopProducts);

export default router;
