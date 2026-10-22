import mongoose from "mongoose";

// "Notify me" (22 Oct 2026): a visitor leaves an email in the strip at the top of the site while it is under
// development; the team emails everyone once the new designs are here (Admin → Customers → Notify me list).
const waitlistSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // when they were logged in
    notifiedAt: { type: Date, default: null }, // the "it's here" email went out — never sent twice
  },
  { timestamps: true },
);

const Waitlist = mongoose.model("Waitlist", waitlistSchema);
export default Waitlist;
