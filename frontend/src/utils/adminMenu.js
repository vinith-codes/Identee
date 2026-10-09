// utils/adminMenu.js
//
// The admin menu in one place: 8 sections, each pointing at the pages
// that already exist. Sidebar and top bar both read from here.

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
      { to: "/admin/invoices", label: "Invoices" },
      { to: "/admin/transactions", label: "Payments" },
      { to: "/admin/shipping", label: "Shipping rates" },
    ],
  },
  {
    key: "customizable",
    label: "Customizable",
    icon: "customizable",
    to: "/admin/garment-types",
    children: [
      { to: "/admin/garment-types", label: "Garments, colours & price" },
      { to: "/admin/garment-photos", label: "Photos & print areas" },
    ],
  },
  {
    key: "readymade",
    label: "Ready-made",
    icon: "readymade",
    to: "/admin/products",
    children: [
      { to: "/admin/products", label: "All products" },
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
      { to: "/admin/sellers", label: "Sellers" },
      { to: "/admin/subscribers", label: "Subscribers" },
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
