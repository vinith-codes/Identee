// File storage for everything users/admins upload (images, videos, PDFs).
// Cloudinary when CLOUDINARY_* is configured (survives redeploys, served from
// a CDN, auto-optimised); otherwise local server/uploads/ (dev fallback only —
// local files are lost on redeploy and missing on other machines).
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT_FOLDER = "identee";

// Read lazily: .env may be loaded after this module is imported.
export const usingCloudinary = () => {
  const config = {
    cloud_name: process.env.CLOUDINARY_NAME?.trim(),
    api_key: process.env.CLOUDINARY_APIKEY?.trim(),
    api_secret: process.env.CLOUDINARY_SECRETKEY?.trim(),
  };
  const ok = Boolean(config.cloud_name && config.api_key && config.api_secret);
  if (ok) cloudinary.config(config);
  return ok;
};

const EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

// Cloudinary keeps PDFs as "raw" files (image-type PDFs are blocked on
// new accounts); videos as "video"; everything else as "image".
const resourceTypeFor = (mimetype = "") =>
  mimetype.startsWith("video/") ? "video" : mimetype === "application/pdf" ? "raw" : "image";

/**
 * Stores a file and returns where it lives.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} folder        e.g. "products", "garments", "banners/videos"
 * @param {string} [originalname] used for the extension of raw files / local fallback
 * @returns {Promise<{url: string, publicId: string}>}
 */
export const uploadFile = (buffer, mimetype, folder, originalname = "") => {
  const ext =
    EXT[mimetype] || path.extname(originalname).toLowerCase() || ".bin";

  if (usingCloudinary()) {
    const resource_type = resourceTypeFor(mimetype);
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${ROOT_FOLDER}/${folder}`,
            resource_type,
            // raw files need the extension in their id to be served correctly
            ...(resource_type === "raw"
              ? { public_id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}` }
              : {}),
          },
          (err, result) =>
            err
              ? reject(Object.assign(new Error(err.message || "Upload failed"), { status: 400 }))
              : resolve({ url: result.secure_url, publicId: result.public_id }),
        )
        .end(buffer);
    });
  }

  const dir = path.join("uploads", folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return Promise.resolve({ url: `/uploads/${folder}/${file}`, publicId: "" });
};

// Kept for the categories code: same as uploadFile for images.
export const uploadImage = (buffer, mimetype, folder) => uploadFile(buffer, mimetype, folder);

// Works out Cloudinary's id + type from a delivery URL, e.g.
// https://res.cloudinary.com/<cloud>/image/upload/v123/identee/products/abc.webp
//   -> { resourceType: "image", publicId: "identee/products/abc" }
const parseCloudinaryUrl = (url) => {
  const m = String(url).match(
    /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(identee\/.+)$/,
  );
  if (!m) return null;
  const [, resourceType, rest] = m;
  const publicId = resourceType === "raw" ? rest : rest.replace(/\.[^./]+$/, "");
  return { resourceType, publicId };
};

/**
 * Deletes a stored file. Accepts a Cloudinary URL, a local "/uploads/..." or
 * "uploads/..." path, or a { url, publicId } object. Best effort — never throws.
 */
export const deleteStoredFile = async (fileOrUrl) => {
  try {
    const url = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl?.url;
    if (!url) return;

    if (url.includes("res.cloudinary.com")) {
      const parsed = parseCloudinaryUrl(url);
      if (parsed && usingCloudinary()) {
        await cloudinary.uploader.destroy(parsed.publicId, {
          resource_type: parsed.resourceType,
          invalidate: true,
        });
      }
      return;
    }

    const rel = url.replace(/^\/+/, "");
    if (rel.startsWith("uploads/") && !rel.includes("..")) {
      fs.rmSync(path.join(".", rel), { force: true });
    }
  } catch (err) {
    console.error("[files] delete failed:", err.message);
  }
};

// Kept for the categories code.
export const deleteImage = (image) => deleteStoredFile(image);

// MIME type from a file name (for files extracted from ZIP uploads).
export const mimeFromName = (name = "") => {
  const ext = name.toLowerCase().split(".").pop();
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      jfif: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      pdf: "application/pdf",
    }[ext] || "application/octet-stream"
  );
};
