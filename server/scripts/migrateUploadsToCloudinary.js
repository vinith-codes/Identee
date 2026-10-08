// Moves files referenced by the database from server/uploads/ to Cloudinary
// and rewrites the stored paths to the new Cloudinary URLs.
//
//   node scripts/migrateUploadsToCloudinary.js           # dry run: report only
//   node scripts/migrateUploadsToCloudinary.js --apply   # upload + update DB
//
// It scans EVERY collection and every field for strings like
// "uploads/products/images/x.webp" or "/uploads/garments/y.png".
// Files that don't exist on this machine are listed as MISSING — copy the
// teammate's server/uploads folder here and run again to migrate those.
// Local files are never deleted by this script.
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { uploadFile, usingCloudinary, mimeFromName } from "../utils/imageStorage.js";

dotenv.config();
const apply = process.argv.includes("--apply");

const LOCAL_PATH = /^\/?uploads\/[^\s?#]+\.(jpe?g|jfif|png|webp|avif|gif|mp4|webm|mov|pdf)$/i;

const MIME_BY_EXT = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", gif: "image/gif" };
const mimeOf = (p) => MIME_BY_EXT[p.split(".").pop().toLowerCase()] || mimeFromName(p);

// uploads/products/images/x.jpg -> "products"; uploads/banners/videos/x.mp4 -> "banners/videos"
const folderOf = (p) => {
  const parts = p.replace(/^\/?uploads\//, "").split("/").slice(0, -1);
  if (parts[0] === "products") return "products";
  if (parts[0] === "pdfs") return "size-charts";
  return parts.join("/") || "others";
};

// Collects { pathInDoc, value } for every matching string, e.g. "images.0", "front.imageUrl"
const findLocalPaths = (value, prefix = "", out = []) => {
  if (typeof value === "string") {
    if (LOCAL_PATH.test(value)) out.push({ field: prefix, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findLocalPaths(v, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (value && typeof value === "object" && !(value instanceof Date) && !value._bsontype) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "_id") continue;
      findLocalPaths(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
};

const run = async () => {
  if (apply && !usingCloudinary()) {
    console.error("Cloudinary keys missing in server/.env — aborting.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const uploaded = new Map(); // local path -> cloud url (same file used twice = one upload)
  const missing = new Map(); // local path -> count
  let refs = 0, migrated = 0;

  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith("system.")) continue;
    const col = db.collection(name);
    let colRefs = 0, colMissing = 0;

    for await (const doc of col.find({})) {
      const found = findLocalPaths(doc);
      if (!found.length) continue;
      const $set = {};

      for (const { field, value } of found) {
        refs++; colRefs++;
        const rel = value.replace(/^\/+/, "");
        if (!fs.existsSync(path.join(".", rel))) {
          missing.set(rel, (missing.get(rel) || 0) + 1);
          colMissing++;
          continue;
        }
        if (!apply) continue;
        if (!uploaded.has(rel)) {
          const { url } = await uploadFile(fs.readFileSync(rel), mimeOf(rel), folderOf(rel), rel);
          uploaded.set(rel, url);
        }
        $set[field] = uploaded.get(rel);
        migrated++;
      }

      if (apply && Object.keys($set).length) await col.updateOne({ _id: doc._id }, { $set });
    }
    if (colRefs) {
      console.log(`${name.padEnd(22)} ${String(colRefs).padStart(4)} file reference(s), ${colMissing} missing on this machine`);
    }
  }

  console.log(`\nTotal references: ${refs}`);
  console.log(`Available here:   ${refs - [...missing.values()].reduce((a, b) => a + b, 0)}${apply ? ` (migrated ${migrated}, ${uploaded.size} unique files uploaded)` : ""}`);
  console.log(`Missing here:     ${[...missing.values()].reduce((a, b) => a + b, 0)} (${missing.size} unique files)`);
  if (missing.size) {
    const byFolder = {};
    for (const p of missing.keys()) byFolder[folderOf(p)] = (byFolder[folderOf(p)] || 0) + 1;
    console.log("  missing by folder:", JSON.stringify(byFolder));
    console.log("  -> copy the teammate's server/uploads/ folder here and run again, or re-upload in the admin panel.");
  }
  if (!apply) console.log("\nDry run only. Re-run with --apply to upload and update the database.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
