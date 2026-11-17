// utils/dbReady.js
//
// Waits for the database while the backend is STARTING (13 Nov 2026). The live backend is started again by the
// hosting panel on the first visit after a quiet spell, and reaching the database then takes a few seconds. A request
// that came in meanwhile waited only 10 s (mongoose's own wait), failed — and the login check answered "Not
// authorized, token failed", so the website logged the admin out every time they came back. Now requests wait for
// the first connection, up to DB_WAIT_MS (25 s; the web server in front waits longer than that), and a database that
// is still not there is "try again in a moment" (503), never a bad login.
// Only the first connection: once the database has been reached, a later drop is left to the database driver, which
// waits for its own reconnect as before (mongoose can report "not connected" for a while after a quiet network
// without ever announcing that it is back — a wait for that would hold every request the full 25 s).
import mongoose from "mongoose";

const waitMs = () => Number(process.env.DB_WAIT_MS) || 25000;
const POLL_MS = 100;

export const DB_STARTING = "The server is starting up — please try again in a moment.";

// connections that have been reached at least once
const opened = new WeakSet();
const hasOpened = (conn) => {
  if (opened.has(conn)) return true;
  if (conn.readyState === 1 || conn._hasOpened === true) {
    opened.add(conn);
    return true;
  }
  return false;
};
mongoose.connection.on("connected", () => opened.add(mongoose.connection));

/** resolves once the database has been reached (at once if it has been), rejects after `ms` */
export function dbReady(conn = mongoose.connection, ms = waitMs()) {
  if (hasOpened(conn)) return Promise.resolve();
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = setInterval(() => {
      if (hasOpened(conn)) {
        clearInterval(tick);
        resolve();
      } else if (Date.now() - t0 >= ms) {
        clearInterval(tick);
        reject(new Error("The database is not reachable"));
      }
    }, POLL_MS);
  });
}

// a line in the log when requests are turned away (at most one a minute), so a database that never came is seen
let lastWarn = 0;
export function warnNotReachable(req) {
  const now = Date.now();
  if (now - lastWarn < 60000) return;
  lastWarn = now;
  console.warn(`⚠️  Database not reachable after ${Math.round(waitMs() / 1000)} s — answered 503 (${req.method} ${req.originalUrl})`);
}

/** Express: every /api request waits for the database while the backend is starting (a 503 if it doesn't come) */
export const waitForDatabase = (req, res, next) => {
  dbReady().then(
    () => next(),
    () => {
      warnNotReachable(req);
      res.status(503).json({ message: DB_STARTING });
    },
  );
};
