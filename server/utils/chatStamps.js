// utils/chatStamps.js — "the newer copy wins" for the design room's saved chats (13 Nov 2026).
//
// Every saved copy of a chat carries the page's stamp `at` (a number that only goes up for that chat: the page uses
// max(now, last stamp + 1), so a device with a slow clock still goes up). A save is kept only when its stamp is
// newer than the one saved before; an older copy — another device's, or a tab left open on an old page — is refused
// (409) and the page brings in the newer one instead. Pure, so tests run without a database.

export const FUTURE_MAX = 60_000; // a stamp at most a minute ahead of the server's clock

// the stamp a save carries, never more than a minute ahead. None (a page opened before the stamps, still open) is
// stamped with the server's time, so each of its saves is newer than the one before, as it was before the stamps —
// as 0 every save after its first would be answered "saved already" and not kept (13 Nov 2026)
export const stampOf = (raw, now = Date.now()) => {
  const n = Number(raw);
  return n > 0 ? Math.min(n, now + FUTURE_MAX) : now;
};

// the save didn't go in because the chat is already there with a stamp of its own (cur): what that means
//   "same"  → this very copy is saved already (sent twice) — fine
//   "stale" → a newer copy is saved — refuse this one
//   "retry" → it lost a race creating the same chat — try once more
export const stampAnswer = (cur, at) => {
  if (!cur) return "retry";
  const there = Number(cur.at) || 0;
  if (there === at) return "same";
  return there > at ? "stale" : "retry";
};

// The save, with the database calls handed in:
//   write()    saves this copy unless a copy with the same or a newer stamp is there (an upsert whose filter asks
//              for an older stamp — with a newer one there it tries to add a second copy, and the unique
//              index answers with error 11000)
//   current()  the copy saved now (without its messages)
// -> { saved } | { stale }
export async function saveNewest({ write, current }, at) {
  for (let t = 0; t < 2; t++) {
    try {
      return { saved: await write() };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const cur = await current();
      const was = stampAnswer(cur, at);
      if (was === "same") return { saved: cur };
      if (was === "stale") return { stale: cur };
    }
  }
  return { stale: await current() };
}
