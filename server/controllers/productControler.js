import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { uploadFile, mimeFromName } from "../utils/imageStorage.js";
import multer from "multer";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import path from "path";
import Product, { LIVE } from "../models/productModel.js";
import { assertCanManage, assertCanManageGroup } from "../utils/productAccess.js";
import ProductGroup from "../models/productgroupModel.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import reviewnotificatioEmail from "../utils/reviewnotificationEmail.js";
import fs from "fs";
import { applySubscriptionPrice } from "../utils/applySubscriptionPrice.js";
import GarmentColorImage from "../models/garmentColorImageModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import {
  garmentStyleToKey,
  colorNameToSlug,
} from "../utils/customizerMapping.js";

// ── helper: recompute rating/numReviews from APPROVED reviews only ──
const recalculateProductRating = (product) => {
  const approved = product.reviews.filter((r) => r.status === "APPROVED");
  product.numReviews = approved.length;
  product.rating =
    approved.length > 0
      ? approved.reduce((acc, r) => acc + r.rating, 0) / approved.length
      : 0;
};

// ── helper: does this product's garmentStyle+color have customizer
// photos set up yet? Computed server-side so the frontend doesn't
// need to fetch the entire garmentTypes + garmentImages collections
// just to answer one yes/no question per product page load.
const computeCustomizerAvailability = async (product) => {
  const garmentKey = garmentStyleToKey(product.productdetails?.garmentStyle);
  if (!garmentKey) {
    return {
      customizerAvailable: false,
      customizerGarmentKey: null,
      customizerColorSlug: null,
    };
  }

  const colorSlug = colorNameToSlug(product.productdetails?.color);

  const hasPhotos = await GarmentColorImage.exists({
    garmentType: garmentKey,
    colorSlug,
  });

  return {
    customizerAvailable: !!hasPhotos,
    customizerGarmentKey: garmentKey,
    customizerColorSlug: colorSlug,
  };
};

// identically for reviews. ──
const buildPublicReviewData = (product) => {
  const approvedReviews = (product.reviews || []).filter(
    (r) => r.status === "APPROVED",
  );

  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  approvedReviews.forEach((r) => {
    if (ratingBreakdown[r.rating] !== undefined) ratingBreakdown[r.rating]++;
  });

  // Never leak rejectionReason / internal fields on public responses
  const publicReviews = approvedReviews.map((r) => ({
    _id: r._id,
    user: r.user,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    photos: r.photos,
    recommend: r.recommend,
    isVerifiedPurchase: r.isVerifiedPurchase,
    isFeatured: r.isFeatured,
    adminResponse: r.adminResponse?.text ? r.adminResponse : null,
    helpful: r.helpful,
    notHelpful: r.notHelpful,
    createdAt: r.createdAt,
  }));

  return {
    publicReviews,
    ratingBreakdown,
    numReviews: approvedReviews.length,
  };
};

// @desc Fetch all products
// @route GET /api/products
// @access Public
const getProducts = asyncHandler(async (req, res) => {
  const {
    brandname,
    gender,
    offerfilter,
    category,
    subcategory,
    garmentStyle,
    type,
    color,
    fabric,
    sizes,
    from,
    to,
    discount,
    rating,
    sortBy,
    keyword,
  } = req.query;
  const keywordFilter = keyword
    ? {
        $or: [
          { brandname: { $regex: keyword, $options: "i" } }, // Search in brandname
          { "productdetails.category": { $regex: keyword, $options: "i" } }, // Search in category
          { "productdetails.subcategory": { $regex: keyword, $options: "i" } }, // Search in subcategory
          { "productdetails.color": { $regex: keyword, $options: "i" } }, // Search in color
          { "productdetails.fabric": { $regex: keyword, $options: "i" } }, // Search in fabric
          { "productdetails.type": { $regex: keyword, $options: "i" } }, // Search in type
        ],
      }
    : {};
  let filterCriteria = {
    ...keywordFilter,
    ...LIVE,
  };
  if (brandname) filterCriteria.brandname = brandname;
  if (gender) filterCriteria["productdetails.gender"] = gender;
  if (category) filterCriteria["productdetails.category"] = category;
  if (subcategory) filterCriteria["productdetails.subcategory"] = subcategory;
  if (garmentStyle)
    filterCriteria["productdetails.garmentStyle"] = garmentStyle;
  if (type) filterCriteria["productdetails.type"] = type;
  if (color) filterCriteria["productdetails.color"] = color;
  if (fabric) filterCriteria["productdetails.fabric"] = fabric;
  if (sizes) {
    filterCriteria["productdetails.stockBySize"] = {
      $elemMatch: { size: sizes, stock: { $gt: 0 } },
    };
  }

  if (offerfilter) {
    switch (offerfilter) {
      case "under499":
        filterCriteria.price = { $lte: 499 };
        break;
      case "under1499":
        filterCriteria.price = { $lte: 1499 };
        break;
      case "upto50":
        filterCriteria.discount = { $gte: 50 };
        break;
      case "upto70":
        filterCriteria.discount = { $gte: 70 };
        break;
      default:
        console.log("Invalid Offer Filter");
    }
  }
  console.log("Final Filter Criteria:", filterCriteria);
  // Price Range Filter
  if (from && to) {
    filterCriteria.price = { $gte: from, $lte: to };
  } else if (from) {
    filterCriteria.price = { $gte: from };
  } else if (to) {
    filterCriteria.price = { $lte: to };
  }
  // Discount Filter
  if (discount) {
    filterCriteria.discount = { $gte: discount }; // Get products with at least this discount
  }

  // Rating Filter
  if (rating) {
    filterCriteria.rating = { $gte: rating }; // Get products with at least this rating
  }

  // Sorting Logic
  let sortOptions = {};
  switch (sortBy) {
    case "Rating":
      sortOptions.rating = -1;
      break;
    case "date":
      sortOptions.createdAt = -1;
      break;
    case "highprice":
      sortOptions.price = -1;
      break;
    case "lowprice":
      sortOptions.price = 1;
      break;
    default:
      sortOptions.createdAt = -1; // Default: Newest first
  }

  // Fetch Products
  const products = await Product.find(filterCriteria).sort(sortOptions).lean();

  const finalProducts = products.map((product) =>
    applySubscriptionPrice(product, req.user),
  );

  res.json(finalProducts);
});

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
// Only shows APPROVED reviews publicly, adds a rating breakdown.
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate({ path: "reviews.user", select: "name profilePicture" })
    .lean();

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const { publicReviews, ratingBreakdown, numReviews } =
    buildPublicReviewData(product);
  const customizerInfo = await computeCustomizerAvailability(product);

  const pricedProduct = applySubscriptionPrice(product, req.user);
  pricedProduct.reviews = publicReviews;
  pricedProduct.ratingBreakdown = ratingBreakdown;
  pricedProduct.numReviews = numReviews;
  Object.assign(pricedProduct, customizerInfo);

  res.json(pricedProduct);
});

// @desc Create new Review
// @route POST /api/products/:id/reviews
// @access Private
// Requires orderId, verifies purchase + DELIVERED status, blocks duplicate
// review per order/product, always starts as PENDING.
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment, orderId, recommend } = req.body;

  if (!orderId) {
    res.status(400);
    throw new Error("orderId is required to submit a review");
  }

  const numRating = Number(rating);
  if (!numRating || numRating < 1 || numRating > 5) {
    res.status(400);
    throw new Error("Rating must be between 1 and 5");
  }
  if (!comment || !comment.trim() || comment.trim().length < 3) {
    res.status(400);
    throw new Error("Review text is required");
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("This order does not belong to you");
  }
  if (order.orderStatus !== "DELIVERED") {
    res.status(400);
    throw new Error("You can only review products from delivered orders");
  }

  const purchasedItem = order.orderItems.find(
    (item) => item.product.toString() === product._id.toString(),
  );
  if (!purchasedItem) {
    res.status(403);
    throw new Error("You can only review products you have purchased");
  }

  const alreadyReviewed = product.reviews.find(
    (r) =>
      r.user.toString() === req.user._id.toString() &&
      r.orderId &&
      r.orderId.toString() === orderId,
  );
  if (alreadyReviewed) {
    res.status(400);
    throw new Error("You have already reviewed this product for this order");
  }

  let photos = [];
  if (req.files && req.files.length > 0) {
    photos = req.files.map((file) => file.path);
  }

  const review = {
    name: req.user.name,
    profilePicture: req.user.profilePicture || "",
    rating: numRating,
    comment: comment.trim(),
    photos,
    user: req.user._id,
    orderId,
    recommend:
      recommend === undefined
        ? true
        : recommend === "true" || recommend === true,
    isVerifiedPurchase: true,
    status: "PENDING",
  };

  product.reviews.push(review);
  // Deliberately NOT calling recalculateProductRating here — pending
  // reviews must not move the public average until an admin approves them.
  await product.save();

  res
    .status(201)
    .json({ message: "Review submitted and awaiting admin approval" });
});

// Alternative: If you want a separate endpoint for variants
const getProductVariants = async (req, res) => {
  try {
    const { sku } = req.params;

    // Extract prefix from the given SKU
    const skuPrefix = sku.split("-")[0];

    // Find all products with this prefix
    const variants = await Product.find({
      SKU: { $regex: `^${skuPrefix}-` },
    }).select("SKU productdetails.color images brandname price");

    res.json(variants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const getProductBySku = asyncHandler(async (req, res) => {
  const { sku } = req.params;

  // 1️⃣ Find current product
  const product = await Product.findOne({ SKU: sku });

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  // 2️⃣ Extract unified/base SKU (before first "-")
  const baseSKU = sku.split("-")[0];

  // 3️⃣ Find all color variants
  const variants = await Product.find({
    SKU: { $regex: `^${baseSKU}-` },
    ...LIVE,
  }).select("SKU productdetails.color images price productdetails.stockBySize");

  // 4️⃣ Response
  res.json({
    product: applySubscriptionPrice(product.toObject(), req.user),
    variants: variants.map((v) =>
      applySubscriptionPrice(v.toObject(), req.user),
    ),
  });
});

// @desc Add product to cart
// @route POST /api/products/:id/addtocart
// @access Private
const addToCart = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const { qty = 1, size, action = "add", cartItemId } = req.body;

    console.log("📦 addToCart called:", {
      userId,
      qty,
      size,
      action,
      cartItemId,
    });

    if (!size) return res.status(400).json({ message: "Size is required" });
    if (qty < 0) return res.status(400).json({ message: "Invalid quantity" });

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.isHidden) return res.status(400).json({ message: "This product is no longer available" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("👤 User found, cartItems count:", user.cartItems?.length);
    console.log("📦 Product stockBySize:", product.productdetails?.stockBySize);

    user.cartItems = user.cartItems || [];

    const sizeStock = product.productdetails?.stockBySize?.find(
      (s) => s.size === size,
    );

    console.log("📏 sizeStock found:", sizeStock);

    if (!sizeStock)
      return res.status(400).json({ message: "Size not available" });

    let existingCartItem = null;

    if (cartItemId) {
      existingCartItem = user.cartItems.id(cartItemId);
      if (!existingCartItem)
        return res.status(404).json({ message: "Cart item not found" });
    }

    if (!existingCartItem) {
      existingCartItem = user.cartItems.find(
        (item) =>
          item.product?.toString() === product._id.toString() &&
          item.size === size,
      );
    }

    console.log("🛒 existingCartItem:", existingCartItem);

    if (existingCartItem && qty === 0) {
      user.cartItems = user.cartItems.filter(
        (item) => item._id.toString() !== existingCartItem._id.toString(),
      );
    } else if (existingCartItem) {
      const pricedProduct = applySubscriptionPrice(product.toObject(), user);
      console.log(
        "💰 pricedProduct.subscriptionPrice:",
        pricedProduct.subscriptionPrice,
      );

      existingCartItem.size = size;
      existingCartItem.qty = action === "set" ? qty : existingCartItem.qty + 1;

      if (existingCartItem.qty > sizeStock.stock) {
        return res.status(400).json({ message: "Not enough stock available" });
      }

      existingCartItem.price =
        existingCartItem.qty * pricedProduct.subscriptionPrice;
    } else {
      if (Number(qty) > sizeStock.stock) {
        return res.status(400).json({ message: "Not enough stock available" });
      }
      const pricedProduct = applySubscriptionPrice(product.toObject(), user);

      user.cartItems.push({
        product: product._id,
        qty,
        size,
        price: qty * pricedProduct.subscriptionPrice,
      });
    }

    console.log("💾 Saving user...");
    await user.save();
    console.log("✅ User saved");

    const updatedUser = await User.findById(userId).populate({
      path: "cartItems.product",
      select:
        "name brandname images oldPrice isSubscriptionApplied subscriptionDiscountPercent productdetails",
    });

    res.status(200).json({ cartItems: updatedUser.cartItems });
  } catch (err) {
    // ✅ This will show the REAL error in your terminal
    console.error("💥 addToCart CRASH:", err.message);
    console.error(err.stack);
    res.status(500).json({ message: err.message });
  }
});

// @desc get cart product
// @route get /api/products/getcart
// @access Private
const getCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "cartItems.product",
    select:
      "name images brandname description price oldPrice discount productdetails",
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const cartItems = user.cartItems.map((item) => {
    const pricedProduct = applySubscriptionPrice(item.product.toObject(), user);

    return {
      ...item.toObject(),
      product: pricedProduct,
    };
  });

  res.status(200).json({ cartItems });
});

// @desc Delete cart product
// @route DELETE /api/products/deletecart/:cartItemId
// @access Private
const deleteCartItem = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { cartItemId } = req.params;

  const user = await User.findById(userId).populate("cartItems.product");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // 🔍 FIND THE CART ITEM (IMPORTANT)
  const cartItem = user.cartItems.find(
    (item) => item._id.toString() === cartItemId,
  );

  if (!cartItem) {
    return res.status(404).json({ message: "Cart item not found" });
  }

  // No stock to restore: stock is only taken when an order is placed.

  // 🗑 REMOVE ITEM
  user.cartItems = user.cartItems.filter(
    (item) => item._id.toString() !== cartItemId,
  );

  await user.save();

  const updatedUser = await User.findById(userId)
    .populate("cartItems.product")
    .populate("cartItems.customization", "name garmentType color size mockups orderedAt");

  res.status(200).json({
    cartItems: updatedUser.cartItems,
  });
});

// @desc Delete a product
// @route GET /api/products/:id
// @access Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) {
    assertCanManage(req.user, product);
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product Removed" });
  } else {
    // status it's 500 by default cuz of errHandler
    res.status(404);
    throw new Error("Product not found");
  }
});

// @desc Create a product
// @route Post /api/products
// @access Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  console.log("BODY:", req.body);
  console.log("FILES:", req.files);
  console.log("📦 washCare received:", req.body.washCare);

  try {
    const {
      brandname,
      description,
      SKU,
      shippingDetails,
      isFeatured,
      products,
      productType = "single",
      comboName = "",
      hsnCode,
    } = req.body;

    // ✅ IMPROVED VALIDATION - Check if products exists AND is not empty
    if (!products || products === "" || products === "[]") {
      console.error("❌ No products data received");
      return res.status(400).json({ message: "No product variants provided" });
    }

    // ✅ Parse products safely
    let parsedProducts;
    try {
      parsedProducts =
        typeof products === "string" ? JSON.parse(products) : products;
    } catch (parseError) {
      console.error("❌ Error parsing products:", parseError);
      return res.status(400).json({ message: "Invalid product data format" });
    }

    // ✅ Check if parsed products is actually an array with items
    if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
      console.error("❌ Parsed products is empty or not an array");
      return res.status(400).json({ message: "No product variants provided" });
    }

    const washCare =
      typeof req.body.washCare === "string"
        ? JSON.parse(req.body.washCare)
        : req.body.washCare || [];
    const parsedShippingDetails =
      typeof shippingDetails === "string"
        ? JSON.parse(shippingDetails)
        : shippingDetails;

    if (parsedShippingDetails?.originAddress?.street2 !== undefined) {
      delete parsedShippingDetails.originAddress.street2;
    }

    // 🔥 GROUP ID
    const productGroupId = new mongoose.Types.ObjectId().toString();

    const sizeChart = req.files?.sizeChart?.[0]?.path || "";
    console.log("🚀 [createProduct] Size Chart received:", sizeChart);
    const allImages = req.files?.images || [];

    let imageIndex = 0;
    const createdProducts = [];

    // ✅ SINGLE LOOP (FIXED)
    for (let i = 0; i < parsedProducts.length; i++) {
      const variant = parsedProducts[i];

      const imageCount = Number(variant.imagesCount || 3);

      if (imageCount < 3 || imageCount > 5) {
        return res.status(400).json({
          message: `Variant ${variant.productdetails.color} must have 3–5 images`,
        });
      }

      const images = allImages
        .slice(imageIndex, imageIndex + imageCount)
        .map((file) => file.path);

      imageIndex += imageCount;

      if (productType === "combo") {
        variant.productdetails.subcategory = "Combo";
      }

      const product = new Product({
        user: req.user._id,
        brandname,
        description,
        productType,
        comboName: productType === "combo" ? comboName : "",
        hsnCode: hsnCode || "6109",
        price: Number(variant.price),
        oldPrice: Number(variant.oldPrice),
        discount: Number(variant.discount),
        washCare,
        images,
        sizeChart,
        productGroupId,
        SKU: `${SKU}-${variant.productdetails.color.toUpperCase()}-${Date.now()}`,
        productdetails: variant.productdetails,
        shippingDetails: parsedShippingDetails,
        isFeatured: isFeatured === "true",
        rating: 0,
        numReviews: 0,
      });

      createdProducts.push(await product.save());
    }

    // ✅ SUCCESS RESPONSE
    res.status(201).json({
      message: "Product variants created successfully",
      productGroupId,
      products: createdProducts,
    });
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

// @desc Update a product
// @route PUT /api/products/:id
// @access Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  assertCanManage(req.user, product);

  // Basic fields
  product.brandname = req.body.brandname || product.brandname;
  product.description = req.body.description || product.description;
  product.oldPrice = req.body.oldPrice || product.oldPrice;
  product.discount = req.body.discount || product.discount;
  product.price = req.body.price || product.price;
  product.SKU = req.body.SKU || product.SKU;
  product.isFeatured = req.body.isFeatured ?? product.isFeatured;
  product.hsnCode = req.body.hsnCode || product.hsnCode;

  // JSON fields
  if (req.body.productdetails) {
    product.productdetails = JSON.parse(req.body.productdetails);
  }

  if (req.body.shippingDetails) {
    const shipping = JSON.parse(req.body.shippingDetails);

    if (shipping?.originAddress?.street2 !== undefined) {
      delete shipping.originAddress.street2;
    }

    product.shippingDetails = shipping;
  }

  // Images (optional replace)
  if (req.files?.images?.length > 0) {
    product.images = req.files.images.map((file) => file.path);
  }

  // Size chart (optional)
  if (req.files?.sizeChart?.length > 0) {
    product.sizeChart = req.files.sizeChart[0].path;
    console.log("🚀 [updateProduct] Size Chart received:", product.sizeChart);
  }
  if (req.body.washCare !== undefined) {
    product.washCare =
      typeof req.body.washCare === "string"
        ? JSON.parse(req.body.washCare)
        : req.body.washCare;
  }
  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// @desc Mark review as Helpful / Not Helpful
// @route PUT /api/products/:productId/review/:reviewId/helpful
// @access Private
export const markReviewHelpful = async (req, res) => {
  const { productId, reviewId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const review = product.reviews.id(reviewId);
  if (!review) {
    return res.status(404).json({ message: "Review not found" });
  }

  review.helpful = (review.helpful || 0) + 1;

  await product.save();
  res.json({ message: "Marked as helpful" });
};
export const markReviewNotHelpful = async (req, res) => {
  const { productId, reviewId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const review = product.reviews.id(reviewId);
  if (!review) {
    return res.status(404).json({ message: "Review not found" });
  }

  review.notHelpful = (review.notHelpful || 0) + 1;

  await product.save();
  res.json({ message: "Marked as not helpful" });
};

// @desc Bulk upload products via ZIP (Excel + images)
// @route POST /api/products/upload
// @access Private/Admin
const uploadProducts = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("ZIP file required");
  }

  // ✅ server/controlers/productControler.js → one level up = server/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const PROJECT_ROOT = path.resolve(__dirname, "../"); // server/controlers → server/

  const safeNum = (val, fallback = 0) => {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  };

  const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };

  // ✅ Extract ZIP from memory buffer
  const zip = new AdmZip(req.file.buffer);
  const zipEntries = zip.getEntries();

  // ✅ Find Excel file inside ZIP
  const excelEntry = zipEntries.find(
    (e) =>
      !e.isDirectory &&
      (e.entryName.endsWith(".xlsx") || e.entryName.endsWith(".xls")) &&
      !e.entryName.includes("__MACOSX"),
  );

  if (!excelEntry) {
    res.status(400);
    throw new Error("No Excel file (.xlsx / .xls) found inside the ZIP");
  }

  // ✅ Build flat filename → ZipEntry map
  const allowedImageExts = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".jfif"];
  const allowedPdfExts = [".pdf"];
  const imageEntryMap = {};

  zipEntries.forEach((entry) => {
    if (entry.isDirectory || entry.entryName.includes("__MACOSX")) return;
    const ext = path.extname(entry.entryName).toLowerCase();
    const basename = path.basename(entry.entryName);
    if (allowedImageExts.includes(ext) || allowedPdfExts.includes(ext)) {
      imageEntryMap[basename] = entry;
    }
  });

  // ✅ Parse Excel
  const excelBuffer = excelEntry.getData();
  const workbook = XLSX.read(excelBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // ✅ Write ZIP entry to disk → return RELATIVE path for DB
  // Stores a ZIP entry via utils/imageStorage (Cloudinary) and returns its URL.
  const saveEntry = async (entry, folder) => {
    const { url } = await uploadFile(entry.getData(), mimeFromName(entry.entryName), folder, entry.entryName);
    return url;
  };

  // ✅ Resolve pipe-separated filenames from Excel cell
  const resolveFiles = async (cellValue, folder) => {
    if (!cellValue) return [];
    const urls = [];
    for (const p of String(cellValue).split("|").map((x) => x.trim()).filter(Boolean)) {
      const basename = path.basename(p); // handles "img.jpg" or "D:/path/img.jpg"
      const entry = imageEntryMap[basename];
      if (entry) urls.push(await saveEntry(entry, folder));
      else console.warn(`Not found in ZIP: ${basename}`);
    }
    return urls;
  };

  const groupMap = {};
  let created = 0;
  const skipped = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.SKU || !row.productGroupId) {
      throw new Error(`Row ${i + 2}: SKU & productGroupId required`);
    }

    if (!groupMap[row.productGroupId]) {
      groupMap[row.productGroupId] = new mongoose.Types.ObjectId().toString();
    }

    // ✅ Skip duplicate SKUs
    const exists = await Product.findOne({ SKU: row.SKU });
    if (exists) {
      console.warn(`Row ${i + 2}: SKU "${row.SKU}" already exists — skipped`);
      skipped.push(row.SKU);
      continue;
    }

    // 🔹 Images & sizeChart from ZIP
    const images = await resolveFiles(row.images, "products");
    const pdfPaths = await resolveFiles(row.sizeChart, "size-charts");
    const sizeChart = pdfPaths[0] || "";
    const washCare = row.washCare
      ? row.washCare
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    // 🔹 Sizes & stock
    const sizes = row.sizes
      ? row.sizes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const stockBySize = row.stockBySize
      ? row.stockBySize.split(",").map((s) => {
          const [size, stock] = s.split(":");
          return { size: (size || "").trim(), stock: safeNum(stock, 0) };
        })
      : [];

    // 🔹 Prices
    const oldPrice = safeNum(row.oldPrice, 0);
    const discount = safeNum(row.discount, 0);
    const price = Math.round(oldPrice - (oldPrice * discount) / 100);

    // 🔹 Shipping
    const weight = safeNum(row.weight, 0.5);
    const length = safeNum(row.length, 10);
    const width = safeNum(row.width, 10);
    const height = safeNum(row.height, 2);
    const zip = safeNum(row.zip, 0);

    await Product.create({
      user: req.user._id,
      SKU: `${row.SKU}-${(row.color || "DEFAULT").toUpperCase()}-${Date.now()}`,
      hsnCode: row.hsnCode || "6109",
      productGroupId: groupMap[row.productGroupId],
      brandname: row.brandname || "Default Brand",
      description: row.description || "",
      images,
      sizeChart,
      price,
      oldPrice,
      discount,
      washCare,
      productdetails: {
        gender: row.gender || "Unisex",
        category: row.category || "General",
        subcategory: row.subcategory || "General",
        type: row.type || "Casual",
        ageRange: row.ageRange || "Adult",
        fabric: row.fabric || "Cotton",
        color: row.color || "",
        garmentStyle: row.garmentStyle || "Round Neck",
        sizes,
        stockBySize,
      },
      shippingDetails: {
        weight,
        dimensions: { length, width, height },
        originAddress: {
          street1: row.street1 || "Warehouse",
          city: row.city || "Chennai",
          state: row.state || "Tamil Nadu",
          zip,
          country: row.country || "India",
        },
      },
    });

    created++;
  }

  res.status(201).json({
    message: "Bulk upload successful",
    productsCreated: created,
    ...(skipped.length > 0 && {
      skipped: skipped.length,
      skippedSKUs: skipped,
      warning: `${skipped.length} SKU(s) already existed and were skipped`,
    }),
  });
});

// @desc Approve Review
// @route PUT /api/products/:id/reviews/:reviewId/approve
// @access Private/Admin
const approveReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) assertCanManage(req.user, product);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const review = product.reviews.id(req.params.reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.status = "APPROVED";
  review.rejectionReason = "";
  recalculateProductRating(product);

  await product.save();
  res.json({ message: "Review approved", review });
});

// @desc Reject Review
// @route PUT /api/products/:id/reviews/:reviewId/reject
// @access Private/Admin
const rejectReview = asyncHandler(async (req, res) => {
  const { reason } = req.body; // one of the rejectionReason enum values, optional
  const product = await Product.findById(req.params.id);
  if (product) assertCanManage(req.user, product);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const review = product.reviews.id(req.params.reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.status = "REJECTED";
  review.rejectionReason = reason || "OTHER";
  review.isFeatured = false;
  recalculateProductRating(product);

  await product.save();
  res.json({ message: "Review rejected", review });
});

// @desc Revert an APPROVED review back to PENDING
// @route PUT /api/products/:id/reviews/:reviewId/unapprove
// @access Private/Admin
const unapproveReview = asyncHandler(async (req, res) => {
  const { id: productId, reviewId } = req.params;

  const product = await Product.findById(productId);

  if (product) assertCanManage(req.user, product);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const review = product.reviews.id(reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.status = "PENDING";
  review.isFeatured = false;
  recalculateProductRating(product);

  await product.save();
  res.json({ message: "Review moved back to pending", review });
});

// @desc Toggle a review's "featured" flag (only APPROVED reviews)
// @route PUT /api/products/:id/reviews/:reviewId/feature
// @access Private/Admin
const toggleFeaturedReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) assertCanManage(req.user, product);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const review = product.reviews.id(req.params.reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  if (review.status !== "APPROVED") {
    res.status(400);
    throw new Error("Only approved reviews can be featured");
  }

  review.isFeatured = !review.isFeatured;
  await product.save();
  res.json({
    message: review.isFeatured ? "Marked as featured" : "Removed from featured",
    review,
  });
});

// @desc Admin reply to a review
// @route PUT /api/products/:id/reviews/:reviewId/respond
// @access Private/Admin
const respondToReview = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    res.status(400);
    throw new Error("Response text is required");
  }

  const product = await Product.findById(req.params.id);

  if (product) assertCanManage(req.user, product);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const review = product.reviews.id(req.params.reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.adminResponse = {
    text: text.trim(),
    respondedAt: new Date(),
    respondedBy: req.user._id,
  };

  await product.save();
  res.json({ message: "Response added", review });
});

// @desc Pending Reviews (admin queue)
// @route GET /api/products/reviews/pending
// @access Private/Admin
const getPendingReviews = asyncHandler(async (req, res) => {
  const products = await Product.find({ "reviews.status": "PENDING" })
    .populate({ path: "reviews.user", select: "name profilePicture" })
    .select("reviews brandname images");

  const pendingReviews = [];
  products.forEach((product) => {
    product.reviews.forEach((review) => {
      if (review.status === "PENDING") {
        pendingReviews.push({
          _id: review._id,
          productId: product._id,
          product: {
            name: product.brandname,
            image: product.images?.[0] || null,
          },
          user: {
            name: review.user?.name || review.name,
            avatar: review.user?.profilePicture || null,
          },
          rating: review.rating,
          comment: review.comment,
          photos: review.photos || [],
          isVerifiedPurchase: review.isVerifiedPurchase,
          orderId: review.orderId,
          createdAt: review.createdAt,
        });
      }
    });
  });

  res.json(pendingReviews);
});

// @desc Count of pending reviews (for the admin sidebar badge)
// @route GET /api/products/reviews/pending/count
// @access Private/Admin
const getPendingReviewsCount = asyncHandler(async (req, res) => {
  const products = await Product.find({ "reviews.status": "PENDING" }).select(
    "reviews",
  );
  let count = 0;
  products.forEach((p) =>
    p.reviews.forEach((r) => {
      if (r.status === "PENDING") count++;
    }),
  );
  res.json({ pending: count });
});

// @desc Get all reviews (admin table: stats + filters + search)
// @route GET /api/products/reviews/all?status=&rating=&productId=&search=
// @access Private/Admin
const getAllReviews = asyncHandler(async (req, res) => {
  const { status, rating, productId, search } = req.query;

  const products = await Product.find()
    .populate({ path: "reviews.user", select: "name profilePicture" })
    .select("reviews brandname images");

  let allReviews = [];
  const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };

  products.forEach((product) => {
    product.reviews.forEach((review) => {
      stats.total += 1;
      if (review.status === "PENDING") stats.pending += 1;
      if (review.status === "APPROVED") stats.approved += 1;
      if (review.status === "REJECTED") stats.rejected += 1;

      allReviews.push({
        _id: review._id,
        status: review.status,
        isFeatured: review.isFeatured,
        isVerifiedPurchase: review.isVerifiedPurchase,
        orderId: review.orderId,
        productId: product._id,
        product: {
          name: product.brandname,
          image: product.images?.[0] || null,
        },
        user: {
          name: review.user?.name || review.name,
          avatar: review.user?.profilePicture || null,
        },
        rating: review.rating,
        comment: review.comment,
        photos: review.photos || [],
        recommend: review.recommend,
        rejectionReason: review.rejectionReason,
        adminResponse: review.adminResponse,
        createdAt: review.createdAt,
      });
    });
  });

  if (status && status !== "all") {
    allReviews = allReviews.filter((r) => r.status === status.toUpperCase());
  }
  if (rating) {
    allReviews = allReviews.filter((r) => r.rating === Number(rating));
  }
  if (productId) {
    allReviews = allReviews.filter((r) => r.productId.toString() === productId);
  }
  if (search) {
    const q = search.toLowerCase();
    allReviews = allReviews.filter(
      (r) =>
        r.comment?.toLowerCase().includes(q) ||
        r.user?.name?.toLowerCase().includes(q) ||
        r.product?.name?.toLowerCase().includes(q),
    );
  }

  allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ stats, reviews: allReviews });
});

// @desc Featured reviews (public, e.g. homepage "Customer Love" section)
// @route GET /api/products/reviews/featured
// @access Public
const getFeaturedReviews = asyncHandler(async (req, res) => {
  const products = await Product.find({ "reviews.isFeatured": true })
    .select("reviews brandname images")
    .populate({ path: "reviews.user", select: "name profilePicture" });

  const featured = [];
  products.forEach((product) => {
    product.reviews.forEach((review) => {
      if (review.isFeatured && review.status === "APPROVED") {
        featured.push({
          _id: review._id,
          productId: product._id,
          product: {
            name: product.brandname,
            image: product.images?.[0] || null,
          },
          user: {
            name: review.user?.name || review.name,
            avatar: review.user?.profilePicture || null,
          },
          rating: review.rating,
          comment: review.comment,
          photos: review.photos || [],
          adminResponse: review.adminResponse?.text
            ? review.adminResponse
            : null,
          createdAt: review.createdAt,
        });
      }
    });
  });

  res.json(featured);
});

// @desc Check which items in an order are eligible for a review
// @route GET /api/products/reviews/eligibility/:orderId
// @access Private
// Powers the "Write a Review" button per item in My Orders.
const getReviewEligibility = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId).populate(
    "orderItems.product",
    "reviews brandname images",
  );

  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Not your order" });
  }

  const items = order.orderItems.map((item) => {
    const product = item.product;
    const existingReview = product?.reviews?.find(
      (r) =>
        r.user.toString() === req.user._id.toString() &&
        r.orderId &&
        r.orderId.toString() === orderId,
    );

    return {
      productId: product?._id,
      productName: item.name,
      image: item.image,
      size: item.size,
      canReview: order.orderStatus === "DELIVERED" && !existingReview,
      alreadyReviewed: !!existingReview,
      reviewStatus: existingReview?.status || null,
    };
  });

  res.json({ orderId: order._id, orderStatus: order.orderStatus, items });
});

// Alternative: Delete review by review ID only (searches across all products)
// Rating recalc is approved-only via recalculateProductRating.
const deleteReviewById = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const product = await Product.findOne({ "reviews._id": reviewId });
    if (!product) {
      return res
        .status(404)
        .json({ message: "Review not found in any product" });
    }

    product.reviews = product.reviews.filter(
      (r) => r._id.toString() !== reviewId,
    );

    recalculateProductRating(product);

    await product.save();
    res.json({ success: true, message: "Review deleted" });
  } catch (error) {
    console.error("❌ deleteReviewById error:", error);
    res.status(500).json({ message: error.message });
  }
};

// controllers/productController.js
// @desc    Fetch a product + its color variants + group info
// @route   GET /api/products/:id/full
// @access  Public
// Used by SingleProductPage.jsx. Applies the same approved-only review
// filtering / rating breakdown as getProductById, since this is the
// endpoint the product detail page actually calls.
const getProductFullById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate({ path: "reviews.user", select: "name profilePicture" })
    .lean();
  if (!product) return res.status(404).json({ message: "Product not found" });

  const variants = await Product.find({
    productGroupId: product.productGroupId,
    ...LIVE,
  }).lean();
  const group = await ProductGroup.findById(product.productGroupId).lean();

  const { publicReviews, ratingBreakdown, numReviews } =
    buildPublicReviewData(product);
  const customizerInfo = await computeCustomizerAvailability(product);

  const pricedProduct = applySubscriptionPrice(product, req.user);
  pricedProduct.reviews = publicReviews;
  pricedProduct.ratingBreakdown = ratingBreakdown;
  pricedProduct.numReviews = numReviews;
  Object.assign(pricedProduct, customizerInfo);

  // Computed per-variant so switching color on the product page still
  // resolves customizer availability correctly for whichever color is
  // active, not just the color the page was originally loaded with.
  const pricedVariants = await Promise.all(
    variants.map(async (v) => {
      const priced = applySubscriptionPrice(v, req.user);
      const info = await computeCustomizerAvailability(v);
      return Object.assign(priced, info);
    }),
  );

  res.json({
    product: pricedProduct,
    variants: pricedVariants,
    group,
  });
});

const updateGroupCommonFields = asyncHandler(async (req, res) => {
  await assertCanManageGroup(req.user, req.params.groupId);
  console.log("📁 req.files:", req.files);
  console.log("📦 req.body:", req.body);

  // ✅ Parse shippingDetails since it comes as a JSON string from FormData
  let shipping = req.body.shippingDetails;
  if (typeof shipping === "string") {
    shipping = JSON.parse(shipping);
  }

  if (shipping?.originAddress?.street2 !== undefined) {
    delete shipping.originAddress.street2;
  }

  let sizeChartPath = null;
  if (req.files?.sizeChart?.length > 0) {
    sizeChartPath = req.files.sizeChart[0].path.replace(/\\/g, "/");
  }

  const updateFields = {
    brandname: req.body.brandname,
    description: req.body.description,
    hsnCode: req.body.hsnCode, // ✅ ADD THIS LINE
    shippingDetails: shipping,
    isFeatured: req.body.isFeatured,
    "productdetails.gender": req.body.gender,
    "productdetails.category": req.body.category,
    "productdetails.subcategory": req.body.subcategory,
    "productdetails.type": req.body.type,
    "productdetails.fabric": req.body.fabric,
    "productdetails.ageRange": req.body.ageRange,
    washCare:
      typeof req.body.washCare === "string"
        ? JSON.parse(req.body.washCare)
        : req.body.washCare || [],
  };

  if (sizeChartPath !== null) {
    updateFields.sizeChart = sizeChartPath;
  }

  const result = await Product.updateMany(
    { productGroupId: req.params.groupId },
    { $set: updateFields },
  );

  res.json({
    message: "Common fields updated",
    updatedCount: result.modifiedCount,
  });
});
const addVariantToGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  await assertCanManageGroup(req.user, groupId);

  let { color, sizes, stockBySize, oldPrice, discount, price } = req.body;

  if (typeof sizes === "string") sizes = JSON.parse(sizes);
  if (typeof stockBySize === "string") stockBySize = JSON.parse(stockBySize);

  oldPrice = Number(oldPrice);
  discount = Number(discount);
  price = Number(price);

  const files = req.files || [];

  // ✅ BASIC VALIDATION
  if (!color || !sizes || !stockBySize) {
    res.status(400);
    throw new Error("Variant fields are missing");
  }

  // ✅ IMAGE VALIDATION (3–5)
  if (files.length < 3 || files.length > 5) {
    res.status(400);
    throw new Error("Each variant must have between 3 and 5 images");
  }

  const images = files.map((file) => file.path);

  // ✅ FIND BASE PRODUCT
  const baseProduct = await Product.findOne({ productGroupId: groupId });
  if (!baseProduct) {
    res.status(404);
    throw new Error("Product group not found");
  }

  // ✅ PREVENT DUPLICATE COLOR
  const existingVariant = await Product.findOne({
    productGroupId: groupId,
    "productdetails.color": color,
  });

  if (existingVariant) {
    res.status(400);
    throw new Error("Variant with this color already exists");
  }

  // ✅ SKU GENERATION
  const SKU = `${
    baseProduct.SKU.split("-")[0]
  }-${color.toUpperCase()}-${Date.now()}`;

  // ✅ CREATE VARIANT
  const newVariant = new Product({
    productGroupId: groupId,
    brandname: baseProduct.brandname,
    description: baseProduct.description,
    shippingDetails: baseProduct.shippingDetails,
    isFeatured: baseProduct.isFeatured,
    washCare: baseProduct.washCare || [],
    oldPrice,
    discount,
    price,
    SKU,
    images,

    productdetails: {
      gender: baseProduct.productdetails.gender,
      category: baseProduct.productdetails.category,
      subcategory: baseProduct.productdetails.subcategory,
      type: baseProduct.productdetails.type,
      fabric: baseProduct.productdetails.fabric,
      ageRange: baseProduct.productdetails.ageRange,
      color,
      sizes,
      stockBySize,
    },

    user: req.user._id,
    rating: 0,
    numReviews: 0,
  });

  const createdVariant = await newVariant.save();

  res.status(201).json({
    message: "Variant added successfully",
    variant: createdVariant,
  });
});

const updateProductGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  await assertCanManageGroup(req.user, groupId);
  const { brandname, description, price, oldPrice, discount, isFeatured } =
    req.body;

  // Only fields that should propagate
  const updateFields = {
    ...(brandname && { brandname }),
    ...(description && { description }),
    ...(price !== undefined && { price }),
    ...(oldPrice !== undefined && { oldPrice }),
    ...(discount !== undefined && { discount }),
    ...(isFeatured !== undefined && { isFeatured }),
  };

  const updatedProducts = await Product.updateMany(
    { productGroupId: groupId },
    { $set: updateFields },
    { new: true },
  );

  if (!updatedProducts) {
    res.status(404);
    throw new Error("Product group not found");
  }

  res.json({
    message: "Product group updated successfully",
    updatedCount: updatedProducts.nModified,
  });
});

const getProductsByGroupId = asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  if (!groupId) {
    res.status(400);
    throw new Error("Group ID is required");
  }

  const products = await Product.find({ productGroupId: groupId, ...LIVE }).lean();

  const finalProducts = products.map((product) =>
    applySubscriptionPrice(product, req.user),
  );

  if (!products) {
    res.status(404);
    throw new Error("No products found for this group");
  }

  res.json(finalProducts); // ✅ Must return JSON
});
const getProductGroup = asyncHandler(async (req, res) => {
  await assertCanManageGroup(req.user, req.params.groupId);
  const products = await Product.find({
    productGroupId: req.params.groupId,
  });

  if (!products.length) {
    res.status(404);
    throw new Error("Product group not found");
  }

  // parent/common fields from first product
  const base = products[0];

  res.json({
    common: {
      brandname: base.brandname,
      description: base.description,
      hsnCode: base.hsnCode,
      shippingDetails: base.shippingDetails,
      isFeatured: base.isFeatured,
      sizeChart: base.sizeChart,
      washCare: base.washCare || [],
      productdetails: {
        gender: base.productdetails.gender,
        category: base.productdetails.category,
        subcategory: base.productdetails.subcategory,
        type: base.productdetails.type,
        fabric: base.productdetails.fabric,
        ageRange: base.productdetails.ageRange,
      },
    },
    variants: products,
  });
});
// ─── updateVariant ───────────────────────────────────────────────
//
// BUGS FIXED (kept from prior patch):
//  1. product.images[index] existence check blocked adding images at new indexes
//  2. imageIndexes not normalised to array for single-file uploads
//  3. Added server-side guard: never save blob: or data: URIs to DB
//
const updateVariant = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Variant not found");
  }
  assertCanManage(req.user, product);

  // ── Prices ──────────────────────────────────────────────────
  if (req.body.oldPrice !== undefined && req.body.oldPrice !== "")
    product.oldPrice = Number(req.body.oldPrice);
  if (req.body.discount !== undefined && req.body.discount !== "")
    product.discount = Number(req.body.discount);
  if (req.body.price !== undefined && req.body.price !== "")
    product.price = Number(req.body.price);

  // ── Product details ─────────────────────────────────────────
  if (req.body.color) product.productdetails.color = req.body.color;
  if (req.body.sizes) product.productdetails.sizes = JSON.parse(req.body.sizes);
  if (req.body.stockBySize)
    product.productdetails.stockBySize = JSON.parse(req.body.stockBySize);

  // ── Image replacement ────────────────────────────────────────
  if (req.files && req.files.length > 0) {
    // Normalise to array (single upload sends a string)
    let imageIndexes = req.body.imageIndexes;
    if (!imageIndexes) {
      imageIndexes = [];
    } else if (typeof imageIndexes === "string") {
      imageIndexes = [imageIndexes];
    }

    req.files.forEach((file, i) => {
      const slotIndex = Number(imageIndexes[i]);
      if (isNaN(slotIndex)) return;

      const filePath = file.path;

      // ✅ Server-side guard: reject any path that looks like a data URI or blob URL
      if (filePath.startsWith("data:") || filePath.startsWith("blob:")) {
        console.warn(
          `Rejected bad image path at index ${slotIndex}:`,
          filePath.slice(0, 40),
        );
        return;
      }

      product.images[slotIndex] = filePath;
    });

    product.markModified("images");
  }

  const updated = await product.save();
  res.json(updated);
});

const getCategories = asyncHandler(async (req, res) => {
  const { gender } = req.query;
  const filter = gender ? { "productdetails.gender": gender, ...LIVE } : { ...LIVE };

  const products = await Product.find(filter)
    .select("productdetails -_id")
    .lean();

  const map = {};
  products.forEach((p) => {
    const style = p.productdetails?.garmentStyle;
    const sub = p.productdetails?.subcategory;
    if (!style) return;
    if (!map[style]) map[style] = [];
    if (sub && !map[style].includes(sub)) map[style].push(sub);
  });

  res.json(map);
});

export {
  getProducts,
  deleteProduct,
  createProduct,
  updateProduct,
  uploadProducts,
  addToCart,
  getCart,
  deleteCartItem,
  getProductById,
  approveReview,
  rejectReview,
  unapproveReview,
  toggleFeaturedReview,
  respondToReview,
  getPendingReviews,
  getPendingReviewsCount,
  getAllReviews,
  getFeaturedReviews,
  getReviewEligibility,
  deleteReviewById,
  getProductBySku,
  getProductVariants,
  updateGroupCommonFields,
  addVariantToGroup,
  updateProductGroup,
  getProductFullById,
  getProductsByGroupId,
  getProductGroup,
  updateVariant,
  createProductReview,
  getCategories,
};
