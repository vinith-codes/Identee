// The design room's saved chats (13 Nov 2026): "the newer copy wins" (utils/chatStamps.js) and the save limit counted
// per customer (middleware/rateLimit.js). No database: the database calls are handed in as plain functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUTURE_MAX, saveNewest, stampAnswer, stampOf } from "../utils/chatStamps.js";
import rateLimit from "../middleware/rateLimit.js";

const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

test("a save without a stamp (an old open page) gets the server's time; a stamp far ahead is held to a minute", () => {
  const now = 1_000_000;
  assert.equal(stampOf(undefined, now), now);
  assert.equal(stampOf("abc", now), now);
  assert.equal(stampOf(-5, now), now);
  assert.equal(stampOf(0, now), now);
  assert.equal(stampOf(999_000, now), 999_000);
  assert.equal(stampOf(now + 10 * FUTURE_MAX, now), now + FUTURE_MAX);
});

test("what an existing copy means for a save", () => {
  assert.equal(stampAnswer({ at: 500 }, 500), "same"); // sent twice: already saved
  assert.equal(stampAnswer({ at: 600 }, 500), "stale"); // a newer copy is there
  assert.equal(stampAnswer({ at: 400 }, 500), "retry"); // lost a race to create it
  assert.equal(stampAnswer(null, 500), "retry");
});

// a stand-in for the database: the upsert takes only an older stamp, else the unique index answers 11000
const store = () => {
  let doc = null;
  return {
    get: () => doc,
    calls: (body, at) => ({
      write: async () => {
        if (doc && !(doc.at < at)) throw dup();
        doc = { chatId: "abc123", at, body };
        return doc;
      },
      current: async () => doc && { chatId: doc.chatId, at: doc.at },
    }),
  };
};

test("a page opened before the stamps keeps saving: every save is kept, not only its first (13 Nov 2026)", async () => {
  const db = store();
  for (const [n, now] of [[1, 1_000], [2, 2_000], [3, 3_000]]) {
    const at = stampOf(undefined, now);
    const r = await saveNewest(db.calls(`message ${n}`, at), at);
    assert.ok(r.saved);
  }
  assert.equal(db.get().body, "message 3");
});

test("a newer copy is saved", async () => {
  const r = await saveNewest({ write: async () => ({ chatId: "abc123", at: 700 }), current: async () => assert.fail("not needed") }, 700);
  assert.deepEqual(r, { saved: { chatId: "abc123", at: 700 } });
});

test("an older copy is refused, the newer one is kept", async () => {
  let writes = 0;
  const r = await saveNewest({ write: async () => { writes += 1; throw dup(); }, current: async () => ({ chatId: "abc123", at: 900 }) }, 700);
  assert.equal(writes, 1);
  assert.deepEqual(r, { stale: { chatId: "abc123", at: 900 } });
});

test("the same copy sent twice is 'already saved', not refused", async () => {
  const r = await saveNewest({ write: async () => { throw dup(); }, current: async () => ({ chatId: "abc123", at: 700 }) }, 700);
  assert.deepEqual(r, { saved: { chatId: "abc123", at: 700 } });
});

test("two saves creating the same chat at once: the loser tries once more", async () => {
  let writes = 0;
  const r = await saveNewest(
    {
      write: async () => {
        writes += 1;
        if (writes === 1) throw dup(); // the other save created it a moment earlier, with an older stamp
        return { chatId: "abc123", at: 800 };
      },
      current: async () => ({ chatId: "abc123", at: 750 }),
    },
    800,
  );
  assert.equal(writes, 2);
  assert.deepEqual(r, { saved: { chatId: "abc123", at: 800 } });
});

test("other database errors are not hidden", async () => {
  await assert.rejects(saveNewest({ write: async () => { throw new Error("db down"); }, current: async () => null }, 1), /db down/);
});

// a tiny stand-in for express's req/res
const call = (mw, req) =>
  new Promise((resolve) => {
    const res = { status: (code) => ({ json: () => resolve(code) }), set: () => {} };
    mw(req, res, () => resolve(200));
  });

test("the chat save limit counts per customer, not per address", async () => {
  const limit = rateLimit({ windowMs: 60_000, max: 3, key: (req) => req.user?._id });
  const a = { ip: "1.2.3.4", user: { _id: "userA" } };
  const b = { ip: "1.2.3.4", user: { _id: "userB" } }; // same mobile network
  for (let i = 0; i < 3; i++) assert.equal(await call(limit, a), 200);
  assert.equal(await call(limit, b), 200); // B isn't held up by A
  assert.equal(await call(limit, a), 429);
  // without a key it is still per address
  const byIp = rateLimit({ windowMs: 60_000, max: 1 });
  assert.equal(await call(byIp, a), 200);
  assert.equal(await call(byIp, b), 429);
});
