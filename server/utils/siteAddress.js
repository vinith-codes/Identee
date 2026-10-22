import Setting from "../models/settingModel.js";

// an address as a link that opens: "identee.co.in" (as Settings → General may hold it) → "https://identee.co.in"
export const withScheme = (url) => {
  const u = String(url || "").trim().replace(/\/+$/, "");
  return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u;
};

// the shop's address for links in emails: Settings → General → website, else the first CORS address
export const siteAddress = async () => {
  const set = (await Setting.findOne({ key: "general.websiteUrl" }).select("value").lean())?.value;
  const fromCors = String(process.env.CORS_ORIGIN || "").split(",")[0].trim();
  return withScheme(set || fromCors || "https://identee.co.in");
};
