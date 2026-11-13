// One-off: bring the saved chats on the database in line with models/designChatModel.js (13 Nov 2026).
//
//   node scripts/updateChatExpiry.js            # dry run: report only
//   node scripts/updateChatExpiry.js --apply    # make the changes
//
// What it does:
//   1. Gives every chat saved before the stamps a stamp (`at`) from its last change, so old and new copies compare
//      and sort the same way (utils/chatStamps.js).
//   2. Sets how long a chat nobody changed is kept to CHAT_DAYS (the model). Mongoose never changes the time of an
//      index that is already on the database — it only logs a warning — so after changing CHAT_DAYS this is what
//      makes the live database follow. CHAT_DAYS = 0 removes the expiry (chats kept for good).
// Run it on the live server after a release that changed CHAT_DAYS (it is safe to run more than once).
import dotenv from "dotenv";
import mongoose from "mongoose";
import DesignChat, { CHAT_DAYS } from "../models/designChatModel.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const INDEX = "updatedAt_1";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);
  const chats = DesignChat.collection;

  // 1. Stamps for chats saved before 13 Nov 2026.
  const unstamped = await chats.countDocuments({ at: { $exists: false } });
  console.log(`Chats without a stamp: ${unstamped}`);
  if (apply && unstamped) {
    const r = await chats.updateMany({ at: { $exists: false } }, [{ $set: { at: { $toLong: "$updatedAt" } } }]);
    console.log(`  stamped ${r.modifiedCount}`);
  }

  // 2. The expiry.
  const want = CHAT_DAYS > 0 ? CHAT_DAYS * 24 * 60 * 60 : 0;
  const now = (await chats.indexes()).find((i) => i.name === INDEX);
  const has = now?.expireAfterSeconds;
  console.log(`\nExpiry on the database: ${has == null ? "none" : `${has / 86400} days`} · in the model: ${want ? `${CHAT_DAYS} days` : "none (kept for good)"}`);
  if (want && has === want) console.log("  already right");
  else if (want && now && has != null) {
    console.log(`  will change to ${CHAT_DAYS} days`);
    if (apply) await mongoose.connection.db.command({ collMod: chats.collectionName, index: { keyPattern: { updatedAt: 1 }, expireAfterSeconds: want } });
  } else if (want && !now) {
    console.log(`  will add the ${CHAT_DAYS}-day expiry`);
    if (apply) await chats.createIndex({ updatedAt: 1 }, { expireAfterSeconds: want });
  } else if (!want && now) {
    console.log("  will remove the expiry");
    if (apply) await chats.dropIndex(INDEX);
  } else console.log("  already right");

  if (apply) console.log("\nIndexes now:", (await chats.indexes()).map((i) => `${i.name}${i.expireAfterSeconds != null ? ` (${i.expireAfterSeconds / 86400} days)` : ""}`).join(", "));
  else console.log("\nDry run only. Re-run with --apply to make changes.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
