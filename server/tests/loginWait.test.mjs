// A login must never be called "no good" because the database wasn't there yet (13 Nov 2026: the live backend is
// started again after a quiet spell; the admin's first requests got "Not authorized, token failed" and the website
// logged them out every time they came back).
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { dbReady, DB_STARTING } from "../utils/dbReady.js";
import { protect } from "../middleware/authMiddleware.js";
import User from "../models/userModel.js";

const fakeConn = (state = 0) => Object.assign(new EventEmitter(), { readyState: state });

test("dbReady: connected → at once", async () => {
  await dbReady(fakeConn(1), 10);
});

test("dbReady: while starting, requests wait for the first connection (no listeners left behind)", async () => {
  const c = fakeConn(0);
  const t0 = Date.now();
  const waits = [dbReady(c, 2000), dbReady(c, 2000), dbReady(c, 2000)];
  setTimeout(() => {
    c.readyState = 1;
  }, 150);
  await Promise.all(waits);
  assert.ok(Date.now() - t0 >= 140);
  assert.equal(c.listenerCount("connected"), 0);
});

test("dbReady: once the database was reached, a later drop doesn't hold requests (the driver waits for its reconnect)", async () => {
  const c = fakeConn(1);
  await dbReady(c, 10);
  c.readyState = 0; // (mongoose can say this for a while after a quiet network, without announcing it is back)
  const t0 = Date.now();
  await dbReady(c, 5000);
  assert.ok(Date.now() - t0 < 50);
});

test("dbReady: gives up after the wait", async () => {
  await assert.rejects(dbReady(fakeConn(0), 30), /not reachable/);
});

// protect(), as Express calls it: resolves with what it passed on
const run = (authorization) =>
  new Promise((resolve) => {
    const req = { headers: authorization ? { authorization } : {} };
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
    };
    protect(req, res, (err) => resolve({ err, status: res.statusCode, user: req.user }));
  });

const SECRET = "login-wait-test-secret";
const idA = new mongoose.Types.ObjectId().toString();
const good = () => `Bearer ${jwt.sign({ id: idA }, SECRET, { expiresIn: "1h" })}`;

test("protect: login checks", async (t) => {
  const was = { secret: process.env.JWT_SECRET, wait: process.env.DB_WAIT_MS, find: User.findById };
  process.env.JWT_SECRET = SECRET;
  process.env.DB_WAIT_MS = "60";
  const conn = mongoose.connection;
  let found = { _id: idA, name: "Test admin", isAdmin: true };
  let fail = false;
  User.findById = () => ({ select: async () => {
    if (fail) throw new Error("connection reset");
    return found;
  } });
  t.after(() => {
    User.findById = was.find;
    conn.readyState = 0;
    if (was.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = was.secret;
    if (was.wait === undefined) delete process.env.DB_WAIT_MS;
    else process.env.DB_WAIT_MS = was.wait;
  });

  await t.test("no login → 401 no token", async () => {
    const r = await run(null);
    assert.equal(r.status, 401);
    assert.match(r.err.message, /no token/);
  });

  await t.test("a bad or expired token → 401 token failed, at once (no wait for the database)", async () => {
    const t0 = Date.now();
    for (const bad of ["Bearer nonsense", `Bearer ${jwt.sign({ id: idA }, "another-secret")}`, `Bearer ${jwt.sign({ id: idA }, SECRET, { expiresIn: -10 })}`, `Bearer ${jwt.sign({ signup: "x" }, SECRET)}`, "Bearer"]) {
      const r = await run(bad);
      assert.equal(r.status, 401, bad);
      assert.match(r.err.message, /token failed/);
    }
    assert.ok(Date.now() - t0 < 50);
  });

  await t.test("a good login while the database is not there → 503, NOT token failed (no logout)", async () => {
    conn.readyState = 0;
    const r = await run(good());
    assert.equal(r.status, 503);
    assert.equal(r.err.message, DB_STARTING);
    assert.doesNotMatch(r.err.message, /token failed/);
  });

  await t.test("a good login waits for the database, then goes through", async () => {
    conn.readyState = 0;
    process.env.DB_WAIT_MS = "2000";
    const p = run(good());
    setTimeout(() => {
      conn.readyState = 1; // (emits "connected", as the real connection does)
    }, 40);
    const r = await p;
    assert.equal(r.err, undefined);
    assert.equal(r.user.name, "Test admin");
  });

  await t.test("the database failing on the lookup → 503, not a logout", async () => {
    conn.readyState = 1;
    fail = true;
    const r = await run(good());
    fail = false;
    assert.equal(r.status, 503);
    assert.doesNotMatch(r.err.message, /token failed/);
  });

  await t.test("a deleted account → 401 token failed (that login really is no good)", async () => {
    conn.readyState = 1;
    found = null;
    const r = await run(good());
    assert.equal(r.status, 401);
    assert.match(r.err.message, /token failed/);
  });
});
