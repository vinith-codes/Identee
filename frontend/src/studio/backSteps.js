// studio/backSteps.js — the phone's / browser's own Back button inside the design room (feedback 8, 13 Nov 2026).
//
// Back used to leave the room at once, from wherever the customer was. Now each step into the room and each panel or
// pop-up that opens puts one step in the browser's history (the same address, marked { drBack: n }), and Back takes
// them away again: the newest pop-up closes first, then a panel, the print area, Review, the design step. Only on the
// first screen, with nothing open, does Back leave the room, as before.
//
// What the browsers allow shaped it:
//  · Back can't be stopped or undone by a page, so the room never fights it: it follows the step the browser is on.
//  · Chrome skips history steps that a page adds without a tap. So a step is only added right after a tap, one per tap.
//    A step that couldn't be added then (two things opened by one tap, a picture that arrived later, the room opening
//    again after a reload) is added at the next tap. Until then, one Back may close two things.
//  · Something closed with its own ✕, Cancel or back arrow takes its step away quietly (history.go), so the next Back
//    press is never a dead one.
//
// The room (DesignRoomPage.jsx) tells this file what is open; pop-ups inside the chat's pieces (the zoomed concept
// sheet, "Change a part") report themselves with useBackLayer().
import { useEffect, useRef, useSyncExternalStore } from "react";

/* ---------- what is open ---------- */
// s: { layers, worn, cartNote, placePic, finder, saveOpen, step, pickOpen, areasSheet, assist, chatsOpen, active }
//   layers: pop-ups inside the chat's pieces open now · worn: the "Photo of it worn" shown · areasSheet: the phone's
//   "Where to print" sheet (on a laptop that column is always on screen) · the rest as in the room.

// How many Back presses lead to the first screen with nothing open.
export function backDepth(s) {
  let n = (s.layers || 0) + [s.step === "review" && s.worn, s.cartNote, s.placePic, s.finder, s.saveOpen].filter(Boolean).length;
  if (s.step !== "design" && s.step !== "review") return n; // the first screen (colour and size)
  n += s.step === "review" ? 2 : 1;
  // the design step's panels: they come back with "Edit design", so they still count in Review
  if (s.pickOpen) n += 1;
  if (s.areasSheet) n += 1;
  if (s.assist) n += s.chatsOpen ? 2 : 1;
  if (s.active) n += 1;
  return n;
}

// The one thing a Back press closes now, the newest first. null: nothing is open.
export function nextToClose(s) {
  if (s.layers > 0) return "layer";
  if (s.step === "review" && s.worn) return "worn";
  if (s.cartNote) return "cartNote";
  if (s.placePic) return "placePic";
  if (s.finder) return "finder";
  if (s.saveOpen) return "saveOpen";
  if (s.step === "review") return "review";
  if (s.step !== "design") return null;
  if (s.pickOpen) return "pickOpen";
  if (s.assist && s.chatsOpen) return "chatsOpen";
  if (s.areasSheet) return "areasSheet";
  if (s.assist) return "assist";
  if (s.active) return "active";
  return "design";
}

/* ---------- the steps in the browser's history ---------- */
// start: the step mark of the history entry the room opened on (0 = the room's own entry).
// The room hands over its newest view after every redraw with use(io):
//   depth()    what is open now (backDepth)          closeOne()  closes the newest thing (nextToClose)
//   push(n)    adds step n at the same address        go(by)      moves back by steps (by < 0)
//   here()     the browser is still on the room's address (not on the page a link has just opened)
//   canPush()  a tap is still fresh enough for Chrome
//   waiting()  the room is still putting things back (a save, a design opening by its address, Review after a
//              reload): the steps it will need are kept until then
export function backStepper(start = 0) {
  let io = { depth: () => 0, closeOne: () => {}, push: () => {}, go: () => {}, here: () => false, canPush: () => false, waiting: () => false };
  let steps = Math.max(0, Number(start) || 0); // the room's step the browser is on now
  let drops = 0; // steps the room is taking away itself: their popstate is not a Back press
  let closing = 0; // more to close after a Back press that went back past several steps
  let tapped = false; // a tap since the room last moved in the history (Chrome: one new step per tap)

  // After every change (and after each tap): one step for each thing open.
  const settle = () => {
    const want = io.depth();
    if (closing > 0) {
      closing -= 1;
      if (want > steps) return io.closeOne(); // (the redraw before this one closed the previous thing)
      closing = 0;
    }
    if (want < steps) {
      // closed with its own button: its steps go quietly
      if (io.waiting() || !io.here()) return;
      drops += 1;
      tapped = false;
      const by = want - steps;
      steps = want;
      io.go(by);
    } else if (want > steps && tapped && io.here() && io.canPush()) {
      tapped = false;
      steps += 1;
      io.push(steps);
    }
  };

  // The browser moved to another step (Back, Forward, or one the room took away itself). mark: that step's mark.
  const popped = (mark) => {
    if (!io.here()) return; // (onto another page: the room is closing)
    const at = Math.max(0, Number(mark) || 0);
    const was = steps;
    steps = at;
    tapped = false;
    closing = 0;
    if (drops > 0) {
      drops -= 1;
      return;
    }
    const want = io.depth();
    if (at < was) {
      // Back: one thing closes for each step gone back. Back on the room's own entry shows the first screen with
      // nothing open (a step still owed closes there too), so the next Back leaves from the colour and size card.
      const shut = at === 0 ? want : Math.min(want, was) - at;
      if (shut > 0) {
        closing = shut - 1;
        io.closeOne();
      }
      return;
    }
    if (at > want) {
      // Forward onto a step with nothing left to show: straight back to where the room is
      drops += 1;
      steps = want;
      io.go(want - at);
    }
  };

  return {
    use: (next) => {
      io = { ...io, ...next };
    },
    settle,
    popped,
    // a tap or a key press on the page (before its own buttons act)
    tapped: () => {
      tapped = true;
      closing = 0;
    },
    steps: () => steps,
  };
}

/* ---------- pop-ups inside the chat's pieces ---------- */
// They live in child components the room can't see into. Each says it is open with useBackLayer(open, close); the
// room counts them (useBackLayers) and closes the newest one on Back (closeBackLayer).
const layers = []; // the close functions of the pop-ups open now, newest last
const watchers = new Set();
const tell = () => watchers.forEach((w) => w());
const watchLayers = (w) => {
  watchers.add(w);
  return () => watchers.delete(w);
};
export const layerCount = () => layers.length;

// -> a function that takes it off the list again
export function openLayer(close) {
  const me = () => close();
  layers.push(me);
  tell();
  return () => {
    const i = layers.indexOf(me);
    if (i < 0) return;
    layers.splice(i, 1);
    tell();
  };
}

// Closes the newest one; false when none is open. It is counted as closed first, so the room never sees it still
// open in the same redraw as the pop-up itself closing.
export function closeBackLayer() {
  const newest = layers.pop();
  if (!newest) return false;
  tell();
  newest();
  return true;
}

// A pop-up of a chat piece: while `isOpen`, Back closes it with `close` (the same as its ✕).
export function useBackLayer(isOpen, close) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => (isOpen ? openLayer(() => closeRef.current?.()) : undefined), [isOpen]);
}

// how many are open now (the room draws again when this changes)
export const useBackLayers = () => useSyncExternalStore(watchLayers, layerCount, layerCount);
