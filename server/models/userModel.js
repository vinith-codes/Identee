import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSubscriptionSchema = mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    title: String,
    description: String,
    offers: [String],
    price: Number,
    discountPercent: Number,
    isActive: Boolean,
    startDate: Date,
    endDate: Date,
  },
  { _id: false },
);

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // A user signs in with a verified email OR phone, so either may be absent.
    // Run scripts/migrateUserAuthIndexes.js once so these sparse indexes replace
    // the old non-sparse email index.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String, // E.164, e.g. +919876543210
      unique: true,
      sparse: true,
    },
    isPhoneVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    isSubscribed: { type: Boolean, default: false },
    subscription: {
      type: userSubscriptionSchema,
      default: undefined,
    },

    otp: { type: String },
    expiresAt: { type: Date },
    isEmailVerified: { type: Boolean, default: false },
    // Legacy: login is OTP-only now; kept so existing hashes aren't lost.
    password: {
      type: String,
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    isDelivery: {
      type: Boolean,
      required: true,
      default: false,
    },
    isSeller: {
      type: Boolean,
      required: true,
      default: false,
    },
    profilePicture: { type: String, default: "" },
    lastName: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: "Male",
    },
    addresses: [
      {
        doorNo: { type: String, default: "" },
        street: { type: String, default: "" },
        nearestLandmark: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        pin: { type: Number, default: null },
        phoneNumber: { type: Number, default: null },
        isDefault: { type: Boolean, default: false },
      },
    ],

    cartItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "Product",
        },
        size: {
          type: String,
          required: true,
        },
        qty: {
          type: Number,
          required: true,
          default: 1,
        },
        price: {
          type: Number,
          required: true,
        },
      },
    ],
    orderHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },

  {
    timestamps: true,
  },
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
const User = mongoose.model("User", userSchema);
export default User;
