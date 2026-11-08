// routes/printFileRoutes.js — print-ready pictures and "Send to print team" (see controllers/printFileController.js)
import express from "express";
import multer from "multer";
import { protect, adminOnly, adminOrSeller } from "../middleware/authMiddleware.js";
import { downloadPrintZip, dropPrintFile, getPrintFileStatus, getPrintJob, getPrintPictureMeta, getPrintPicturePreview, getPrintPictureSheet, getPrintPictureStream, listSentPrintZips, resendPrintZip, savePrintNote, sendPrintZip, startPrintPicture, uploadPrintZipPart } from "../controllers/printFileController.js";

const router = express.Router();
// the ZIP comes up in parts of a few MB (any file type: the usual picture-only upload rules don't apply here)
const zipPart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }).single("part");

router.get("/status", protect, adminOrSeller, getPrintFileStatus);
router.post("/picture", protect, adminOnly, startPrintPicture);
router.delete("/picture", protect, adminOnly, dropPrintFile);
router.get("/jobs/:id", protect, adminOnly, getPrintJob);
router.get("/picture/:key/meta", protect, adminOrSeller, getPrintPictureMeta);
router.get("/picture/:key/stream", protect, adminOrSeller, getPrintPictureStream);
router.get("/picture/:key/preview.webp", protect, adminOrSeller, getPrintPicturePreview);
router.get("/picture/:key/sheet.png", protect, adminOrSeller, getPrintPictureSheet);
router.post("/orders/:id/upload", protect, adminOnly, zipPart, uploadPrintZipPart);
router.post("/orders/:id/send", protect, adminOnly, sendPrintZip);
router.post("/orders/:id/resend", protect, adminOnly, resendPrintZip);
router.put("/orders/:id/note", protect, adminOnly, savePrintNote);
router.get("/orders/:id/sent", protect, adminOrSeller, listSentPrintZips);
router.get("/dl/:token", downloadPrintZip);

export default router;
