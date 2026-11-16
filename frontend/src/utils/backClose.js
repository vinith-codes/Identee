// utils/backClose.js — the browser's Back button closes the pop-up window that is open, instead of leaving the page
// (16 Nov 2026, the owner: Back on an order's "Designs & print files" window went to the Home page).
//
// useBackClose(open, onClose): while `open` is true the window has its own step in the browser's history (same
// address). Back removes that step → onClose() runs and the page under it stays as it was. Closing the window any
// other way (×, Cancel, Done) takes the step out again, so no empty Back press is left behind.
// onClose may return false to stay open (a window that is busy): Back then does nothing.
// Windows inside windows: each has its own step, and Back closes the top one first.
// A page opened from inside a window (a link in it, a menu item on a phone) takes the place of the window's step,
// so Back from that page goes to the page that was under the window — no empty Back press in between.
import { useEffect, useRef } from "react";

const MARK = "__popupDepth"; // how many windows were open on this history step (kept beside React Router's own state)
const open = []; // the open windows, oldest first: { close }
let syncQueued = false;
let installed = false;
let realPush = null;

const depthOf = (state) => (state && Number.isInteger(state[MARK]) ? state[MARK] : 0);

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", onPop);
  const h = window.history;
  realPush = h.pushState.bind(h);
  const realReplace = h.replaceState.bind(h);
  // a new page while a window's step is showing: it replaces that step (see above)
  // (a window that stays open after that — a phone menu section with sub-pages — gets a new step on the new page)
  h.pushState = (state, title, url) => {
    if (depthOf(h.state) === 0) return realPush(state, title, url);
    realReplace(state, title, url);
    if (open.length) queueSync();
  };
  // the page changing its own address while a window is open (React Router's replace) keeps the window's step
  h.replaceState = (state, title, url) => {
    const d = depthOf(h.state);
    return realReplace(d > 0 && state && typeof state === "object" && !(MARK in state) ? { ...state, [MARK]: d } : state, title, url);
  };
}

// Back (or Forward) moved to another step: close every window above that step's count, top one first.
// A window busy with work may answer false (= stay open, like its Escape key): its step is put back.
function onPop(e) {
  const d = depthOf(e.state);
  while (open.length > d) {
    const w = open.pop();
    let answer;
    try {
      answer = w.close();
    } catch {
      /* a window that fails to close must not stop the others */
    }
    if (answer === false) {
      open.push(w);
      queueSync();
      return;
    }
  }
  // a step whose window is already gone (left behind when a page was opened from a window inside a window):
  // step over it, so Back is never pressed for nothing
  if (d > open.length) window.history.back();
}

// make the history match the open windows — once, after React has finished opening/closing them
// (two changes in one go, e.g. one window closing as the next opens, or React's double run in development,
// then cost one history change, not two that race each other)
function sync() {
  syncQueued = false;
  const have = depthOf(window.history.state);
  const want = open.length;
  if (have > want) window.history.go(want - have);
  else for (let d = have + 1; d <= want; d++) realPush({ ...(window.history.state || {}), [MARK]: d }, "");
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  setTimeout(sync, 0);
}

export function useBackClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose; // the latest close (it may read state that changed since the window opened)
  });
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return undefined;
    install();
    const me = { close: () => closeRef.current?.() };
    open.push(me);
    queueSync();
    return () => {
      const i = open.indexOf(me);
      if (i < 0) return; // closed by Back: its step is already gone
      open.splice(i, 1);
      queueSync();
    };
  }, [isOpen]);
}

// for tests
export const _backCloseState = () => ({ open: open.length, depth: depthOf(window.history.state) });
