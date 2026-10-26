// utils/adminMenu.js
//
// The admin menu in one place: 8 sections, each pointing at the pages
// that already exist. Sidebar and top bar both read from here.
// Hidden until built (routes still exist): /admin/transactions (Payments),
// /admin/sellers — both are empty placeholders.

export const ADMIN_MENU = [
  {
    key: "home",
    label: "Home",
    icon: "home",
    to: "/admin/dashboard",
    match: ["/admin/dashboard", "/admin/reports"],
  },
  {
    key: "orders",
    label: "Orders",
    icon: "orders",
    to: "/admin/orders",
    children: [
      { to: "/admin/orders", label: "All orders" },
      { to: "/admin/print-sheets", label: "Print sheets" },
      { to: "/admin/invoices", label: "Invoices" },
      { to: "/admin/shipping", label: "Shipping rates" },
    ],
  },
  {
    key: "customizable",
    label: "Create your IDENTEE",
    icon: "customizable",
    to: "/admin/customizable",
    // the old editors stay reachable (linked from the Customizable page)
    match: ["/admin/customizable", "/admin/garment-types", "/admin/garment-photos"],
  },
  {
    key: "readymade",
    label: "Shop your IDENTEE",
    icon: "readymade",
    to: "/admin/products",
    children: [
      { to: "/admin/products", label: "All products" },
      { to: "/admin/studio", label: "Studio (design a tee)" },
      // (the Collection maker — many tees from one prompt — is parked since 25 Oct 2026: the Studio does the job;
      //  its code stays in pages/admin/CollectionMakerPage.jsx for a later "rough drafts" feature)
      { to: "/admin/upload-product", label: "Add a product" },
      { to: "/admin/bulk-upload", label: "Add many (spreadsheet)" },
    ],
  },
  {
    key: "library",
    label: "Design library",
    icon: "library",
    to: "/admin/art-designs",
    children: [
      { to: "/admin/art-designs", label: "Designs" },
      { to: "/admin/art-categories", label: "Design groups" },
      { to: "/admin/art-bulk-upload", label: "Add many designs" },
    ],
  },
  {
    key: "storefront",
    label: "Storefront",
    icon: "storefront",
    to: "/admin/categories",
    children: [
      { to: "/admin/categories", label: "Categories" },
      { to: "/admin/offer-banner", label: "Offer banner" },
      { to: "/admin/video-banner", label: "Video banner" },
      { to: "/admin/offers", label: "Coupons" },
      { to: "/admin/reviews", label: "Reviews" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    icon: "customers",
    to: "/admin/users",
    children: [
      { to: "/admin/users", label: "All customers" },
      { to: "/admin/subscribers", label: "Subscribers" },
      { to: "/admin/waitlist", label: "Notify me list" },
      { to: "/admin/subscriptions", label: "Subscription plans" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    to: "/admin/settings",
  },
];

const startsWith = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

// Which section (and page) does this URL belong to?
export function findMenuSection(pathname) {
  for (const section of ADMIN_MENU) {
    const prefixes = [
      ...(section.match || [section.to]),
      ...(section.children || []).map((c) => c.to),
    ];
    if (prefixes.some((p) => startsWith(pathname, p))) return section;
  }
  return null;
}

export function findMenuPage(pathname) {
  const section = findMenuSection(pathname);
  if (!section) return null;
  const page = (section.children || []).find((c) => startsWith(pathname, c.to));
  return { section, page };
}

// Where "← Back" goes: one level UP, not the previous page in the browser's history (after opening an invoice,
// Back on Orders went to the invoice — 21 Oct 2026). The client's rule, for every section:
//   a page inside a list (one invoice, one customer, editing a product) → that list
//   a section's other pages (Invoices, Print sheets, Shipping rates)     → the section's main page (Orders)
//   the section's main page (Orders, All customers, Designs…)            → the admin Home
export function backTarget(pathname) {
  const where = findMenuPage(pathname);
  if (!where) return "/admin/dashboard";
  const main = where.section.to;
  const base = where.page?.to || (where.section.match || [main]).find((p) => startsWith(pathname, p)) || main;
  const here = pathname.replace(/\/+$/, "");
  if (here !== base) return base;
  if (base !== main) return main;
  return "/admin/dashboard";
}
