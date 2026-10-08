import mongoose from "mongoose";

// Server-side snapshot of what the customer is paying for online.
// Created when the Razorpay order is created; turned into a real Order only
// after the payment is verified (checkout handler or webhook), so the client
// can never change items or prices between paying and ordering.
const pendingCheckoutSchema = mongoose.Schema(
  {
    razorpayOrderId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    source: { type: String, enum: ["cart", "buyNow", "customization"], required: true },
    quote: { type: Object, required: true }, // lines, pricing, coupon, shippingAddress
    amountPaise: { type: Number, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "REFUNDED", "FAILED"],
      default: "PENDING",
    },
    failureReason: { type: String },
  },
  { timestamps: true },
);

// Abandoned checkouts disappear after 7 days.
pendingCheckoutSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

const PendingCheckout = mongoose.model("PendingCheckout", pendingCheckoutSchema);
export default PendingCheckout;
