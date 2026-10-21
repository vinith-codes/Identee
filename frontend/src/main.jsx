import React from "react";
import ReactDOM from "react-dom/client";
// the shop, the admin, or both together — chosen by the build (vite.config.js, utils/siteUrls.js)
import App from "@identee-app";
import "./index.css";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import axios from "axios";
import api, { img } from "../api.js";
import { watchForExpiredLogin } from "./utils/sessionExpiry";
import { ToastContainer } from "react-toastify";

// an expired or invalid login logs out cleanly and opens the login page (utils/sessionExpiry.js)
watchForExpiredLogin([axios, api, img], import.meta.env.VITE_API_URL || "http://localhost:5000");

// After the site is updated, a browser still showing the OLD page asks for page files that are gone (a new build
// names them differently), and the page breaks — pages "reload", pictures go missing, the login seems lost
// (seen on the live site, 21 Oct 2026). Vite reports that as "vite:preloadError": reload ONCE to get the new
// version. (Remembered for a minute, so a file that is really broken can't make the page reload over and over.)
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "identee:reloadedForUpdate";
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    // (storage blocked: reload anyway — at worst once more)
  }
  if (Date.now() - last < 60_000) return; // just reloaded: let the error show instead
  event.preventDefault();
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <App />
    {/* the short messages pages show with toast(…) — "Payment failed…", "Account deleted" (missing since June: none showed) */}
    <ToastContainer position="top-right" autoClose={4000} newestOnTop />
  </Provider>,
);
