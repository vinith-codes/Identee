// The Assistant's saved chats (studio/chatStore.js, 23 Oct 2026): what a chat is called, which chats are kept, what
// the smart Assistant reads of a long chat, and a visitor's chats in this browser. Nothing reaches the server here
// (no one is logged in).
import { test } from "node:test";
import assert from "node:assert/strict";

const box = new Map();
globalThis.localStorage = {
  getItem: (k) => (box.has(k) ? box.get(k) : null),
  setItem: (k, v) => box.set(k, String(v)),
  removeItem: (k) => box.delete(k),
};
const { CHATS_KEPT, RECENT, chatTitle, historyFor, listChats, loadChat, removeChat, saveChat, worthKeeping } = await import("../src/studio/chatStore.js");

const me = (text) => ({ from: "me", text });
const bot = (text) => ({ from: "bot", text });
const rec = (id, at, text = `Chat ${id}`) => ({ id, type: "oversized-tee", title: text, colour: "black", designId: null, updatedAt: at, body: { chat: [me(text)], design: { elements: [] } } });

test("a chat is called after the customer's first message", () => {
  assert.equal(chatTitle([bot("Hi! What shall we make?"), { chips: ["More help"] }, me("A funky tee for my college fest"), me("make it red")]), "A funky tee for my college fest");
  assert.equal(chatTitle([bot("Hi")], "Oversized Tee design"), "Oversized Tee design");
  assert.equal(chatTitle([me("Draw: Retro sunset")]), "Retro sunset");
  assert.ok(chatTitle([me("x".repeat(200))]).length <= 60);
});

test("an untouched chat isn't kept", () => {
  assert.equal(worthKeeping({ chat: [bot("Hi")], design: { elements: [] } }), false);
  assert.equal(worthKeeping({ chat: [bot("Hi"), me("hello")], design: { elements: [] } }), true);
  assert.equal(worthKeeping({ chat: [bot("Hi")], design: { elements: [{ id: "a", type: "text" }] } }), true);
});

test("a short chat is sent as it is", () => {
  const chat = [bot("Hi"), { chips: ["More help"] }, me("hello"), bot("Hello!")];
  const r = historyFor(chat);
  assert.deepEqual(r.history.map((h) => h.text), ["Hi", "hello", "Hello!"]);
  assert.deepEqual(r.earlier, []);
});

test("a long chat: the latest messages, plus the older ones not in the note yet", () => {
  const chat = Array.from({ length: 30 }, (_, i) => (i % 2 ? bot(`a${i}`) : me(`c${i}`)));
  const r = historyFor(chat);
  assert.equal(r.history.length, RECENT);
  assert.equal(r.history.at(-1).text, "a29");
  assert.equal(r.earlier.length, 30 - RECENT);
  assert.equal(r.fold[0], chat[0]);
  // once noted (marked folded) they aren't sent again
  const noted = chat.map((m, i) => (i < 10 ? { ...m, folded: true } : m));
  assert.deepEqual(historyFor(noted).earlier.map((h) => h.text), ["c10", "a11", "c12", "a13", "c14", "a15"]);
});

test("a visitor's chats stay in this browser, newest first, at most 20", async () => {
  box.clear();
  for (let i = 0; i < CHATS_KEPT + 3; i++) await saveChat(rec(`chat${i}aa`, 1000 + i));
  const { chats, error } = await listChats();
  assert.equal(error, "");
  assert.equal(chats.length, CHATS_KEPT);
  assert.equal(chats[0].id, `chat${CHATS_KEPT + 2}aa`);
  assert.equal((await loadChat("chat22aa")).body.chat[0].text, "Chat chat22aa");
  await removeChat("chat22aa");
  assert.equal(await loadChat("chat22aa"), null);
});

test("saving again updates the chat instead of adding one; untouched chats aren't saved", async () => {
  box.clear();
  await saveChat(rec("samechat1", 1, "first"));
  await saveChat(rec("samechat1", 2, "second"));
  await saveChat({ ...rec("emptychat", 3), body: { chat: [bot("Hi")], design: { elements: [] } } });
  const { chats } = await listChats();
  assert.deepEqual(chats.map((c) => [c.id, c.title]), [["samechat1", "second"]]);
});
