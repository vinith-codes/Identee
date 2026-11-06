// File storage for everything users/admins upload (images, videos, PDFs).
//
// Two places a file can live:
//   • this server's own uploads/ folder (FILE_STORAGE=local — the plan since 6 Nov 2026: the Cloudinary free plan is
//     over its limit; the panel's weekly backup covers the folder). Served by utils/uploadsServer.js, which also makes
//     the small copies the website asks for (?w=600 → a WebP that wide), the way Cloudinary used to.
//   • Cloudinary (FILE_STORAGE=cloudinary, or unset with the CLOUDINARY_* keys present — how it was before).
// Old Cloudinary links in the database keep working either way: the website shows them straight from Cloudinary,
// and deleteStoredFile knows both kinds.
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT_FOLDER = "identee";
// uploads/ next to server.js, whatever folder the server was started from
export const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");

const cloudinaryKeys = () => {
  const config = {
    cloud_name: process.env.CLOUDINARY_NAME?.trim(),
    api_key: process.env.CLOUDINARY_APIKEY?.trim(),
    api_secret: process.env.CLOUDINARY_SECRETKEY?.trim(),
  };
  const ok = Boolean(config.cloud_name && config.api_key && config.api_secret);
  if (ok) cloudinary.config(config);
  return ok;
};

// Where NEW files go. Read lazily: .env may be loaded after this module is imported.
export const usingCloudinary = () => {
  const mode = process.env.FILE_STORAGE?.trim().toLowerCase();
  if (mode === "local") return false;
  return cloudinaryKeys();
};
export const storageName = () => (usingCloudinary() ? "cloudinary" : "local");

const EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

// Cloudinary keeps PDFs as "raw" files (image-type PDFs are blocked on
// new accounts); videos as "video"; everything else as "image".
const resourceTypeFor = (mimetype = "") =>
  mimetype.startsWith("video/") ? "video" : mimetype === "application/pdf" ? "raw" : "image";

// a folder name from the code ("products", "banners/videos", "print-pictures"): letters, digits, dashes, slashes only
const safeFolder = (folder) => {
  const f = String(folder || "misc").replace(/[^A-Za-z0-9/_-]+/g, "-").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  if (!f || f.includes("..")) throw Object.assign(new Error("Bad upload folder"), { status: 400 });
  return f;
};

/**
 * Stores a file and returns where it lives.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} folder        e.g. "products", "garments", "banners/videos"
 * @param {string} [originalname] used for the extension of raw files / local files
 * @returns {Promise<{url: string, publicId: string}>}   url: a Cloudinary address, or "/uploads/<folder>/<file>"
 */
export const uploadFile = async (buffer, mimetype, folder, originalname = "") => {
  const ext = EXT[mimetype] || path.extname(originalname).toLowerCase() || ".bin";

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

  // this server: uploads/<folder>/<time>-<random><ext>. The name is new every time, so the website may cache a file for
  // as long as it likes (a changed picture is a new name).
  const f = safeFolder(folder);
  const dir = path.join(UPLOADS_DIR, f);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
  await fs.promises.writeFile(path.join(dir, file), buffer);
  return { url: `/uploads/${f}/${file}`, publicId: "" };
};

// Kept for the categories code: same as uploadFile for images.
export const uploadImage = (buffer, mimetype, folder) => uploadFile(buffer, mimetype, folder);

// Works out Cloudinary's id + type from a delivery URL, e.g.
// https://res.cloudinary.com/<cloud>/image/upload/v123/identee/products/abc.webp
//   -> { resourceType: "image", publicId: "identee/products/abc" }
export const parseCloudinaryUrl = (url) => {
  const m = String(url).match(
    /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(identee\/.+)$/,
  );
  if (!m) return null;
  const [, resourceType, rest] = m;
  const publicId = resourceType === "raw" ? rest : rest.replace(/\.[^./]+$/, "");
  return { resourceType, publicId };
};

// "/uploads/products/x.png" (or "uploads/…", or a full address on this server) -> "products/x.png", or null
export const localRelPath = (url) => {
  const s = String(url || "").replace(/^https?:\/\/[^/]+/, "");
  const m = /^\/?uploads\/([^?#]+)/.exec(s);
  if (!m) return null;
  const rel = m[1];
  if (rel.includes("..") || rel.includes("\\") || rel.startsWith("/") || rel.startsWith(".")) return null;
  return rel;
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
      if (parsed && cloudinaryKeys()) {
        await cloudinary.uploader.destroy(parsed.publicId, {
          resource_type: parsed.resourceType,
          invalidate: true,
        });
      }
      return;
    }

    const rel = localRelPath(url);
    if (rel) {
      await fs.promises.rm(path.join(UPLOADS_DIR, rel), { force: true });
      // and its small copies (utils/uploadsServer.js keeps them under uploads/.sizes/)
      await fs.promises.rm(path.join(UPLOADS_DIR, ".sizes", path.dirname(rel)), { recursive: true, force: true }).catch(() => {});
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
      gif: "image/gif",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      pdf: "application/pdf",
    }[ext] || "application/octet-stream"
  );
};
