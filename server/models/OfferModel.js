import mongoose from "mongoose";

const offerModel = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      unique: true, // coupon code must be unique
      trim: true,
    },

    offerPercentage: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },

    startDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    // switched off by the admin: not accepted, not shown on the site, but its history is kept
    isActive: {
      type: Boolean,
      default: true,
    },

    // 🔹 TOTAL usage limit (0 = unlimited)
    maxUsage: {
      type: Number,
      default: 0,
      min: 0,
    },

    // 🔹 How many times coupon is already used
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // 🔹 Track users who used this coupon (prevents reuse)
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // false = a customer may use it on every order (a standing "extra 10% off" code)
    onePerCustomer: { type: Boolean, default: true },
    // shown next to prices on the site ("Extra 10% off with code …") while it is valid
    showOnSite: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const Offer = mongoose.model("Offer", offerModel);

export default Offer;
