// studio/keyboardFit.js — the phone's keyboard and the design room (feedback 4, 13 Nov 2026).
//
// A phone's keyboard covers the bottom of the screen without making the page shorter, and slides the page up to
// show the box being typed in. The Assistant's question box sits at the very bottom of the room, right where the
// keyboard opens. So while the keyboard is up, the room (.dr-app) is moved into the strip of screen above it:
// data-kb="1" plus --vv-top / --vv-h (designRoom.css). When it closes, the room is full height again and the page is
// put back at the top (some phone browsers left it slid up, so the room's top bar went under the address bar).
//
// Why it is measured again and again: iPhones send the keyboard's height and the page's slide late and in steps
// (above all the first time the keyboard opens), sometimes with no event at the end, and an older fit that trusted
// the one number it got left the box under the keyboard. So on phones, after every tap on a box, focus, key or
// change of the visible part, the room is measured again on every frame for a moment — every time a box is used,
// not only the first. The numbers are written only when they change, so this costs next to nothing.
// The keyboard only counts while a box to type in has the focus (iOS 26 can leave the visible part small after the
// keyboard has gone; the room must not stay squeezed then). Laptops: one look per event, never fitted.

export const KB_MIN = 120; // px hidden at the bottom: less than this is the browser's own bars moving, not a keyboard
export const KB_WATCH_MS = 2000; // how long the room is measured again after a change (a late keyboard like Gboard)
export const KB_PHONE = "(max-width: 760px)"; // the phone layout (designRoom.css)

const NOT_TYPED = /^(checkbox|radio|range|color|file|button|submit|reset|image|hidden)$/i;

// a box to type in (the keyboard, or a list's picker, is only up for one of those)
export function isTypingBox(t) {
  if (!t || !t.tagName) return false;
  if (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return true;
  return t.tagName === "INPUT" && !NOT_TYPED.test(t.type || "text");
}

// Starts fitting the room `el` to the phone's keyboard; returns the clean-up.
// readout: a small line of the numbers used, top left of the screen — for testing on a real phone only.
export function fitRoomToKeyboard(el, { win = window, doc = document, readout = false } = {}) {
  const vv = win.visualViewport;
  if (!vv || !el) return () => {};
  const phone = win.matchMedia(KB_PHONE);
  const now = () => win.performance.now();
  let wasKeyboard = false;
  let settling = false; // the keyboard just closed: the page is held at the top until the measuring stops
  let frame = 0;
  let until = 0;
  let blurTimer = 0;

  let shown = null;
  if (readout && doc.body) {
    shown = doc.createElement("pre");
    shown.style.cssText = "position:fixed;left:4px;top:4px;z-index:9999;margin:0;padding:3px 6px;font:11px/1.3 monospace;background:rgba(0,0,0,.75);color:#fff;pointer-events:none";
    doc.body.appendChild(shown);
  }

  const backToTop = () => {
    if (win.scrollX || win.scrollY || vv.offsetTop) win.scrollTo(0, 0);
  };
  const typing = () => isTypingBox(doc.activeElement);
  // (written only when the number changed, so measuring often changes nothing on screen)
  const setVar = (name, px) => {
    const v = `${Math.round(px)}px`;
    if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v);
  };
  const fit = () => {
    // vv.scale: a page pinched bigger also shows less, but that is not the keyboard
    const keyboard = phone.matches && typing() && vv.scale < 1.05 && win.innerHeight - vv.height > KB_MIN;
    if (keyboard) {
      if (el.dataset.kb !== "1") el.dataset.kb = "1";
      setVar("--vv-top", Math.max(0, vv.offsetTop));
      setVar("--vv-h", vv.height);
      settling = false;
    } else {
      if (el.dataset.kb) delete el.dataset.kb;
      // the keyboard has gone: back to the top — and again while it slides away (an iPhone can slide the page back
      // after the last event, or not reset it at all: iOS 26). Not on a page pinched bigger: that is the customer's.
      if (wasKeyboard) settling = true;
      if (settling && vv.scale < 1.05) backToTop();
    }
    wasKeyboard = keyboard;
    if (shown) {
      const t = doc.activeElement;
      shown.textContent = `inner ${win.innerHeight} vv ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} y ${Math.round(win.scrollY)} box ${isTypingBox(t) ? t.tagName.toLowerCase() : "-"} kb ${keyboard ? "on" : "off"}`;
    }
  };
  // phones: measure now and on every frame for KB_WATCH_MS (each new change starts the time again); laptops: once
  const watch = () => {
    if (!phone.matches) {
      fit();
      settling = false;
      return;
    }
    until = now() + KB_WATCH_MS;
    if (frame) return;
    const step = () => {
      fit();
      frame = now() < until ? win.requestAnimationFrame(step) : 0;
      if (!frame) settling = false;
    };
    step();
  };
  // a tap on a box that already has the focus opens the keyboard again with no focus event (the Android keyboard
  // closed with its own key; the box focused by the code after the mic or a photo, which on iPhone brings no keyboard)
  const onTap = (e) => {
    if (isTypingBox(e.target)) watch();
  };
  // a box lost the focus (the keyboard is closing): the room goes back to full height and the page to the top,
  // also when the phone sends no event after the keyboard has gone (iOS 26)
  const onFocusOut = () => {
    win.clearTimeout(blurTimer);
    blurTimer = win.setTimeout(() => {
      blurTimer = 0;
      if (!typing()) {
        backToTop();
        watch();
      }
    }, 120);
  };

  fit();
  backToTop();
  vv.addEventListener("resize", watch);
  vv.addEventListener("scroll", watch);
  doc.addEventListener("focusin", watch);
  doc.addEventListener("input", watch);
  doc.addEventListener("pointerdown", onTap, true);
  doc.addEventListener("focusout", onFocusOut);
  win.addEventListener("orientationchange", backToTop);
  return () => {
    vv.removeEventListener("resize", watch);
    vv.removeEventListener("scroll", watch);
    doc.removeEventListener("focusin", watch);
    doc.removeEventListener("input", watch);
    doc.removeEventListener("pointerdown", onTap, true);
    doc.removeEventListener("focusout", onFocusOut);
    win.removeEventListener("orientationchange", backToTop);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    win.clearTimeout(blurTimer);
    shown?.remove();
    delete el.dataset.kb;
  };
}
