// utils/siteUrls.js — which website this is, and where the other one lives.
//
// The shop and the admin are two websites built from this one project (vite.config.js, by "mode"):
//   npm run build:shop   → the shop  (identee.co.in)       — VITE_IDENTEE_APP = "shop"
//   npm run build:admin  → the admin (admin.identee.co.in) — VITE_IDENTEE_APP = "admin"
//   npm run dev / build  → both together on one address    — VITE_IDENTEE_APP = "all" (the laptop, as before)
// A link to a page of the OTHER website goes through shopHref / adminHref: a full address when they are split,
// the plain path when both are one website.

export const APP = import.meta.env.VITE_IDENTEE_APP || "all";
export const SHOP_URL = String(import.meta.env.VITE_SHOP_URL || "").replace(/\/+$/, "");
export const ADMIN_URL = String(import.meta.env.VITE_ADMIN_URL || "").replace(/\/+$/, "");

/** a page of the shop, from anywhere (e.g. the admin's "View website") */
export const shopHref = (path = "/") => (APP === "admin" && SHOP_URL ? `${SHOP_URL}${path}` : path);
/** a page of the admin, from anywhere (e.g. the shop's "Admin" link) */
export const adminHref = (path = "/admin/dashboard") => (APP === "shop" && ADMIN_URL ? `${ADMIN_URL}${path}` : path);
