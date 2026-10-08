// One-off migration for OTP login (email OR phone).
//
//   node scripts/migrateUserAuthIndexes.js               # dry run: report only
//   node scripts/migrateUserAuthIndexes.js --apply       # make the changes
//   node scripts/migrateUserAuthIndexes.js --apply --delete-temp
//
// What it does:
//   1. Lower-cases stored emails (login now matches emails case-insensitively).
//   2. Replaces the old non-sparse unique "email_1" index with the sparse one
//      from the schema and creates the new "phone_1" index — without this,
//      a second phone-only user fails with a duplicate-key error.
//   3. Reports leftover "temp" users created by the old OTP signup flow
//      (they had the known password "temp1234"); --delete-temp removes the
//      ones with no orders.
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import OtpChallenge from "../models/otpChallengeModel.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const deleteTemp = process.argv.includes("--delete-temp");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);
  const users = User.collection;

  // 1. Lower-case emails, refusing if that would create duplicates.
  const mixed = await users
    .find({ email: { $type: "string", $regex: /[A-Z]|^\s|\s$/ } })
    .project({ email: 1 })
    .toArray();
  console.log(`Emails needing lower-case/trim: ${mixed.length}`);
  for (const u of mixed) {
    const normalized = u.email.trim().toLowerCase();
    const clash = await users.findOne({ _id: { $ne: u._id }, email: normalized });
    if (clash) {
      console.log(`  ! ${u.email} clashes with user ${clash._id} — fix manually`);
      continue;
    }
    console.log(`  ${u.email} -> ${normalized}`);
    if (apply) await users.updateOne({ _id: u._id }, { $set: { email: normalized } });
  }

  // 2. Indexes.
  const indexes = await users.indexes();
  const emailIdx = indexes.find((i) => i.name === "email_1");
  if (emailIdx && !emailIdx.sparse) {
    console.log("\nOld non-sparse email_1 index found — will be replaced");
    if (apply) await users.dropIndex("email_1");
  }
  if (apply) {
    await User.syncIndexes();
    await OtpChallenge.syncIndexes();
    console.log("Indexes synced:", (await users.indexes()).map((i) => i.name).join(", "));
  }

  // 3. Legacy temp users.
  const temps = await users.find({ name: "temp" }).project({ email: 1 }).toArray();
  console.log(`\nLegacy "temp" users: ${temps.length}`);
  for (const t of temps) {
    const orders = await Order.countDocuments({ user: t._id });
    console.log(`  ${t._id} ${t.email || ""} orders=${orders}`);
    if (apply && deleteTemp && orders === 0) {
      await users.deleteOne({ _id: t._id });
      console.log("    deleted");
    }
  }

  if (!apply) console.log("\nDry run only. Re-run with --apply to make changes.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
