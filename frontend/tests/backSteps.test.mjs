// The phone's / browser's Back button inside the design room (feedback 8, 13 Nov 2026 — studio/backSteps.js).
// No browser here: a small stand-in for the tab's history plays the part, with Chrome's rule that a step added
// without a fresh tap is skipped by Back (the strict form: one tap honours one new step). The room is a plain object
// of what is open; each change "redraws" it, which settles the steps, as the room's effect does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backDepth, backStepper, closeBackLayer, layerCount, nextToClose, openLayer } from "../src/studio/backSteps.js";

const FIRST = { layers: 0, worn: false, cartNote: false, placePic: false, finder: false, saveOpen: false, step: "fit", pickOpen: false, areasSheet: false, assist: false, chatsOpen: false, active: false };

// what the room does for each nextToClose answer (DesignRoomPage.jsx, backOne)
const closeIn = (s, what) => {
  if (what === "layer") return { ...s, layers: s.layers - 1 };
  if (what === "review") return { ...s, step: "design" };
  if (what === "design") return { ...s, step: "fit", assist: false, areasSheet: false, pickOpen: false, active: false }; // stepBack
  return { ...s, [what]: false };
};

/* ---------- what is open, and what Back closes ---------- */

test("each Back closes one thing, the newest first, down to the first screen", () => {
  let s = { ...FIRST, step: "review", assist: true, chatsOpen: true, active: false, finder: true, worn: true, layers: 1 };
  const closed = [];
  for (let d = backDepth(s); d > 0; d--) {
    const what = nextToClose(s);
    closed.push(what);
    s = closeIn(s, what);
    assert.equal(backDepth(s), d - 1, `closing ${what}`);
  }
  assert.deepEqual(closed, ["layer", "worn", "finder", "review", "chatsOpen", "assist", "design"]);
  assert.equal(nextToClose(s), null);
  assert.equal(s.step, "fit");
});

test("every mix of open things: one Back always closes exactly one", () => {
  const steps = ["fit", "design", "review"];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) {
    let s = { ...FIRST, step: steps[Math.floor(rnd() * 3)], layers: Math.floor(rnd() * 3) };
    for (const k of ["worn", "cartNote", "placePic", "finder", "saveOpen", "pickOpen", "areasSheet", "assist", "chatsOpen", "active"]) s[k] = rnd() < 0.35;
    for (let d = backDepth(s); d > 0; d--) {
      s = closeIn(s, nextToClose(s));
      assert.equal(backDepth(s), d - 1, JSON.stringify(s));
    }
    assert.equal(nextToClose(s), null, JSON.stringify(s));
  }
});

test("the first screen counts only what lies over it; the design panels still count in Review", () => {
  assert.equal(backDepth({ ...FIRST, assist: true, pickOpen: true }), 0); // (left over from before, not on screen)
  assert.equal(backDepth({ ...FIRST, finder: true }), 1); // Find my size from the colour and size card
  assert.equal(backDepth({ ...FIRST, step: "design" }), 1);
  assert.equal(backDepth({ ...FIRST, step: "review" }), 2);
  assert.equal(backDepth({ ...FIRST, step: "review", assist: true }), 3); // "← Edit design" brings the Assistant back
  assert.equal(backDepth({ ...FIRST, step: "design", worn: true }), 1); // the worn photo only shows in Review
  assert.equal(backDepth({ ...FIRST, step: "design", chatsOpen: true }), 1); // Chats only shows inside the Assistant
});

/* ---------- the steps in a stand-in browser ---------- */

// One tab: the page before the room, then the room's own entry. Chrome's rule: a step pushed without an honoured tap
// marks the entry it leaves as skipped by Back; one tap honours one step.
function makeTab(room = { ...FIRST }, { start = 0, startEntries = null } = {}) {
  const tab = {
    entries: startEntries || [{ path: "/customizable", mark: 0 }, { path: "/customize/oversized", mark: start }],
    at: 0,
    queue: [], // history.go calls not done yet (they are async in a browser)
    honour: false,
    active: false, // a tap within the last few seconds (navigator.userActivation.isActive)
    room,
    dirty: false,
    busy: false,
  };
  tab.at = tab.entries.length - 1;
  const here = () => tab.entries[tab.at].path === "/customize/oversized";
  const back = backStepper(start);
  tab.back = back;
  back.use({
    depth: () => backDepth(tab.room),
    closeOne: () => change(nextToClose(tab.room) && closeIn(tab.room, nextToClose(tab.room))),
    push: (n) => {
      const left = tab.entries[tab.at];
      if (!tab.honour) left.skip = true;
      tab.honour = false;
      tab.entries = [...tab.entries.slice(0, tab.at + 1), { path: left.path, mark: n }];
      tab.at += 1;
    },
    go: (by) => tab.queue.push(by),
    here,
    canPush: () => tab.active,
    waiting: () => tab.busy,
  });
  const change = (next) => {
    if (!next) return;
    tab.room = next;
    tab.dirty = true;
  };
  // the browser and React take turns: a redraw (settle) first, then the next history move
  const run = () => {
    for (let guard = 0; guard < 100; guard++) {
      if (tab.dirty) {
        tab.dirty = false;
        back.settle();
      } else if (tab.queue.length) {
        const by = tab.queue.shift();
        tab.honour = false;
        tab.at = Math.max(0, Math.min(tab.entries.length - 1, tab.at + by));
        if (here()) back.popped(tab.entries[tab.at].mark);
      } else return;
    }
    throw new Error("the steps never settled");
  };
  tab.change = (patch) => {
    change({ ...tab.room, ...patch });
    run();
  };
  // a tap on the page that changes the room (or nothing): pointerup, the button, then the click reaches the window
  tab.tap = (patch = null) => {
    tab.active = true;
    tab.honour = true;
    back.tapped();
    if (patch) change({ ...tab.room, ...patch });
    run();
    back.settle();
    run();
  };
  tab.wait = () => {
    tab.active = false; // the tap is too old for Chrome now
  };
  // the browser's own Back / Forward (Back skips the entries Chrome marked)
  tab.pressBack = () => {
    let i = tab.at - 1;
    while (i > 0 && tab.entries[i].skip) i -= 1;
    tab.queue.push(i - tab.at);
    run();
  };
  tab.pressForward = () => {
    tab.queue.push(1);
    run();
  };
  tab.inRoom = () => here();
  tab.check = () => {
    if (here()) assert.equal(back.steps(), tab.entries[tab.at].mark, "the room's count is the step the browser is on");
  };
  return tab;
}

test("Design with the Assistant, then Back: assistant → the colour and size card → out", () => {
  const tab = makeTab();
  tab.tap({ step: "design", assist: true }); // one tap opened two things: one step now…
  tab.tap(); // …and the other at the next tap (typing, a chip, anything)
  assert.equal(tab.back.steps(), 2);
  assert.ok(!tab.entries.some((e) => e.skip), "no step is skipped by Chrome");
  tab.pressBack();
  assert.deepEqual([tab.room.step, tab.room.assist], ["design", false]);
  tab.check();
  tab.pressBack();
  assert.equal(tab.room.step, "fit");
  tab.check();
  tab.pressBack();
  assert.equal(tab.inRoom(), false, "only the first screen with nothing open lets Back leave");
});

test("Back straight after one tap that opened two things closes both: the card, never out of the room", () => {
  const tab = makeTab();
  tab.tap({ step: "design", assist: true });
  tab.wait();
  tab.pressBack();
  assert.deepEqual([tab.room.step, tab.room.assist, tab.inRoom()], ["fit", false, true]);
  tab.check();
  tab.pressBack();
  assert.equal(tab.inRoom(), false);
});

test("panels inside the Assistant close one at a time", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ assist: true });
  tab.tap({ chatsOpen: true });
  tab.tap({ layers: 1 }); // a concept sheet zoomed
  tab.pressBack();
  assert.equal(tab.room.layers, 0);
  tab.pressBack();
  assert.deepEqual([tab.room.chatsOpen, tab.room.assist], [false, true]);
  tab.pressBack();
  assert.equal(tab.room.assist, false);
  tab.pressBack();
  assert.equal(tab.room.step, "fit");
  tab.check();
  assert.ok(!tab.entries.some((e) => e.skip));
});

test("closed with its own ✕: its step goes quietly, so the next Back is never a dead press", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ assist: true });
  tab.tap({ assist: false }); // ✕
  assert.equal(tab.back.steps(), 1);
  tab.check();
  tab.pressBack();
  assert.equal(tab.room.step, "fit", "one press: the card");
  tab.tap({ step: "design", active: true }); // a print area straight away (two things, one tap)
  tab.tap({ step: "fit", active: false }); // the top-left arrow: back to the card, both steps go
  tab.check();
  assert.equal(tab.back.steps(), 0);
  tab.pressBack();
  assert.equal(tab.inRoom(), false);
});

test("Review: Find my size closes first, then Review, and the Assistant is there again in Design", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ assist: true });
  tab.tap({ step: "review" });
  tab.tap({ finder: true });
  tab.pressBack();
  assert.deepEqual([tab.room.finder, tab.room.step], [false, "review"]);
  tab.pressBack();
  assert.deepEqual([tab.room.step, tab.room.assist], ["design", true]);
  tab.check();
});

test("a pop-up that arrives later (the worn photo): Back closes just it; the card still comes before leaving", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ step: "review" });
  tab.tap(); // "Photo of it worn"…
  tab.wait(); // …about 30 s later:
  tab.change({ worn: true });
  assert.equal(tab.back.steps(), 2, "no tap to add its step");
  tab.pressBack();
  assert.deepEqual([tab.room.worn, tab.room.step], [false, "review"], "Back closes the photo and stays in Review");
  tab.pressBack();
  assert.equal(tab.room.step, "fit", "Review and Design close on the room's own entry");
  tab.check();
  tab.pressBack();
  assert.equal(tab.inRoom(), false);
});

test("a step still owed is added at the next tap, one per tap", () => {
  const tab = makeTab({ ...FIRST, step: "design", assist: true, active: true }); // a reload: no tap yet
  tab.change({});
  assert.equal(tab.back.steps(), 0);
  tab.tap();
  tab.tap();
  tab.tap();
  assert.equal(tab.back.steps(), 3);
  assert.ok(!tab.entries.some((e) => e.skip));
  tab.pressBack();
  assert.deepEqual([tab.room.assist, tab.room.active], [false, true]);
});

test("Forward after Back opens nothing again", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ assist: true });
  tab.pressBack();
  tab.pressForward();
  assert.equal(tab.room.assist, false);
  tab.check();
  assert.equal(tab.back.steps(), 1);
});

test("Back that skips several steps (the browser's history list) closes as many things", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.tap({ assist: true });
  tab.tap({ chatsOpen: true });
  tab.queue.push(-2);
  tab.change({});
  assert.deepEqual([tab.room.step, tab.room.assist, tab.room.chatsOpen], ["design", false, false]);
  tab.check();
});

test("a room opened again on one of its own steps keeps them; one with less open lets the extra steps go", () => {
  const entries = () => [
    { path: "/customizable", mark: 0 },
    { path: "/customize/oversized", mark: 0 },
    { path: "/customize/oversized", mark: 1 },
    { path: "/customize/oversized", mark: 2 },
  ];
  const same = makeTab({ ...FIRST, step: "review" }, { start: 2, startEntries: entries() }); // Back from Buy now
  same.change({});
  assert.equal(same.back.steps(), 2);
  same.pressBack();
  assert.equal(same.room.step, "design");

  const less = makeTab({ ...FIRST, step: "design" }, { start: 2, startEntries: entries() });
  less.busy = true; // Review still being put back after the design opens: the step is kept for it
  less.change({});
  assert.equal(less.back.steps(), 2);
  less.busy = false;
  less.change({});
  assert.equal(less.back.steps(), 1);
  less.check();
});

test("a link that opened another page: the room adds and takes away nothing", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.entries.push({ path: "/cart", mark: 0 });
  tab.at += 1;
  tab.tap({ assist: true });
  tab.change({ assist: false });
  assert.equal(tab.entries.length, 4);
  assert.equal(tab.queue.length, 0);
});

test("without a fresh tap nothing is added (Chrome would skip it)", () => {
  const tab = makeTab();
  tab.tap({ step: "design" });
  tab.wait();
  tab.change({ assist: true }); // opened by the chat a while later
  assert.equal(tab.back.steps(), 1);
  assert.ok(!tab.entries.some((e) => e.skip));
});

/* ---------- pop-ups inside the chat's pieces ---------- */

test("chat pop-ups: Back closes the newest, counted closed before it closes", () => {
  const closed = [];
  let countWhenClosed = null;
  const offA = openLayer(() => closed.push("zoom"));
  const offB = openLayer(() => {
    countWhenClosed = layerCount();
    closed.push("change a part");
  });
  assert.equal(layerCount(), 2);
  assert.equal(closeBackLayer(), true);
  assert.deepEqual([closed, countWhenClosed], [["change a part"], 1]);
  offB(); // (its own clean-up afterwards changes nothing)
  assert.equal(layerCount(), 1);
  offA(); // closed with its ✕
  assert.equal(layerCount(), 0);
  assert.equal(closeBackLayer(), false);
});
