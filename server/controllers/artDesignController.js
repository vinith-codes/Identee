import asyncHandler from "express-async-handler";
import { deleteStoredFile, uploadFile, mimeFromName } from "../utils/imageStorage.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import ArtDesign from "../models/artDesignModel.js";
import ArtCategory from "../models/artCategoryModel.js";

// GET /api/art-designs?category=<categoryId>
export const getArtDesigns = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = category;
  const designs = await ArtDesign.find(filter)
    .populate("category", "name thumbnail")
    .sort({ createdAt: -1 });
  res.json(designs);
});

// GET /api/art-designs/all (admin — includes category info, all designs)
export const getAllArtDesignsAdmin = asyncHandler(async (req, res) => {
  const designs = await ArtDesign.find()
    .populate("category", "name")
    .sort({ createdAt: -1 });
  res.json(designs);
});

// POST /api/art-designs  (multipart, field name "image")
export const createArtDesign = asyncHandler(async (req, res) => {
  const { name, category, price } = req.body;
  if (!name || !category || price === undefined) {
    res.status(400);
    throw new Error("name, category and price are required");
  }
  if (!req.file) {
    res.status(400);
    throw new Error("Design image is required");
  }

  const design = await ArtDesign.create({
    name: name.trim(),
    category,
    price: Number(price),
    imageUrl: req.file.path,
  });
  res.status(201).json(design);
});

// DELETE /api/art-designs/:id
export const deleteArtDesign = asyncHandler(async (req, res) => {
  const design = await ArtDesign.findById(req.params.id);
  if (!design) {
    res.status(404);
    throw new Error("Design not found");
  }
  if (design.imageUrl) await deleteStoredFile(design.imageUrl);
  await design.deleteOne();
  res.json({ message: "Design deleted" });
});

// ============================================================
// @desc Bulk upload art designs (zip: designs.xlsx + images)
// @route POST /api/art-designs/bulk-upload
// @access Private/Admin
// ============================================================
export const bulkUploadArtDesigns = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("ZIP file required");
  }

  // controllers/artDesignController.js → one level up = server/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const PROJECT_ROOT = path.resolve(__dirname, "../");

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
  const imageEntryMap = {};

  zipEntries.forEach((entry) => {
    if (entry.isDirectory || entry.entryName.includes("__MACOSX")) return;
    const ext = path.extname(entry.entryName).toLowerCase();
    const basename = path.basename(entry.entryName);
    if (allowedImageExts.includes(ext)) {
      imageEntryMap[basename] = entry;
    }
  });

  // ✅ Parse Excel
  const excelBuffer = excelEntry.getData();
  const workbook = XLSX.read(excelBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // Stores a ZIP entry via utils/imageStorage (Cloudinary) and returns its URL.
  const saveEntry = async (entry, folder) => {
    const { url } = await uploadFile(entry.getData(), mimeFromName(entry.entryName), folder, entry.entryName);
    return url;
  };

  let created = 0;
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const categoryName = String(row.category || "").trim();
      const name = String(row.name || "").trim();
      const price = parseFloat(row.price);
      const imageFileName = String(row.image || "").trim();

      if (!categoryName) throw new Error("category is missing");
      if (!name) throw new Error("name is missing");
      if (isNaN(price)) throw new Error("price is missing/invalid");
      if (!imageFileName) throw new Error("image filename is missing");

      // ✅ Find the image in the zip by basename
      const basename = path.basename(imageFileName);
      const entry = imageEntryMap[basename];
      if (!entry) {
        throw new Error(`Image "${basename}" not found inside the ZIP`);
      }

      const imageUrl = await saveEntry(entry, "art-designs");

      // ✅ Auto-create category if it doesn't exist yet
      //    (uses this design's image as the category thumbnail —
      //     admin can change the thumbnail later from Art Categories page)
      let category = await ArtCategory.findOne({ name: categoryName });
      if (!category) {
        category = await ArtCategory.create({
          name: categoryName,
          thumbnail: imageUrl,
        });
      }

      await ArtDesign.create({
        category: category._id,
        name,
        price,
        imageUrl,
      });

      created++;
    } catch (err) {
      failed.push({ row: rowNum, name: row.name || "", reason: err.message });
    }
  }

  res.status(201).json({
    message: `Bulk upload complete — ${created} design(s) created`,
    created,
    ...(failed.length > 0 && { failed, failedCount: failed.length }),
  });
});
