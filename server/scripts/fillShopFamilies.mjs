// scripts/fillShopFamilies.mjs — gives every shop tee made before 25 Nov 2026 its family (ReadyDesign.family)
//
// A design made in several styles (Ayyappa · Darshanam as Oversized, Round Neck Men's and Round Neck Women's) was
// joined only by its name. This gives the tees of one name one family id, so the shop and "+ Add to a style" find
// each other by the id from now on. Tees that already have a family keep it (and their name-mates join it).
//
//   node scripts/fillShopFamilies.mjs                    look only: prints every family it would make, writes nothing
//   node scripts/fillShopFamilies.mjs --write undo.json  writes them, and keeps the list of changed tees in undo.json
//   node scripts/fillShopFamilies.mjs --undo undo.json   puts those tees back as they were (no family)
//
// It reads MONGO_URI from the environment (server/.env). It never prints the address.
import "dotenv/config";
import fs from "fs/promises";
import { MongoClient, ObjectId } from "mongodb";
import { familyId } from "../utils/shopFamily.js";

const args = process.argv.slice(2);
const mode = args[0] === "--write" ? "write" : args[0] === "--undo" ? "undo" : "look";
const file = args[1];
if (mode !== "look" && !file) {
  console.error("Give the undo file: --write undo.json  or  --undo undo.json");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set.");
  process.exit(1);
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const designs = client.db().collection("readydesigns");
try {
  if (mode === "undo") {
    const ids = JSON.parse(await fs.readFile(file, "utf8")).changed || [];
    const r = await designs.updateMany({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { $set: { family: "" } });
    console.log(`Put back ${r.modifiedCount} of ${ids.length} tees (no family).`);
  } else {
    const all = await designs.find({ source: "studio", status: { $ne: "removed" } }).project({ name: 1, garmentType: 1, status: 1, family: 1 }).toArray();
    const groups = new Map(); // name → tees
    for (const d of all) {
      const k = norm(d.name);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    const plan = [];
    for (const tees of groups.values()) {
      const missing = tees.filter((t) => !t.family);
      if (!missing.length) continue;
      const family = tees.find((t) => t.family)?.family || familyId(tees[0].name);
      plan.push({ family, name: tees[0].name, tees: missing.map((t) => ({ id: String(t._id), garment: t.garmentType, status: t.status })), already: tees.length - missing.length });
    }
    plan.sort((a, b) => a.name.localeCompare(b.name));
    const many = plan.filter((p) => p.tees.length + p.already > 1);
    console.log(`${all.length} shop tees · ${plan.reduce((n, p) => n + p.tees.length, 0)} without a family · ${plan.length} families (${many.length} with more than one style)`);
    for (const p of plan) console.log(`  ${p.name}  →  ${p.family}  :  ${p.tees.map((t) => `${t.garment}${t.status === "published" ? "" : ` (${t.status})`}`).join(", ")}${p.already ? `  (+${p.already} already in it)` : ""}`);
    if (mode === "write") {
      const changed = [];
      for (const p of plan) {
        await designs.updateMany({ _id: { $in: p.tees.map((t) => new ObjectId(t.id)) }, family: { $in: ["", null] } }, { $set: { family: p.family } });
        changed.push(...p.tees.map((t) => t.id));
      }
      await fs.writeFile(file, JSON.stringify({ at: new Date().toISOString(), changed, plan }, null, 2));
      console.log(`Written: ${changed.length} tees got a family. Undo list: ${file}`);
    } else {
      console.log("Nothing was written (look only). Run with --write undo.json to write.");
    }
  }
} finally {
  await client.close();
}
