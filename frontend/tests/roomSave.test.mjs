// The design room kept whole (feedback 9, 13 Nov 2026 — studio/chatStore.js): what "Start designing" offers back, a
// long chat kept whole but under the server's limit, the chat names, this browser's share of storage, the account's
// answers (409 newer copy, 413 too long, offline), whose chats a browser may show or move, and signing out.
// The server is never reached: chatService is replaced by a stand-in.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// a browser storage with length/key (forgetDesignRoom and makeRoom walk the keys)
const fakeStorage = () => {
  const box = new Map();
  return {
    box,
    get length() {
      return box.size;
    },
    key: (i) => [...box.keys()][i] ?? null,
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
    clear: () => box.clear(),
  };
};
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();

const chatService = (await import("../src/services/chatService.js")).default;
const store = await import("../src/studio/chatStore.js");
const { CHATS_KEY, CHATS_KEPT, PICTURED, SAVE_MAX, chatTitle, forgetDesignRoom, hashText, keptChat, listChats, loadChat, makeRoom, moveLocalChats, saveChat, slimForSaving, unfinishedRoom } = store;

const me = (text) => ({ from: "me", text });
const bot = (text) => ({ from: "bot", text });
const version = (n, thumbSize = 50) => ({ version: { n, label: `Version ${n}`, colour: "black", thumb: `data:image/jpeg;base64,${"A".repeat(thumbSize)}`, elements: [{ id: `e${n}`, type: "text", text: `v${n}` }] } });
const rec = (id, extra = {}) => ({ id, type: "oversized-tee", title: `Chat ${id}`, colour: "black", designId: null, updatedAt: 1000, at: 1000, body: { chat: [me(`hello ${id}`)], design: { elements: [] } }, ...extra });
const local = () => JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
const logIn = (id = "user-1") => localStorage.setItem("userInfo", JSON.stringify({ _id: id, token: "test-token" }));
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const real = { ...chatService };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.assign(chatService, real);
});

/* ---------- "Start designing": what is offered back ---------- */

test("an unfinished tee is offered back; a saved, unchanged one isn't", () => {
  const items = [{ id: "a", type: "text" }];
  assert.equal(unfinishedRoom({ elements: items }, null).elements.length, 1);
  assert.equal(unfinishedRoom({ elements: items, designId: "d1" }, null), null); // safe in My designs
  assert.equal(unfinishedRoom({ elements: items, designId: "d1", dirty: true }, null).elements.length, 1); // changed since
});

test("a chat with nothing on the tee yet is offered back too; an untouched one isn't", () => {
  const talked = unfinishedRoom(null, { chat: [bot("Hi"), me("a tiger for my brother")], colour: "navy", size: "L" });
  assert.deepEqual([talked.elements, talked.talked, talked.colour, talked.size], [[], true, "navy", "L"]);
  assert.equal(unfinishedRoom(null, { chat: [bot("Hi")] }), null);
  assert.equal(unfinishedRoom({ elements: [] }, null), null);
});

/* ---------- a long chat, kept whole ---------- */

test("the room's copy keeps every message; only the newest version cards keep their picture", () => {
  const chat = [];
  for (let n = 1; n <= PICTURED + 10; n++) chat.push(me(`change ${n}`), version(n));
  const kept = keptChat(chat);
  assert.equal(kept.length, chat.length);
  const versions = kept.filter((m) => m.version);
  assert.equal(versions.filter((m) => m.version.thumb).length, PICTURED);
  assert.ok(versions.at(-1).version.thumb && Array.isArray(versions.at(-1).version.elements));
  assert.deepEqual(versions[0].version, { n: 1, label: "Version 1", colour: "black" }); // its number and words stay
  // the newest messages only, when asked
  assert.equal(keptChat(chat, 10).length, 10);
});

test("a photo still being sent when the page closed becomes a line, not a broken picture", () => {
  const kept = keptChat([{ from: "me", text: "use this", photo: { url: "blob:http://x/123" } }, { from: "me", text: "ok", sending: true }]);
  assert.deepEqual(kept[0], { from: "me", text: "use this (photo not sent)" });
  assert.equal("sending" in kept[1], false);
});

test("a very long chat is saved whole, under the limit: old idea cards go first", () => {
  const chat = [];
  for (let i = 0; i < 600; i++) chat.push(i % 2 ? bot(`answer ${i}`) : me(`question ${i}`));
  for (let n = 1; n <= 120; n++) chat.push(version(n, 6000));
  // ten Browse-ideas cards with plenty in them
  const card = (i) => ({ browse: Array.from({ length: 40 }, (_, j) => ({ id: `${i}-${j}`, title: "x".repeat(1900) })) });
  for (let i = 0; i < 10; i++) chat.push(card(i));
  assert.ok(JSON.stringify({ chat: keptChat(chat) }).length > SAVE_MAX);
  const out = slimForSaving({ chat, design: { elements: [] } });
  assert.equal(out.chat.length, chat.length); // no message dropped
  assert.ok(JSON.stringify(out).length <= SAVE_MAX);
  assert.equal(out.tooLong, undefined);
  const browse = out.chat.filter((m) => "browse" in m);
  assert.equal(browse.at(-1).browse.length, 40); // the latest idea card stays as it is
  // only as many as needed, the oldest first
  const trimmed = browse.filter((m) => m.old);
  assert.ok(trimmed.length >= 1 && trimmed.length < browse.length);
  assert.ok(browse.slice(0, trimmed.length).every((m) => m.old && !m.browse.length));
  assert.equal(out.chat.filter((m) => m.version?.thumb).length, PICTURED); // the newest versions keep their pictures
});

test("a chat too long even then is marked, and never sent", async () => {
  const chat = Array.from({ length: 1000 }, (_, i) => me(`${i} ${"words ".repeat(170)}`));
  const out = slimForSaving({ chat });
  assert.equal(out.tooLong, true);
  assert.equal(out.chat.length, 1000);
  logIn();
  let calls = 0;
  chatService.save = async () => {
    calls += 1;
  };
  assert.deepEqual(await saveChat({ ...rec("longchat1"), body: out }), { tooLong: true });
  assert.equal(calls, 0);
});

/* ---------- names, fingerprints ---------- */

test("taps and numbers never name a chat", () => {
  assert.equal(chatTitle([me("Help me start (3 taps)"), me("2"), me("1, 3"), me("Browse ideas"), me("Retro bike for my dad")]), "Retro bike for my dad");
  assert.equal(chatTitle([me("✨ Improve my idea: a tiger in sunglasses")]), "a tiger in sunglasses");
  assert.equal(chatTitle([me("A cat surfing. Show me three concepts in different styles.")]), "A cat surfing.");
});

test("a chat's fingerprint changes with its text", () => {
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
  assert.match(hashText("abc"), /:3$/);
});

/* ---------- this browser's chats ---------- */

test("this browser's chats never take most of its storage: the oldest go", async () => {
  const big = (id, at) => ({ ...rec(id), updatedAt: at, at, body: { chat: [me("x".repeat(400_000))], design: { elements: [] } } });
  for (let i = 0; i < 6; i++) await saveChat(big(`bigchat${i}`, 1000 + i));
  const kept = local();
  assert.ok(localStorage.getItem(CHATS_KEY).length <= 1_500_000);
  assert.ok(kept.length >= 1 && kept.length < 6);
  assert.equal(kept[0].id, "bigchat5"); // the newest stays
  assert.ok(kept.length <= CHATS_KEPT);
});

/* ---------- the account's answers ---------- */

test("409 (a newer copy on the account) and 413 (too long) leave no copy in this browser", async () => {
  logIn();
  chatService.save = async () => {
    throw httpError(409);
  };
  assert.deepEqual(await saveChat(rec("stalechat")), { stale: true });
  chatService.save = async () => {
    throw httpError(413);
  };
  assert.deepEqual(await saveChat(rec("hugechat1")), { tooLong: true });
  assert.deepEqual(local(), []);
});

test("the account's copy: deleted by the customer (410) is told apart from gone by itself (404) and offline", async () => {
  logIn();
  for (const [status, want] of [[410, { gone: true }], [404, { missing: true }], [500, { failed: true }]]) {
    chatService.get = async () => {
      throw httpError(status);
    };
    assert.deepEqual(await store.accountChat("somechat1"), want);
  }
  chatService.get = async () => ({ id: "somechat1", at: 700, updatedAt: 700, body: { chat: [] } });
  assert.equal((await store.accountChat("somechat1")).rec.at, 700);
});

test("offline or too many saves: kept in this browser with its owner, sent next time", async () => {
  logIn("user-7");
  chatService.save = async () => {
    throw httpError(429);
  };
  assert.deepEqual(await saveChat(rec("busychat1")), { failed: true });
  assert.deepEqual(local().map((c) => [c.id, c.owner]), [["busychat1", "user-7"]]);
  // next time it goes, with its stamp, and leaves this browser
  const sent = [];
  chatService.save = async (id, body) => {
    sent.push([id, body.at]);
  };
  await moveLocalChats();
  assert.deepEqual(sent, [["busychat1", 1000]]);
  assert.deepEqual(local(), []);
});

test("saves of one chat go one after the other; one still waiting is replaced by a newer one", async () => {
  logIn();
  const order = [];
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  chatService.save = async (id, body) => {
    order.push(body.at);
    if (body.at === 1) await gate;
  };
  const a = saveChat(rec("lanechat1", { at: 1 }));
  const b = saveChat(rec("lanechat1", { at: 2 }));
  const c = saveChat(rec("lanechat1", { at: 3 }));
  release();
  assert.deepEqual(await Promise.all([a, b, c]), [{ saved: true }, { replaced: true }, { saved: true }]);
  assert.deepEqual(order, [1, 3]);
});

test("opening a chat takes the newer of this browser's copy and the account's", async () => {
  logIn("user-1");
  localStorage.setItem(CHATS_KEY, JSON.stringify([{ ...rec("twocopies"), at: 500, owner: "user-1", title: "here" }]));
  chatService.get = async () => ({ id: "twocopies", title: "account", at: 400, body: {} });
  assert.equal((await loadChat("twocopies")).title, "here");
  chatService.get = async () => ({ id: "twocopies", title: "account", at: 600, body: {} });
  assert.equal((await loadChat("twocopies")).title, "account");
});

test("another customer's chats left in this browser are never shown or moved", async () => {
  logIn("user-1");
  localStorage.setItem(CHATS_KEY, JSON.stringify([rec("visitorchat"), { ...rec("minechat01"), owner: "user-1" }, { ...rec("otherschat"), owner: "user-2" }]));
  const sent = [];
  chatService.save = async (id) => {
    sent.push(id);
  };
  chatService.list = async () => [];
  const { chats } = await listChats();
  assert.deepEqual(sent.sort(), ["minechat01", "visitorchat"]);
  assert.deepEqual(chats.map((c) => c.id), []);
  assert.deepEqual(local().map((c) => c.id), ["otherschat"]); // still here, for user-2
});

/* ---------- storage full, signing out ---------- */

test("storage full: the other garments' room copies make way, this one stays", () => {
  localStorage.setItem("identee:room:v1:oversized-tee", "{}");
  localStorage.setItem("identee:room:v1:oversized-tee:at", "{}");
  localStorage.setItem("identee:room:v1:polo", "{}");
  localStorage.setItem("identee:room:v1:polo:at", "{}");
  localStorage.setItem("identee:design:v3:polo", "{}");
  assert.equal(makeRoom("oversized-tee"), 2);
  assert.deepEqual([...localStorage.box.keys()].sort(), ["identee:design:v3:polo", "identee:room:v1:oversized-tee", "identee:room:v1:oversized-tee:at"]);
});

test("signing out clears the design room; a visitor's chats stay", () => {
  for (const k of ["identee:room:v1:polo", "identee:room:v1:polo:at", "identee:design:v3:polo", "identee:typed:v1:polo", "identee:size", "userInfo"]) localStorage.setItem(k, "{}");
  sessionStorage.setItem("identee:undo:v1:polo", "{}");
  localStorage.setItem(CHATS_KEY, JSON.stringify([rec("visitorchat"), { ...rec("minechat01"), owner: "user-1" }]));
  forgetDesignRoom();
  assert.deepEqual([...localStorage.box.keys()].sort(), [CHATS_KEY, "identee:size", "userInfo"]);
  assert.deepEqual(local().map((c) => c.id), ["visitorchat"]);
  assert.equal(sessionStorage.length, 0);
});
