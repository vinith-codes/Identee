// models/deletedOrderModel.js
//
// A copy of every order deleted from Admin → Orders ("Delete selected", for clearing the test orders made while
// checking the site), saved BEFORE the order is deleted — so a wrong delete can be put back. Not shown anywhere.
import mongoose from "mongoose";

const deletedOrderSchema = new mongoose.Schema(
  {
    order: { type: Object, required: true }, // the whole order as it was (with its invoice, if it had one)
    deletedAt: { type: Date, default: Date.now },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { minimize: false },
);

const DeletedOrder = mongoose.model("DeletedOrder", deletedOrderSchema);
export default DeletedOrder;
