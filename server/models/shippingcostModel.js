import mongoose from "mongoose";

const shippingRuleSchema = new mongoose.Schema({
  state: { type: String, required: true },
  cost: { type: Number, required: true },
 
  alwaysCharge: { type: Boolean, default: false },
});

const shippingCostSchema = new mongoose.Schema(
  {
    // Flat shipping by number of pieces (launch, 16 Oct 2026): flatRate per order, free from freeFromPieces pieces.
    // flatRate null = the older per-state costs below.
    flatRate: { type: Number, default: 100 },
    freeFromPieces: { type: Number, default: 3 },
    freeShippingAbove: { type: Number, default: 0 },
    shippingRules: [shippingRuleSchema],
  },
  { timestamps: true },
);

export default mongoose.model("ShippingCost", shippingCostSchema);
