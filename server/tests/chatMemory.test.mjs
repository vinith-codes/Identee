// A long chat's memory note (services/aiChatService.js, 23 Oct 2026): older messages are folded into a short note
// once there are enough of them; a short chat makes no note (no extra request). Runs with the mock AI (no cost).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AI_CHAT_PROVIDER = "mock";
const { chatReply, FOLD_AT, MEMORY_MAX } = await import("../services/aiChatService.js");

const areas = [{ key: "centre-front", label: "Centre front", free: true }];
const said = (n) => Array.from({ length: n }, (_, i) => ({ who: i % 2 ? "assistant" : "customer", text: `message ${i}` }));

test("a short chat makes no note", async () => {
  const r = await chatReply({ message: "hello", history: said(6), earlier: said(FOLD_AT - 1), areas, styles: [] });
  assert.equal(r.memory, undefined);
  assert.ok(r.reply);
});

test("enough older messages are folded into the note, the old note kept in it", async () => {
  const r = await chatReply({ message: "hello", history: said(14), earlier: said(FOLD_AT), memory: "Wants a black tee for Arun's birthday.", areas, styles: [] });
  assert.match(r.memory, /Arun's birthday/);
  assert.match(r.memory, /message 0/);
  assert.ok(r.memory.length <= MEMORY_MAX);
});
