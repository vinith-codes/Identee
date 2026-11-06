// Moves the pictures from Cloudinary to this server's uploads/ folder (6 Nov 2026 — the free plan is over its limit).
//
// Three steps, each a separate run from the server/ folder (the panel's terminal), in this order:
//   node scripts/moveCloudinaryToServer.mjs scan            lists every Cloudinary link in the database (nothing changes)
//   node scripts/moveCloudinaryToServer.mjs copy [--limit N] downloads every linked file into uploads/ (nothing in the DB changes;
//                                                           safe to run again: files already here are skipped)
//   node scripts/moveCloudinaryToServer.mjs swap            DRY RUN: says what links would change
//   node scripts/moveCloudinaryToServer.mjs swap --apply    changes the links, after writing an undo file
//   node scripts/moveCloudinaryToServer.mjs undo            puts the old links back from the undo file
//
// The files it writes, in server/move-work/: links.json (scan), map.json (copy: Cloudinary id -> local path, and the
// ones that could not be fetched), undo.json (swap --apply: every changed field with its old value).
// Cloudinary itself is never touched: keep the account for two weeks after the swap, then it can go.
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { UPLOADS_DIR, parseCloudinaryUrl } from "../utils/imageStorage.js";

dotenv.config();
const [, , step, ...flags] = process.argv;
const apply = flags.includes("--apply");
const limitArg = flags.indexOf("--limit");
const limit = limitArg >= 0 ? Number(flags[limitArg + 1]) || 0 : 0;
const WORK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "move-work");
fs.mkdirSync(WORK, { recursive: true });
const linksFile = path.join(WORK, "links.json"), mapFile = path.join(WORK, "map.json"), undoFile = path.join(WORK, "undo.json");

const CLOUD = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>]+/g;

// every Cloudinary link in a document: [{ field: "images.0", url }]
const findLinks = (value, prefix = "", out = []) => {
  if (typeof value === "string") {
    if (value.includes("res.cloudinary.com")) out.push({ field: prefix, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findLinks(v, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (value && typeof value === "object" && !(value instanceof Date) && !value._bsontype) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "_id") continue;
      findLinks(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
};

// the plain file address (transforms such as /f_auto,w_600/ taken out) and a local path for it
// https://res.cloudinary.com/<cloud>/image/upload/v123/identee/art-designs/abc.png -> art-designs/abc.png
const localFor = (url) => {
  const p = parseCloudinaryUrl(url);
  if (!p) return null;
  const idPath = p.publicId.replace(/^identee\//, ""); // art-designs/abc  (raw files keep their extension)
  const ext = p.resourceType === "raw" ? "" : path.extname(url.split("?")[0]) || (p.resourceType === "video" ? ".mp4" : ".png");
  const rel = `${idPath}${ext}`.replace(/[^A-Za-z0-9/_.-]+/g, "-");
  const clean = url.replace(/\/upload\/(?:[^/]+\/)*?(v\d+\/)/, "/upload/$1").split("?")[0];
  return { key: `${p.resourceType}:${p.publicId}`, rel, clean };
};

async function connect() {
  await mongoose.connect(process.env.MONGO_URI);
  return mongoose.connection.db;
}

async function scan() {
  const db = await connect();
  const links = {}; // key -> { clean, rel, uses: n, where: [collection.field] }
  let docs = 0;
  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith("system.")) continue;
    const col = db.collection(name);
    let n = 0;
    for await (const doc of col.find({})) {
      const found = findLinks(doc);
      if (!found.length) continue;
      docs++;
      for (const { field, value } of found) {
        for (const url of value.match(CLOUD) || []) {
          const l = localFor(url);
          if (!l) continue;
          links[l.key] ||= { clean: l.clean, rel: l.rel, uses: 0, where: new Set() };
          links[l.key].uses++;
          links[l.key].where.add(`${name}.${field.replace(/\.\d+/g, ".N")}`);
          n++;
        }
      }
    }
    if (n) console.log(`${name.padEnd(22)} ${String(n).padStart(6)} link(s)`);
  }
  const out = Object.fromEntries(Object.entries(links).map(([k, v]) => [k, { ...v, where: [...v.where] }]));
  fs.writeFileSync(linksFile, JSON.stringify(out, null, 1));
  console.log(`\n${Object.keys(out).length} different files, in ${docs} documents -> ${linksFile}`);
  await mongoose.disconnect();
}

async function copy() {
  if (!fs.existsSync(linksFile)) throw new Error("Run `scan` first.");
  const links = JSON.parse(fs.readFileSync(linksFile, "utf8"));
  const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : { done: {}, failed: {} };
  const keys = Object.keys(links);
  let n = 0, bytes = 0, skipped = 0, failed = 0;
  const started = Date.now();
  for (const key of keys) {
    if (limit && n >= limit) break;
    const { clean, rel } = links[key];
    const dest = path.join(UPLOADS_DIR, rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      map.done[key] = `/uploads/${rel}`;
      skipped++;
      continue;
    }
    try {
      const r = await fetch(clean);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.part`, buf);
      fs.renameSync(`${dest}.part`, dest);
      map.done[key] = `/uploads/${rel}`;
      delete map.failed[key];
      n++;
      bytes += buf.length;
      if (n % 100 === 0) console.log(`  ${n} files, ${(bytes / 1e6).toFixed(0)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    } catch (err) {
      map.failed[key] = { clean, error: err.message };
      failed++;
    }
    if (n % 20 === 0) fs.writeFileSync(mapFile, JSON.stringify(map, null, 1));
  }
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 1));
  console.log(`\ncopied ${n} files (${(bytes / 1e6).toFixed(0)} MB), already here ${skipped}, failed ${failed} -> ${mapFile}`);
  if (failed) console.log("Failed ones are listed under \"failed\" in map.json (a 404 = the file is no longer on Cloudinary: its link will be left alone).");
  if (limit) console.log(`(--limit ${limit}: run again without it for the rest)`);
}

async function swap() {
  if (!fs.existsSync(mapFile)) throw new Error("Run `copy` first.");
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const db = await connect();
  const undo = [];
  let fields = 0, docs = 0, leftAlone = 0;
  const swapIn = (value) => {
    let missing = false;
    const out = value.replace(CLOUD, (url) => {
      const l = localFor(url);
      const local = l && map.done[l.key];
      if (!local) {
        missing = true;
        return url;
      }
      return local;
    });
    return { out, missing };
  };
  for (const { name } of await db.listCollections().toArray()) {
    if (name.startsWith("system.")) continue;
    const col = db.collection(name);
    let colFields = 0;
    for await (const doc of col.find({})) {
      const found = findLinks(doc);
      if (!found.length) continue;
      const $set = {};
      const before = {};
      for (const { field, value } of found) {
        const { out, missing } = swapIn(value);
        if (missing) leftAlone++;
        if (out === value) continue;
        $set[field] = out;
        before[field] = value;
        fields++;
        colFields++;
      }
      if (!Object.keys($set).length) continue;
      docs++;
      if (apply) {
        undo.push({ collection: name, _id: doc._id, fields: before });
        await col.updateOne({ _id: doc._id }, { $set });
      }
    }
    if (colFields) console.log(`${name.padEnd(22)} ${String(colFields).padStart(6)} field(s)${apply ? " changed" : " would change"}`);
  }
  if (apply) fs.writeFileSync(undoFile, JSON.stringify(undo, (k, v) => (v && v._bsontype === "ObjectId" ? { $oid: String(v) } : v), 1));
  console.log(`\n${apply ? "CHANGED" : "DRY RUN:"} ${fields} field(s) in ${docs} document(s); ${leftAlone} link(s) left alone (file not copied).${apply ? ` Undo file: ${undoFile}` : "\nRe-run with --apply to change them (an undo file is written first)."}`);
  await mongoose.disconnect();
}

async function undoSwap() {
  if (!fs.existsSync(undoFile)) throw new Error("No undo file.");
  const entries = JSON.parse(fs.readFileSync(undoFile, "utf8"));
  const db = await connect();
  let n = 0;
  for (const e of entries) {
    const id = e._id?.$oid ? new mongoose.Types.ObjectId(e._id.$oid) : e._id;
    await db.collection(e.collection).updateOne({ _id: id }, { $set: e.fields });
    n++;
  }
  console.log(`put the old links back in ${n} document(s)`);
  await mongoose.disconnect();
}

const steps = { scan, copy, swap, undo: undoSwap };
if (!steps[step]) {
  console.log("Usage: node scripts/moveCloudinaryToServer.mjs scan | copy [--limit N] | swap [--apply] | undo");
  process.exit(1);
}
steps[step]().catch((err) => {
  console.error(err);
  process.exit(1);
});
