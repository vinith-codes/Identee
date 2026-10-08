// Image storage: Cloudinary when CLOUDINARY_* is configured (survives
// redeploys, auto-optimised delivery), otherwise local server/uploads/
// (development fallback only — local files are lost on redeploy).
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/**
 * @param {Buffer} buffer   file contents (from multer memoryStorage)
 * @param {string} mimetype image/jpeg | image/png | image/webp
 * @param {string} folder   e.g. "categories"
 * @returns {Promise<{url: string, publicId: string}>}
 */
export const uploadImage = (buffer, mimetype, folder) => {
  if (usingCloudinary()) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: `identee/${folder}`, resource_type: "image" },
          (err, result) =>
            err
              ? reject(new Error(err.message || "Image upload failed"))
              : resolve({ url: result.secure_url, publicId: result.public_id }),
        )
        .end(buffer);
    });
  }

  const dir = path.join("uploads", folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${EXT[mimetype] || ".jpg"}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return Promise.resolve({ url: `/uploads/${folder}/${file}`, publicId: "" });
};

// Best effort — a failed delete must never break the request.
export const deleteImage = async (image) => {
  try {
    if (image?.publicId && usingCloudinary()) {
      await cloudinary.uploader.destroy(image.publicId);
    } else if (image?.url?.startsWith("/uploads/")) {
      fs.rmSync(path.join(".", image.url), { force: true });
    }
  } catch (err) {
    console.error("[images] delete failed:", err.message);
  }
};
