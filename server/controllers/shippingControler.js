import shippingCosts from "../models/shippingcostModel.js";

/**
 * Get shipping settings (global)
 */
const getShippingCost = async (req, res) => {
  try {
    const settings = await shippingCosts.findOne();

    if (!settings) {
      return res.json({
        freeShippingAbove: 0,
        shippingRules: [],
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch shipping settings" });
  }
};

/**
 * Add state shipping cost
 */
const addStateShipping = async (req, res) => {
  try {
    const { state, cost, alwaysCharge } = req.body;

    if (!state || cost == null) {
      return res.status(400).json({ message: "State and cost are required" });
    }

    let settings = await shippingCosts.findOne();

    if (!settings) {
      settings = new shippingCosts({
        freeShippingAbove: 0,
        shippingRules: [],
      });
    }

    // prevent duplicate state
    const exists = settings.shippingRules.find(
      (s) => s.state.toLowerCase() === state.toLowerCase(),
    );

    if (exists) {
      return res.status(400).json({ message: "State already exists" });
    }

    settings.shippingRules.push({
      state,
      cost,
      alwaysCharge: Boolean(alwaysCharge),
    });
    await settings.save();

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to add state" });
  }
};

/**
 * Update state shipping cost (and/or its alwaysCharge flag)
 */
const updateStateShipping = async (req, res) => {
  try {
    const { cost, alwaysCharge } = req.body;
    const { id } = req.params;

    if (cost == null) {
      return res.status(400).json({ message: "Cost is required" });
    }

    const settings = await shippingCosts.findOne();

    if (!settings) {
      return res.status(404).json({ message: "Shipping settings not found" });
    }

    const stateRule = settings.shippingRules.id(id);

    if (!stateRule) {
      return res.status(404).json({ message: "State not found" });
    }

    stateRule.cost = cost;
    if (alwaysCharge !== undefined) {
      stateRule.alwaysCharge = Boolean(alwaysCharge);
    }
    await settings.save();

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to update state cost" });
  }
};

/**
 * Update free shipping amount
 */
const updateFreeShipping = async (req, res) => {
  try {
    const { freeShippingAbove } = req.body;

    if (freeShippingAbove == null || freeShippingAbove < 0) {
      return res.status(400).json({ message: "Invalid free shipping amount" });
    }

    const settings = await shippingCosts.findOneAndUpdate(
      {},
      { freeShippingAbove },
      { upsert: true, new: true },
    );

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to update free shipping cost" });
  }
};

const deleteStateShipping = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await shippingCosts.findOne();

    if (!settings) {
      return res.status(404).json({ message: "Shipping settings not found" });
    }

    const stateRule = settings.shippingRules.id(id);

    if (!stateRule) {
      return res.status(404).json({ message: "State not found" });
    }

    // Mongoose-safe removal
    settings.shippingRules.pull({ _id: id });
    await settings.save();

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to delete state" });
  }
};

/**
 * Get shipping cost based on state & free shipping rule
 * GET /api/shipping/getshippingcost?state=Tamil Nadu
 */
// PUT /api/shipping/flatshipping (admin): { flatRate: number | null, freeFromPieces }
// flatRate = ₹ per order, free from freeFromPieces pieces; null = use each state's own cost again.
const updateFlatShipping = async (req, res) => {
  try {
    const { flatRate, freeFromPieces } = req.body;
    const rate = flatRate === null ? null : Number(flatRate);
    const from = Number(freeFromPieces);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 10000)) {
      return res.status(400).json({ message: "Enter a shipping charge from 0 to 10000" });
    }
    if (!Number.isInteger(from) || from < 1 || from > 100) {
      return res.status(400).json({ message: "Free shipping needs a number of pieces from 1 to 100" });
    }
    const settings = await shippingCosts.findOneAndUpdate({}, { flatRate: rate, freeFromPieces: from }, { upsert: true, new: true });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to update flat shipping" });
  }
};

const getShippingCostByState = async (req, res) => {
  try {
    const { state } = req.query;

    if (!state) {
      return res.status(400).json({ message: "State is required" });
    }

    const shippingSettings = await shippingCosts.findOne();

    if (!shippingSettings) {
      return res.status(404).json({ message: "Shipping settings not found" });
    }

    const stateRule = shippingSettings.shippingRules.find(
      (rule) => rule.state.toLowerCase() === state.toLowerCase(),
    );

    if (!stateRule) {
      return res.status(404).json({
        message: `Shipping not available for ${state}`,
      });
    }

    // flat shipping (₹flatRate, free from freeFromPieces pieces) replaces the state's own cost — see checkoutService
    const flat = shippingSettings.flatRate !== null && shippingSettings.flatRate !== undefined;
    res.json({
      shippingCost: flat ? shippingSettings.flatRate : stateRule.cost,
      freeShippingAbove: flat ? 0 : shippingSettings.freeShippingAbove,
      freeFromPieces: flat ? shippingSettings.freeFromPieces : null,
      state: stateRule.state,
      alwaysCharge: stateRule.alwaysCharge || false,
    });
  } catch (error) {
    console.error("Error fetching shipping cost:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  getShippingCost,
  addStateShipping,
  updateStateShipping,
  updateFreeShipping,
  updateFlatShipping,
  deleteStateShipping,
  getShippingCostByState,
};
