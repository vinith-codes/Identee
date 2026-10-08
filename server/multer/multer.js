import multer from "multer";
import { uploadFile } from "../utils/imageStorage.js";

/*
 * Shared upload middleware for the whole API.
 *
 * Files are held in memory, then stored via utils/imageStorage.js
 * (Cloudinary, or server/uploads/ in development without Cloudinary keys).
 * Afterwards every uploaded file has:
 *   file.path     -> the URL to save in the database (Cloudinary https URL,
 *                    or "/uploads/..." for the local fallback)
 *   file.filename -> same value (some older controllers read this)
 *   file.publicId -> Cloudinary id ("" locally)
 */

/* ==========================
   WHERE EACH FILE GOES (folder under identee/ in Cloudinary)
========================== */
const folderFor = (req, file) => {
  if (file.fieldname === "profilePicture") return "profiles";
  if (file.fieldname === "bannerImage") return "banners/images";
  if (file.fieldname === "images" && req.originalUrl.includes("/reviews")) return "reviews";
  if (file.fieldname === "images") return "products";
  if (file.fieldname === "sizeChart") return "size-charts";
  if (file.fieldname === "design") return "designs";
  if (file.fieldname === "settingsAsset") return "settings";
  if (file.fieldname === "photo") return "garments";
  if (file.fieldname === "thumbnail") return "art-categories";
  if (file.fieldname === "image" && req.originalUrl.includes("/art-designs")) return "art-designs";
  if (
    file.fieldname === "image" &&
    (req.originalUrl.includes("/api/banners") || req.originalUrl.includes("/api/categorybanner"))
  ) {
    return "banners/images";
  }
  if (file.mimetype.startsWith("video/")) return "banners/videos";
  if (file.mimetype === "application/pdf") return "pdfs";
  return "others";
};

/* ==========================
   FILE FILTER (SVG is not accepted — it can carry scripts)
========================== */
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/jfif",
  "video/mp4",
  "video/avi",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "application/pdf",
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { status: 400 }), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  // Videos up to 100 MB (Cloudinary free plan limit); images are capped at
  // 10 MB by Cloudinary itself and rejected with a clear message.
  limits: { fileSize: 100 * 1024 * 1024 },
});

/* ==========================
   STORE FILES, THEN SET file.path TO THE SAVED URL
========================== */
const allFiles = (req) => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
  return [];
};

const storeFiles = async (req, res, next) => {
  try {
    await Promise.all(
      allFiles(req).map(async (f) => {
        const { url, publicId } = await uploadFile(f.buffer, f.mimetype, folderFor(req, f), f.originalname);
        f.path = url;
        f.filename = url;
        f.publicId = publicId;
        f.buffer = undefined; // free memory
      }),
    );
    next();
  } catch (err) {
    res.status(err.status || 502);
    next(err);
  }
};

// Wraps a multer handler so its errors (size limit, file type) become 400s.
const withErrors = (handler) => (req, res, next) =>
  handler(req, res, (err) => {
    if (!err) return next();
    res.status(err.status || 400);
    next(
      err.code === "LIMIT_FILE_SIZE" ? new Error("File is too large (max 100 MB)") : err,
    );
  });

const pipeline = (handler) => [withErrors(handler), storeFiles];

/* ==========================
   EXPORTS (names unchanged — routes keep working)
========================== */
export const uploadSingleImage = pipeline(upload.single("image"));
export const uploadSingleVideo = pipeline(upload.single("video"));
export const uploadReviewImages = pipeline(upload.array("images", 5));
export const uploadProfileImage = pipeline(upload.single("profilePicture"));
// Variant image replacement — up to 5 files
export const uploadMultipleImages = pipeline(upload.array("images", 5));
// Product create/update — "images" and "sizeChart"
export const uploadProductFiles = pipeline(
  upload.fields([
    { name: "images", maxCount: 50 },
    { name: "sizeChart", maxCount: 1 },
  ]),
);
// Customer artwork uploaded in the customizer
export const uploadDesignFile = pipeline(upload.single("design"));
// Settings — store logo / favicon
export const uploadSettingsAsset = pipeline(upload.single("settingsAsset"));
// Customizer garment photos (Admin → Garment Photos)
export const uploadGarmentPhoto = pipeline(upload.single("photo"));
// Art library (Admin → Art Categories / Art Designs)
export const uploadArtThumbnail = pipeline(upload.single("thumbnail"));
export const uploadArtImage = pipeline(upload.single("image"));
