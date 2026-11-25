// utils/shopFamily.js — a shop tee's family id (25 Nov 2026): one design in several styles shares it
// ("ayyappa-tiger-saranam-1a2b3c": the name in letters, then a short random part so two designs never share one by chance)
import crypto from "crypto";

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
export const familyId = (name) =>
  `${norm(name).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tee"}-${crypto.randomBytes(3).toString("hex")}`;
export const FAMILY = /^[a-z0-9-]{1,40}$/;
