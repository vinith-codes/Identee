// controllers/settingController.js
import asyncHandler from "express-async-handler";
import Setting from "../models/settingModel.js";
import {
  GENERAL_SETTINGS_DEFAULTS,
  CATEGORY,
} from "../utils/settingsDefaults.js";

const MASK = "********";


const ensureGeneralDefaults = async () => {
  await Promise.all(
    GENERAL_SETTINGS_DEFAULTS.map((def) =>
      Setting.findOneAndUpdate(
        { key: def.key },
        { $setOnInsert: { ...def, category: CATEGORY } },
        { upsert: true, new: true },
      ),
    ),
  );
};


export const getPublicSettings = asyncHandler(async (req, res) => {
  await ensureGeneralDefaults();

  const settings = await Setting.find({
    isPublic: true,
    type: { $ne: "secret" },
  })
    .select("key value")
    .lean();

  const map = {};
  settings.forEach((s) => {
    map[s.key] = s.value;
  });
  // Maintenance Mode isn't a public setting, but the shop must know it is on to show its "back soon" page instead of
  // a half-empty shop (components/MaintenanceGate.jsx) — only whether it is on is sent
  const maintenance = await Setting.findOne({ key: "general.maintenanceMode" }).select("value").lean();
  map["general.maintenanceMode"] = maintenance?.value === true;
  res.json(map);
});

export const getSettings = asyncHandler(async (req, res) => {
  await ensureGeneralDefaults();

  const filter = req.query.category ? { category: req.query.category } : {};
  const settings = await Setting.find(filter).lean();

  const result = settings.map((s) => ({
    key: s.key,
    type: s.type,
    category: s.category,
    description: s.description,
    isPublic: s.isPublic,
    updatedAt: s.updatedAt,
    value: s.type === "secret" && s.value ? MASK : s.value,
    hasValue: s.type === "secret" ? !!s.value : undefined,
  }));

  res.json(result);
});

export const updateSettingsBulk = asyncHandler(async (req, res) => {
  const { category, values } = req.body;

  if (!category || typeof category !== "string") {
    res.status(400);
    throw new Error("category is required and must be a string");
  }
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    res.status(400);
    throw new Error("values must be a plain object of key: value pairs");
  }

  const keys = Object.keys(values);
  if (keys.length === 0) {
    res.status(400);
    throw new Error("No settings provided to update");
  }

  if (category === CATEGORY) {
    await ensureGeneralDefaults();
  }

  const existing = await Setting.find({ category, key: { $in: keys } });
  const existingMap = Object.fromEntries(existing.map((s) => [s.key, s]));

  if (existing.length === 0) {
    console.warn(
      `[settings/bulk] No existing settings matched category="${category}" for keys: ${keys.join(", ")}. ` +
        `Check that this matches the CATEGORY constant in utils/settingsDefaults.js exactly.`,
    );
  }

  const failedKeys = [];
  const unknownKeys = []; 
  const updates = [];
  for (const key of keys) {
    const doc = existingMap[key];
    if (!doc) {
      unknownKeys.push(key);
      continue; // still never create arbitrary settings via bulk save — just report it now
    }
    if (doc.type === "secret" && values[key] === MASK) continue; // untouched secret — skip

    doc.value = values[key];
    doc.updatedBy = req.user?._id;

    
    updates.push(
      doc.save().catch((err) => {
        console.error(
          `[settings/bulk] Failed to save key "${key}":`,
          err.message,
        );
        failedKeys.push(key);
      }),
    );
  }

  if (unknownKeys.length > 0) {
    console.warn(
      `[settings/bulk] Ignored unknown keys for category="${category}": ${unknownKeys.join(", ")}. ` +
        `Add them to GENERAL_SETTINGS_DEFAULTS in utils/settingsDefaults.js if they should be saveable.`,
    );
  }

  await Promise.all(updates);

  const refreshed = await Setting.find({ category }).lean();
  const responseMap = {};
  refreshed.forEach((s) => {
    responseMap[s.key] = s.type === "secret" && s.value ? MASK : s.value;
  });

  res.json({
    message:
      failedKeys.length > 0 || unknownKeys.length > 0
        ? "Settings updated with some fields skipped"
        : "Settings updated",
    category,
    values: responseMap,
    ...(failedKeys.length > 0 && { failedKeys }),
    ...(unknownKeys.length > 0 && { unknownKeys }),
  });
});

export const updateSetting = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const setting = await Setting.findOne({ key });
  if (!setting) {
    res.status(404);
    throw new Error("Setting not found");
  }
  if (setting.type === "secret" && value === MASK) {
    return res.json({ key, value: MASK }); // no-op, mask sent back unchanged
  }

  setting.value = value;
  setting.updatedBy = req.user._id;
  await setting.save();

  res.json({
    key: setting.key,
    value: setting.type === "secret" ? MASK : setting.value,
  });
});


export const uploadSettingAsset = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }
  res.status(201).json({ path: req.file.path });
});
