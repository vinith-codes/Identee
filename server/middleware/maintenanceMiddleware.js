// middleware/maintenanceMiddleware.js
//
// Blocks customer-facing traffic with 503 when general.maintenanceMode
// is true. Self-contained JWT decode (mirrors authMiddleware.js's
// `protect`) rather than relying on req.user being set by another
// middleware first — this lets it be mounted once, globally, in
// server.js without depending on route-level optionalAuth ordering.
// Admins/sellers with a valid token always pass through untouched.
import jwt from "jsonwebtoken";
import Setting from "../models/settingModel.js";
import User from "../models/userModel.js";

// Path prefixes that must always stay reachable, maintenance mode or
// not — the settings API itself (so an admin can turn it back off),
// auth (so an admin can log in), and static uploads.
// (/api/waitlist: "Notify me" keeps working, so visitors can ask to be told when the site is back)
const ALWAYS_ALLOWED_PREFIXES = ["/api/settings", "/api/users", "/uploads", "/api/waitlist"];

export const checkMaintenanceMode = async (req, res, next) => {
  try {
    if (ALWAYS_ALLOWED_PREFIXES.some((p) => req.originalUrl.startsWith(p))) {
      return next();
    }

    const setting = await Setting.findOne({
      key: "general.maintenanceMode",
    }).lean();
    if (!setting?.value) return next();

    // Maintenance is ON — check for a valid admin/seller token before blocking.
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("isAdmin isSeller");
        if (user && (user.isAdmin || user.isSeller)) {
          return next();
        }
      } catch {
        // invalid/expired token — fall through to the 503 below
      }
    }

    return res.status(503).json({
      message:
        "The store is temporarily down for maintenance. Please check back soon.",
    });
  } catch (err) {
    // If the maintenance check itself fails (e.g. DB hiccup), fail OPEN —
    // never let a broken settings lookup take the whole storefront down.
    console.error("Maintenance check error:", err.message);
    return next();
  }
};
