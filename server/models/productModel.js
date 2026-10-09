import mongoose from "mongoose";

const reviewSchema = mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    // the order this review is tied to. Required going forward; used both
    // to verify purchase and to block duplicate reviews for the same
    // product from the same order.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    name: { type: String, required: true },
    profilePicture: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, minlength: 3 },

    photos: [
      {
        type: String, // Cloudinary / upload path
      },
    ],

    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },

    // "I recommend this product" checkbox
    recommend: { type: Boolean, default: true },

    // true whenever orderId was validated against a DELIVERED order
    isVerifiedPurchase: { type: Boolean, default: false },

    // replaces the old `approved: Boolean` field
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // internal only — never sent on public product-page responses
    rejectionReason: {
      type: String,
      enum: [
        "SPAM",
        "OFFENSIVE_LANGUAGE",
        "FAKE_REVIEW",
        "IRRELEVANT",
        "DUPLICATE",
        "OTHER",
        "",
      ],
      default: "",
    },

    isFeatured: { type: Boolean, default: false },

    adminResponse: {
      text: { type: String, default: "" },
      respondedAt: { type: Date },
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    helpful: { type: Number, default: 0 },
    notHelpful: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// speeds up the "already reviewed this order?" duplicate check
reviewSchema.index({ user: 1, orderId: 1 });

const bannerSchema = mongoose.Schema(
  {
    image: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    gender: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);
const videoBannerSchema = mongoose.Schema(
  {
    videoUrl: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

const sizeStockSchema = mongoose.Schema(
  {
    size: { type: String, required: true },
    stock: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
const productSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User", //relation betwen the product and the user
    },
    brandname: {
      type: String,
      required: true,
    },
    SKU: { type: String, unique: true, required: true },
    hsnCode: {
      type: String,
      default: "6109",
    },
    productGroupId: { type: String, required: true },
    productType: {
      type: String,
      enum: ["single", "combo"],
      default: "single",
    },

    comboName: {
      type: String,
      default: "",
    },

    images: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
      required: true,
    },
    washCare: {
      type: [String],
      default: [],
    },
    productdetails: {
      gender: {
        type: String,
        required: true,
      },
      category: {
        type: String,
        required: true,
      },
      subcategory: {
        type: String,
        required: true,
      },
      type: {
        type: String,
        required: true,
      },
      ageRange: {
        type: String,
        required: true,
      },
      color: {
        type: String,
        required: true,
      },
      garmentStyle: {
        type: String,
        required: true,
      },
      fabric: {
        type: String,
        required: true,
      },
      sizes: { type: [String], required: true },
      stockBySize: { type: [sizeStockSchema], required: true },
    },
    reviews: [reviewSchema],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    oldPrice: {
      type: Number,
      default: 0, // Optional, can be left blank if no discount
    },
    discount: {
      type: Number,
      default: 0, // Percentage discount (e.g., 20 for 20%)
    },
    banners: [bannerSchema],
    VideoBanner: [videoBannerSchema],
    // Optional: only needed for courier rate/label APIs (FedEx code in
    // deliveryController). Customer shipping charges come from Admin →
    // Shipping rates, not from these.
    shippingDetails: {
      weight: { type: Number }, // kg
      dimensions: {
        length: { type: Number }, // cm
        width: { type: Number },
        height: { type: Number },
      },
      originAddress: {
        street1: { type: String },
        city: { type: String },
        state: { type: String },
        zip: { type: Number },
        country: { type: String },
      },
    },
    isFeatured: { type: Boolean, default: false },
    sizeChart: {
      type: String, // This will store the PDF file path/URL
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

const Product = mongoose.model("Product", productSchema);

export default Product;
