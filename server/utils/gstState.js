// utils/gstState.js
//
// Which GST applies to an order: delivered inside the business's own state → CGST + SGST (half each);
// to another state → IGST (the whole GST). The business's state is read from its GSTIN (Admin → Settings →
// GSTIN): the first two digits are the state code. With no GSTIN set yet: BUSINESS_STATE in .env, else Tamil Nadu
// (the business is in Tirupur).
import Setting from "../models/settingModel.js";

// GST state codes (CBIC)
const STATE_BY_CODE = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", 10: "Bihar", 11: "Sikkim",
  12: "Arunachal Pradesh", 13: "Nagaland", 14: "Manipur", 15: "Mizoram", 16: "Tripura", 17: "Meghalaya", 18: "Assam",
  19: "West Bengal", 20: "Jharkhand", 21: "Odisha", 22: "Chhattisgarh", 23: "Madhya Pradesh", 24: "Gujarat",
  26: "Dadra and Nagar Haveli and Daman and Diu", 27: "Maharashtra", 29: "Karnataka", 30: "Goa", 31: "Lakshadweep",
  32: "Kerala", 33: "Tamil Nadu", 34: "Puducherry", 35: "Andaman and Nicobar Islands", 36: "Telangana",
  37: "Andhra Pradesh", 38: "Ladakh",
};
const DEFAULT_STATE = "Tamil Nadu";

// "Tamil Nadu", "tamilnadu", " TAMIL NADU " → "tamilnadu"; a few common other spellings
const ALIASES = { orissa: "odisha", pondicherry: "puducherry", nctofdelhi: "delhi", newdelhi: "delhi" };
export const stateKey = (s) => {
  const k = String(s || "").toLowerCase().replace(/[^a-z]/g, "").replace(/^the/, "");
  return ALIASES[k] || k;
};

export const stateFromGstin = (gstin) => {
  const m = /^\s*(\d{2})[A-Z0-9]{13}\s*$/i.exec(String(gstin || ""));
  return m ? STATE_BY_CODE[m[1]] || STATE_BY_CODE[Number(m[1])] || null : null;
};

// the business's state (cached for a minute: read on every quote)
let cache = { at: 0, state: null };
export async function businessState() {
  if (Date.now() - cache.at < 60_000 && cache.state) return cache.state;
  const gstin = (await Setting.findOne({ key: "general.gstin" }).select("value").lean())?.value;
  const state = stateFromGstin(gstin) || process.env.BUSINESS_STATE?.trim() || DEFAULT_STATE;
  cache = { at: Date.now(), state };
  return state;
}

/**
 * Splits the GST in an order: { interState, cgst, sgst, igst } (rupees, 2 decimals, summing to `tax`).
 * @param tax            the order's whole GST
 * @param deliveryState  the shipping address's state
 */
export async function splitGst(tax, deliveryState) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const home = await businessState();
  const interState = Boolean(deliveryState) && stateKey(deliveryState) !== stateKey(home);
  if (interState) return { interState, businessState: home, cgst: 0, sgst: 0, igst: round2(tax) };
  const cgst = round2(tax / 2);
  return { interState, businessState: home, cgst, sgst: round2(tax - cgst), igst: 0 };
}
