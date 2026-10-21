// utils/lockScroll.js — while a pop-up window is open, the page behind it stays still.
// On a phone, a swipe on the dark background (or past the end of the window's own list) used to scroll the page
// underneath. useLockBodyScroll(open) freezes the page while open is true and puts it back exactly as it was
// afterwards (several pop-ups at once are counted, so closing one doesn't unfreeze the page under another).
import { useEffect } from "react";

let locks = 0;
let saved = null;

export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const html = document.documentElement;
    const body = document.body;
    if (locks++ === 0) {
      saved = { html: html.style.overflow, body: body.style.overflow, over: body.style.overscrollBehavior };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    }
    return () => {
      if (--locks === 0 && saved) {
        html.style.overflow = saved.html;
        body.style.overflow = saved.body;
        body.style.overscrollBehavior = saved.over;
        saved = null;
      }
    };
  }, [active]);
}

// the visible screen height on phones (100vh there includes the part under the browser's bottom bar)
export const SCREEN_H = typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh") ? "100dvh" : "100vh";
