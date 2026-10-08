import multer from "multer";

// Keeps uploads in memory so they can be sent to Cloudinary (see utils/imageStorage.js).
// Checks the real MIME type; SVG is not accepted (it can carry scripts).
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error("Only JPG, PNG or WebP images are allowed"), { status: 400 })),
});

// Category tile + optional wide banner.
export const uploadCategoryImages = (req, res, next) =>
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      res.status(err.code === "LIMIT_FILE_SIZE" ? 400 : err.status || 400);
      return next(
        err.code === "LIMIT_FILE_SIZE" ? new Error("Image must be 5 MB or smaller") : err,
      );
    }
    next();
  });
