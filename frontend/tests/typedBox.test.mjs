// The words typed in the Assistant's box but not sent (13 Nov 2026, studio/assistantExtras.js): kept per garment room
// for the chat they were typed in, so a reload or an accidental exit doesn't lose them.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const box = new Map();
globalThis.localStorage = {
  getItem: (k) => (box.has(k) ? box.get(k) : null),
  setItem: (k, v) => box.set(k, String(v)),
  removeItem: (k) => box.delete(k),
};
const { TYPED_KEY, keepTyped, readTyped } = await import("../src/studio/assistantExtras.js");

beforeEach(() => box.clear());

test("the words come back for the same chat only", () => {
  keepTyped("oversized-tee", "chat1", "make it gold");
  assert.equal(readTyped("oversized-tee", "chat1"), "make it gold");
  assert.equal(readTyped("oversized-tee", "chat2"), "");
  assert.equal(readTyped("polo", "chat1"), "");
});

test("an empty box clears its own chat's words, never another chat's", () => {
  keepTyped("oversized-tee", "chat1", "make it gold");
  keepTyped("oversized-tee", "chat2", ""); // a new, empty chat opened
  assert.equal(readTyped("oversized-tee", "chat1"), "make it gold");
  keepTyped("oversized-tee", "chat1", ""); // sent (or cleared)
  assert.equal(box.has(TYPED_KEY("oversized-tee")), false);
});

test("blocked storage: nothing is kept and nothing breaks", () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  try {
    assert.doesNotThrow(() => keepTyped("oversized-tee", "chat1", "hello"));
    assert.equal(readTyped("oversized-tee", "chat1"), "");
  } finally {
    globalThis.localStorage = saved;
  }
});
