// routes/myPictureRoutes.js — "My pictures" in the design room (see controllers/myPictureController.js)
import express from "express";
import { listMyPictures, removeMyPicture } from "../controllers/myPictureController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, listMyPictures);
router.delete("/:id", protect, removeMyPicture);

export default router;
