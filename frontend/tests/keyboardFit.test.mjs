// The phone's keyboard and the Assistant's question box (feedback 4, 13 Nov 2026 — studio/keyboardFit.js).
// No phone here: a small stand-in plays the browser — the visible part of the screen (visualViewport), the page's
// focus, frames and timers on a clock this test moves. The iPhone's habit is played too: the keyboard's height and
// the page's slide arrive late and in steps, sometimes with no event at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KB_WATCH_MS, fitRoomToKeyboard, isTypingBox } from "../src/studio/keyboardFit.js";

const KEYBOARD = 336; // an iPhone keyboard with its suggestion bar

function listeners() {
  let list = [];
  return {
    addEventListener(type, fn, capture) {
      list.push({ type, fn, capture: !!capture });
    },
    removeEventListener(type, fn, capture) {
      list = list.filter((l) => !(l.type === type && l.fn === fn && l.capture === !!capture));
    },
    fire(type, e = {}) {
      for (const l of [...list]) if (l.type === type) l.fn(e);
    },
    count: () => list.length,
  };
}

// a phone (or a laptop: width > 760) with the room open
function device({ width = 375, height = 812, readout = false } = {}) {
  let clock = 0;
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  const vv = { width, height, offsetTop: 0, scale: 1, ...listeners() };
  const win = {
    innerWidth: width,
    innerHeight: height,
    scrollX: 0,
    scrollY: 0,
    scrolls: 0,
    visualViewport: vv,
    matchMedia: () => ({ get matches() { return win.innerWidth <= 760; } }),
    performance: { now: () => clock },
    requestAnimationFrame: (fn) => {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    // the page goes back to the top: the slide the browser made goes too
    scrollTo: () => {
      win.scrollX = 0;
      win.scrollY = 0;
      vv.offsetTop = 0;
      win.scrolls++;
    },
    ...listeners(),
  };
  const added = [];
  const body = {
    tagName: "BODY",
    appendChild: (n) => added.push(n),
  };
  const doc = {
    body,
    activeElement: body,
    createElement: (tag) => {
      const n = { tagName: tag.toUpperCase(), style: {}, textContent: "", remove: () => added.splice(added.indexOf(n), 1) };
      return n;
    },
    ...listeners(),
  };
  const styles = new Map();
  const room = {
    dataset: {},
    writes: 0,
    style: {
      getPropertyValue: (n) => styles.get(n) || "",
      setProperty: (n, v) => {
        styles.set(n, v);
        room.writes++;
      },
    },
  };
  const stop = fitRoomToKeyboard(room, { win, doc, readout });
  const box = { tagName: "TEXTAREA" };
  const phone = {
    win,
    vv,
    doc,
    room,
    box,
    stop,
    added,
    frames,
    timers,
    fitted: () => room.dataset.kb === "1",
    top: () => styles.get("--vv-top"),
    tall: () => styles.get("--vv-h"),
    // the clock moves on: timers ring, one frame every 16 ms
    wait(ms) {
      const end = clock + ms;
      while (clock < end) {
        clock += 16;
        for (const [id, t] of [...timers]) {
          if (t.at <= clock) {
            timers.delete(id);
            t.fn();
          }
        }
        const due = [...frames.values()];
        frames.clear();
        due.forEach((fn) => fn());
      }
    },
    tap(target = box) {
      doc.fire("pointerdown", { target });
    },
    focus(target = box) {
      doc.activeElement = target;
      doc.fire("focusin", { target });
    },
    blur() {
      doc.activeElement = body;
      doc.fire("focusout", {});
    },
    // the keyboard's numbers change (up: its height; the page slides up as far, the box being at the bottom);
    // event: whether the phone says so
    keyboard(up, { slide = up, event = true } = {}) {
      vv.height = up ? height - up : height;
      vv.offsetTop = slide;
      if (event) vv.fire("resize");
    },
  };
  return phone;
}

test("the box is fitted above the keyboard every time it is tapped, not only the first", () => {
  const p = device();
  const keyboards = [KEYBOARD, 300, KEYBOARD, 291]; // the suggestion bar shows or not
  for (const k of keyboards) {
    p.tap();
    p.focus();
    p.wait(48);
    assert.equal(p.fitted(), false, "no keyboard yet: the room stays as it is");
    // the iPhone: half-way numbers with an event, then the real ones late and with NO event
    p.keyboard(120 + 10, { slide: 40 });
    p.wait(160);
    p.keyboard(k, { event: false });
    p.wait(400);
    assert.equal(p.fitted(), true);
    assert.equal(p.tall(), `${812 - k}px`, "the room is as tall as the strip above the keyboard");
    assert.equal(p.top(), `${k}px`, "and starts where the page slid to");
    // Send tapped: the box loses the focus and the keyboard goes
    p.blur();
    p.keyboard(0);
    p.wait(300);
    assert.equal(p.fitted(), false, "full height again");
    assert.equal(p.win.scrollY + p.vv.offsetTop, 0, "the page is back at the top");
  }
});

test("a late slide with no event after it is still followed (the first keyboard of a visit)", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD, { slide: 0 }); // WebKit: the slide reads 0 at first
  p.wait(100);
  assert.equal(p.top(), "0px");
  p.vv.offsetTop = KEYBOARD; // the real slide, with no event
  p.wait(600);
  assert.equal(p.top(), `${KEYBOARD}px`);
  assert.equal(p.tall(), `${812 - KEYBOARD}px`);
});

test("the measuring stops a while after the last change, and a key or a tap starts it again", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(KB_WATCH_MS + 100);
  assert.equal(p.frames.size, 0, "no frame loop left running");
  p.keyboard(260, { event: false }); // a keyboard that loaded late (Gboard), no event
  p.wait(100);
  assert.equal(p.tall(), `${812 - KEYBOARD}px`, "not seen yet: nothing is measuring");
  p.doc.fire("input", { target: p.box }); // the customer types a letter
  p.wait(50);
  assert.equal(p.tall(), `${812 - 260}px`);
});

test("a tap on a box that already has the focus (no focus event) is fitted too", () => {
  const p = device();
  // the code focused the box (after the mic or a photo): on an iPhone that brings no keyboard
  p.doc.activeElement = p.box;
  p.wait(KB_WATCH_MS + 100);
  assert.equal(p.fitted(), false);
  p.tap(); // the customer taps it: the keyboard comes, and the phone sends no event for it
  p.wait(50);
  p.keyboard(KEYBOARD, { event: false });
  p.wait(200);
  assert.equal(p.fitted(), true);
  assert.equal(p.tall(), `${812 - KEYBOARD}px`);
});

test("with no box in focus the room is never squeezed, and the page goes back to the top (iOS 26)", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(100);
  assert.equal(p.fitted(), true);
  // the keyboard closes but the phone leaves the numbers as they were, with no event
  p.blur();
  p.wait(200);
  assert.equal(p.fitted(), false);
  assert.equal(p.vv.offsetTop, 0);
  // the visible part stays small and an event comes: still not the keyboard, nobody is typing
  p.vv.height = 812 - KEYBOARD;
  p.vv.fire("resize");
  p.wait(50);
  assert.equal(p.fitted(), false);
});

test("the page is held at the top while the keyboard slides away", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(100);
  p.blur();
  p.keyboard(0);
  p.wait(300);
  // the phone slides the page back a little after its last event
  p.win.scrollY = 120;
  p.wait(100);
  assert.equal(p.win.scrollY, 0);
  // but once the measuring has stopped, a page the customer moved is left alone
  p.wait(KB_WATCH_MS);
  p.win.scrollY = 40;
  p.wait(100);
  assert.equal(p.win.scrollY, 40);
});

test("laptops: never fitted, one look per event and no frame loop", () => {
  const p = device({ width: 1280, height: 800 });
  p.focus();
  p.vv.height = 400; // (a laptop with a touch keyboard, or a short window)
  for (let i = 0; i < 20; i++) p.doc.fire("input", { target: p.box });
  p.vv.fire("resize");
  assert.equal(p.frames.size, 0);
  p.wait(50);
  assert.equal(p.fitted(), false);
});

test("a page pinched bigger is not the keyboard", () => {
  const p = device();
  p.focus();
  p.vv.scale = 2;
  p.vv.height = 406;
  p.vv.offsetTop = 200;
  p.vv.fire("resize");
  p.wait(100);
  assert.equal(p.fitted(), false);
  assert.equal(p.vv.offsetTop, 200, "the customer's pinch is left alone");
});

test("the numbers are written only when they change", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(50);
  const writes = p.room.writes;
  p.wait(KB_WATCH_MS); // ~125 frames with the same numbers
  assert.equal(p.room.writes, writes);
});

test("boxes to type in: text, words, lists; not ticks, buttons or files", () => {
  assert.equal(isTypingBox({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingBox({ tagName: "SELECT" }), true, "a list's picker also shrinks the visible part");
  assert.equal(isTypingBox({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isTypingBox({ tagName: "INPUT", type: "number" }), true);
  assert.equal(isTypingBox({ tagName: "INPUT", type: "search" }), true);
  assert.equal(isTypingBox({ tagName: "DIV", isContentEditable: true }), true);
  for (const type of ["checkbox", "radio", "range", "color", "file", "button", "submit", "hidden"]) {
    assert.equal(isTypingBox({ tagName: "INPUT", type }), false, type);
  }
  assert.equal(isTypingBox({ tagName: "BUTTON" }), false);
  assert.equal(isTypingBox(null), false);
});

test("leaving the room stops everything", () => {
  const p = device();
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(50);
  p.blur(); // a blur timer waits
  assert.ok(p.frames.size > 0 && p.timers.size > 0);
  p.stop();
  assert.equal(p.frames.size, 0);
  assert.equal(p.timers.size, 0);
  assert.equal(p.fitted(), false);
  assert.equal(p.doc.count() + p.vv.count() + p.win.count(), 0, "no listener left");
});

test("the numbers line shows only when asked (testing on a real phone)", () => {
  const quiet = device();
  assert.equal(quiet.added.length, 0);
  const p = device({ readout: true });
  assert.equal(p.added.length, 1);
  p.focus();
  p.keyboard(KEYBOARD);
  p.wait(50);
  assert.match(p.added[0].textContent, /vv 476 top 336 .* box textarea kb on/);
  p.stop();
  assert.equal(p.added.length, 0);
});

test("the keyboard rules are in the phone styles: the box and the newest messages get the room", () => {
  const css = readFileSync(new URL("../src/studio/designRoom.css", import.meta.url), "utf8");
  assert.match(css, /\.dr-app\[data-kb\] \{ top: var\(--vv-top, 0px\); bottom: auto; height: var\(--vv-h, 100%\); \}/);
  assert.match(css, /\.dr-app\[data-kb\] \.dr-assist :is\(\.dr-handoff, \.dr-leftline, \.dr-busynote\) \{ display: none; \}/);
});
