import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// One project, two websites (utils/siteUrls.js):
//   npm run build:shop   (--mode shop)   → dist-shop   — the shop, identee.co.in
//   npm run build:admin  (--mode admin)  → dist-admin  — the team's pages, admin.identee.co.in
//   npm run dev / build  (any other mode) → both together on one address, as before (the laptop)
const APPS = {
  shop: "src/apps/ShopApp.jsx",
  admin: "src/apps/AdminApp.jsx",
  all: "src/App.jsx",
};
const GA_ID = "G-NH8YDV5LP9"; // IDENTEE's Google Analytics (the shop only)
const META_PIXEL_ID = "1864766031328724"; // IDENTEE's Meta (Facebook/Instagram) Pixel (the shop only)

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const app = mode === "shop" || mode === "admin" ? mode : "all";
  const dir = fileURLToPath(new URL(".", import.meta.url));
  // a build in "shop"/"admin" mode still reads .env.production (the server's VITE_API_URL lives there);
  // a setting given on the command line (VITE_API_URL=… npm run build:shop) wins over both files
  const base = command === "build" && app !== "all" ? loadEnv("production", dir, "VITE_") : {};
  const own = loadEnv(mode, dir, "VITE_");
  const env = { ...base, ...own };
  const onLaptop = command === "serve";
  const shopUrl = env.VITE_SHOP_URL || (onLaptop ? "http://localhost:5173" : "https://identee.co.in");
  const adminUrl = env.VITE_ADMIN_URL || (onLaptop ? "http://localhost:5174" : "https://admin.identee.co.in");

  const define = {
    "import.meta.env.VITE_IDENTEE_APP": JSON.stringify(app),
    "import.meta.env.VITE_SHOP_URL": JSON.stringify(shopUrl),
    "import.meta.env.VITE_ADMIN_URL": JSON.stringify(adminUrl),
  };
  for (const [key, value] of Object.entries(base)) {
    if (!(key in own)) define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  // the admin website's start page: its own name, kept out of search results, and no payment script
  // (Razorpay is only used at the shop's checkout)
  const adminPage = {
    name: "identee-admin-page",
    transformIndexHtml(html) {
      if (app !== "admin") return html;
      return html
        .replace("<title>IDENTEE</title>", '<meta name="robots" content="noindex, nofollow" />\n    <title>IDENTEE Admin</title>')
        .replace(/\s*<script src="https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js"><\/script>/, "");
    },
  };

  // the shop's start page: the Google Analytics tag first in <head> (the user, 31 Oct 2026). Built shop only, so the
  // admin pages and the laptop's test servers are not counted as visits. GA4's enhanced measurement counts each page
  // change in the shop (browser history events), so nothing more is needed for the pages after the first.
  // The Meta Pixel follows it (the user, 31 Oct 2026), exactly as Meta gives it; the Pixel also counts each page
  // change by itself (it listens to the browser history). Its <noscript> picture goes first in <body>.
  const shopPage = {
    name: "identee-shop-page",
    transformIndexHtml(html) {
      if (app !== "shop" || command !== "build") return html;
      return html
        .replace(
          "<head>",
          `<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', '${GA_ID}');
    </script>
    <!-- Meta Pixel Code -->
    <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${META_PIXEL_ID}');
      fbq('track', 'PageView');
    </script>
    <!-- End Meta Pixel Code -->`,
        )
        .replace(
          /<body([^>]*)>/,
          `<body$1>
    <noscript><img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1"
    /></noscript>`,
        );
    },
  };

  return {
    plugins: [react(), tailwindcss(), adminPage, shopPage],
    // main.jsx imports "@identee-app": the shop, the admin, or both, depending on the mode
    resolve: { alias: { "@identee-app": fileURLToPath(new URL(APPS[app], import.meta.url)) } },
    define,
    // the shop and the admin test servers run side by side: each keeps its own prepared libraries (sharing one
    // folder, each kept redoing it and the other's pages failed to load — "Outdated Optimize Dep")
    cacheDir: app === "all" ? "node_modules/.vite" : `node_modules/.vite-${app}`,
    assetsInclude: ["**/*.glb"],
    // jszip is only loaded when an admin downloads print files; listing it here
    // stops the dev server from reloading the page the first time that happens
    optimizeDeps: { include: ["jszip"] },
  };
});
