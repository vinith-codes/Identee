// utils/settingsDefaults.js
//
// Default General Settings, matching the spec's required defaults
// (store name IDENTEE, currency INR, timezone Asia/Kolkata). Used by
// the one-time seed upsert so the admin UI always has something
// sensible to render even before anyone has saved anything.

export const GENERAL_SETTINGS_DEFAULTS = [
  {
    key: "general.storeName",
    value: "IDENTEE",
    type: "string",
    isPublic: true,
    description: "Store name shown across the site",
  },
  {
    key: "general.storeLogo",
    value: "",
    type: "image",
    isPublic: true,
    description: "Store logo",
  },
  {
    key: "general.favicon",
    value: "",
    type: "image",
    isPublic: true,
    description: "Browser tab favicon",
  },
  {
    key: "general.storeDescription",
    value: "",
    type: "string",
    isPublic: true,
    description: "Short store description",
  },
  {
    key: "general.storeEmail",
    value: "",
    type: "string",
    isPublic: true,
    description: "Primary store email",
  },
  {
    key: "general.supportEmail",
    value: "",
    type: "string",
    isPublic: false,
    description: "Customer support email",
  },
  {
    key: "general.phoneNumber",
    value: "",
    type: "string",
    isPublic: true,
    description: "Primary contact phone number",
  },
  {
    key: "general.whatsappNumber",
    value: "",
    type: "string",
    isPublic: true,
    description: "WhatsApp contact number",
  },
  {
    key: "general.businessAddress",
    value: "",
    type: "string",
    isPublic: true,
    description: "Registered business address",
  },
  {
    key: "general.gstin",
    value: "",
    type: "string",
    isPublic: false,
    description: "GSTIN",
  },
  {
    // the name under the signature on every invoice (the proprietor of Makaliamman Traders)
    key: "general.authorisedSignatory",
    value: "Sathish Kumar",
    type: "string",
    isPublic: true,
    description: "Authorised signatory (printed on invoices)",
  },
  {
    key: "general.currency",
    value: "INR",
    type: "string",
    isPublic: true,
    description: "Store currency",
  },
  {
    key: "general.timezone",
    value: "Asia/Kolkata",
    type: "string",
    isPublic: false,
    description: "Store timezone",
  },
  {
    key: "general.websiteUrl",
    value: "",
    type: "string",
    isPublic: true,
    description: "Public website URL",
  },
  {
    key: "general.instagramUrl",
    value: "",
    type: "string",
    isPublic: true,
    description: "Instagram profile URL",
  },
  {
    key: "general.facebookUrl",
    value: "",
    type: "string",
    isPublic: true,
    description: "Facebook page URL",
  },
  {
    key: "general.youtubeUrl",
    value: "",
    type: "string",
    isPublic: true,
    description: "YouTube channel URL",
  },
  {
    // off = "Shop your IDENTEE" (ready-made products) shows Coming soon and its products can't be ordered
    key: "general.shopOpen",
    value: false,
    type: "boolean",
    isPublic: true,
    description: "Shop your IDENTEE is open (off: Coming soon)",
  },
  {
    key: "general.maintenanceMode",
    value: false,
    type: "boolean",
    isPublic: false,
    description: "Blocks storefront traffic when true",
  },
];

export const CATEGORY = "general";
