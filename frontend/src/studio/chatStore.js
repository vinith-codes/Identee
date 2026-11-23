// studio/chatStore.js — the Assistant's saved chats (23 Oct 2026)
//
// Each chat is a conversation together with the tee it was designing, so "Chats" in the Assistant can bring both
// back, and "New chat" / "Start designing" never throw an earlier one away.
//   logged in  → saved to the customer's account (server: /api/chats), so it opens on any device
//   visitor    → saved in this browser; moved to the account when they log in
// A chat: { id, type, title, colour, designId, updatedAt, at, owner, body: { chat, chatState, aiPlaced, memory, design } }
// with design = { elements, colour, size, designId, name, locked, players }.
// 13 Nov 2026 (feedback 9): the whole chat is kept (no more "last 80 messages"); a long one stays under the server's
// limit by dropping old version pictures and old idea cards, never messages. Each copy carries a stamp (`at`, only
// goes up) so an older copy can't be saved over a newer one, and an owner, so a chat left in a shared browser never
// moves into someone else's account.
import chatService from "../services/chatService";
import { dropAllFiles } from "./roomFiles";

export const CHATS_KEY = "identee:chats:v1";
// The limits (the owner may raise them — one line each; the server has its own: designChatController.CHATS_KEPT and
// designChatModel.CHAT_DAYS)
export const CHATS_KEPT = 20; // chats kept per customer
export const CHAT_DAYS = 90; // days a chat nobody changed is kept on the account
const TITLE_MAX = 60;
// what this browser keeps of the design room (DesignRoomPage.jsx): the room copy (+ its ":at" stamps), the design,
// the words typed in the chat box (assistantExtras.js) and undo (this tab only)
export const ROOM_PREFIX = "identee:room:v1:";
export const DRAFT_PREFIX = "identee:design:v3:";
const TYPED_PREFIX = "identee:typed:v1:";
export const UNDO_PREFIX = "identee:undo:v1:";

const userInfo = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null");
  } catch {
    return null;
  }
};
const loggedIn = () => Boolean(userInfo()?.token);
// the logged-in customer's id, or null
export const myId = () => {
  const u = userInfo();
  return u?.token && u._id ? String(u._id) : null;
};

/* ---------- what a chat is called, and whether it is worth keeping ---------- */

// taps and short answers that say nothing about the tee (they never become a chat's name)
const TAPS = /^(Upload a photo|Choose a ready design|Show me 3 more|Stop|Try again|Try another one|Make it|Draw (it|them)|Help me start \(3 taps\)|Browse ideas|Ask the IDENTEE team|Something else|Log in|Sign in|More options|Show more|Continue to review|Not now|Cancel|← Back|Change my idea|Use my own words|Use the improved idea|✨ Improve my idea|\d+(\s*(,|and|&)\s*\d+)*)$/i;
// the customer's first typed message (what the chat is about), else the given name
export function chatTitle(chat, fallback = "My design") {
  const first = (chat || []).find((m) => m && m.from === "me" && typeof m.text === "string" && m.text.trim() && !TAPS.test(m.text.trim()));
  const t = (first?.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Draw: /, "")
    .replace(/^✨ Improve my idea:\s*/, "")
    .replace(/ Show me three concepts.*$/, ""); // (the three-tap start's brief: its first sentence is the name)
  return t ? (t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t) : fallback;
}
// nothing said and nothing on the tee: not a chat to keep (opening the room mustn't fill the list)
export const worthKeeping = (body) => Boolean(body?.chat?.some((m) => m?.from === "me") || body?.design?.elements?.length);

/* ---------- a long chat, kept whole (13 Nov 2026) ---------- */

export const SAVE_MAX = 900_000; // characters of a saved chat (the server refuses over 1,000,000)
export const PICTURED = 40; // the newest version cards keep their picture and tee copy ("Go back to this")
const blobPhoto = (m) => Boolean(m?.photo && /^blob:/.test(String(m.photo.url || "")));
// a photo still on this device's own link when the page closed (it was being sent): gone after a reload, so a line
const notSent = (m) => ({ from: "me", text: [m.text, "(photo not sent)"].filter(Boolean).join(" ") });
const pictured = (m) => Boolean(m?.version && (m.version.thumb || Array.isArray(m.version.elements)));
// an old version card keeps its number and words only
const thinVersion = (m) => ({ ...m, version: { n: m.version.n, label: m.version.label, colour: m.version.colour || null } });

// The chat as it is kept (the room copy, a saved chat): the newest `max` messages (all by default); only the newest
// `keepPictures` version cards keep their picture and tee copy; a photo that never got sent becomes a line.
export function keptChat(chat, max = Infinity, keepPictures = PICTURED) {
  const list = Array.isArray(chat) ? chat.slice(-max) : [];
  let left = keepPictures;
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    let m = list[i];
    if (!m || typeof m !== "object") continue;
    if (blobPhoto(m)) m = notSent(m);
    else if (m.sending) {
      const { sending, ...rest } = m; // eslint-disable-line no-unused-vars
      m = rest;
    }
    if (pictured(m)) {
      if (left > 0) left -= 1;
      else m = thinVersion(m);
    }
    out.push(m);
  }
  return out.reverse();
}

// A chat as it is saved: every message kept. Still over SAVE_MAX: old Browse-ideas cards go first (they can be
// looked up again), then the oldest versions' pictures. tooLong: true when even that isn't enough.
export function slimForSaving(body) {
  const chat = keptChat(body?.chat);
  const out = { ...(body || {}), chat };
  let size = JSON.stringify(out).length;
  if (size <= SAVE_MAX) return out;
  const swap = (i, next) => {
    const before = JSON.stringify(chat[i]).length;
    chat[i] = next;
    size -= before - JSON.stringify(next).length;
  };
  const browse = chat.flatMap((m, i) => (Array.isArray(m.browse) && m.browse.length ? [i] : [])).slice(0, -1);
  for (const i of browse) {
    if (size <= SAVE_MAX) break;
    swap(i, { browse: [], old: true });
  }
  for (let i = 0; i < chat.length && size > SAVE_MAX; i++) if (pictured(chat[i])) swap(i, thinVersion(chat[i]));
  return size > SAVE_MAX ? { ...out, tooLong: true } : out;
}

// a short fingerprint of a saved chat's text (the room remembers what was sent, so a reload doesn't send it again)
export function hashText(text) {
  const t = String(text ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${t.length}`;
}

// What "Start designing" offers back ("You have an unfinished design … Continue it"): a tee with items that isn't
// saved to My designs, or was changed since; or a chat with the Assistant, even with nothing on the tee yet.
// draft = the kept design, room = the kept room. null = nothing to offer.
export function unfinishedRoom(draft, room) {
  const elements = Array.isArray(draft?.elements) ? draft.elements : [];
  const talked = Boolean(Array.isArray(room?.chat) && room.chat.some((m) => m?.from === "me"));
  if (elements.length) return !draft.designId || draft.dirty ? { ...draft, elements, talked } : null;
  return talked ? { ...(draft || {}), elements, talked, colour: draft?.colour || room.colour, size: draft?.size || room.size } : null;
}

/* ---------- what the smart Assistant reads of the chat ---------- */

// one message in words (pictures and cards as a short note), or null
export const toHistory = (m) =>
  // (17 Nov 2026) several photos in one message: how many, with the words sent with them
  m.from === "me" ? { who: "customer", text: m.photos?.length ? `(sent ${m.photos.length} photos)${m.text ? ` ${m.text}` : ""}` : m.text || (m.photo ? "(sent a photo)" : "") }
  : m.photosPlan ? { who: "assistant", text: `Photo plan shown: ${m.photosPlan.items.map((x) => `photo ${x.n}: ${x.skip ? "not used" : `${x.job} on ${(x.areaKeys || []).join(" + ")}`}`).join(" | ")}` }
  : m.from === "bot" ? { who: "assistant", text: m.text }
  : m.slogans ? { who: "assistant", text: `Slogans shown: ${m.slogans.join(" | ")}` }
  : m.ideas ? { who: "assistant", text: `Ideas shown: ${m.ideas.map((i) => i.title).join(" | ")}` }
  : m.plan ? { who: "assistant", text: `Drawing plan shown: ${m.plan.items.map((x) => x.subject).join(" | ")}` }
  : m.designs ? { who: "assistant", text: `${m.designs.length} new picture${m.designs.length === 1 ? "" : "s"} shown` }
  : m.mypics ? { who: "assistant", text: "Showed the pictures they made or uploaded before (My pictures)" }
  : m.sizeAsk ? { who: "assistant", text: "Showed the size card (height and weight in, the best size out)" }
  : m.orders ? { who: "assistant", text: "Showed their latest orders (status, cancel, order again)" }
  : m.reorder ? { who: "assistant", text: "Showed the card to order an earlier tee again" }
  : m.group ? { who: "assistant", text: m.group.token ? "Their group link is made (friends fill in name and size)" : "Showed the card to make a group link" }
  : null;

export const RECENT = 14; // the latest messages, always sent as they are
const EARLIER_MAX = 40;
// history: the latest messages · earlier: older ones not in the memory note yet (they're marked `folded` once the
// server has put them in the note) · fold: those messages themselves, to mark when the new note comes back
export function historyFor(chat) {
  const said = (chat || []).map((m) => [m, toHistory(m)]).filter(([, h]) => h?.text);
  const older = said.slice(0, -RECENT).filter(([m]) => !m.folded).slice(-EARLIER_MAX);
  return { history: said.slice(-RECENT).map(([, h]) => h), earlier: older.map(([, h]) => h), fold: older.map(([m]) => m) };
}

/* ---------- this browser's chats ---------- */

const readLocal = () => {
  try {
    const list = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === "string") : [];
  } catch {
    return [];
  }
};
// the ones this person may see: a visitor's, and (logged in) their own — never another customer's left in the browser
const mine = (list) => {
  const me = myId();
  return list.filter((c) => !c.owner || (me && c.owner === me));
};
const LOCAL_MAX = 1_500_000; // characters: this browser's chats never take most of its storage (about 5 MB for the site)
// newest first; when the browser is full, the oldest chats go first
const writeLocal = (list) => {
  let keep = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CHATS_KEPT);
  while (keep.length) {
    const text = JSON.stringify(keep);
    if (text.length > LOCAL_MAX && keep.length > 1) {
      keep = keep.slice(0, -1);
      continue;
    }
    try {
      localStorage.setItem(CHATS_KEY, text);
      return;
    } catch {
      keep = keep.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(CHATS_KEY);
  } catch {
    // storage blocked — chats just aren't kept in this browser
  }
};
const saveLocal = (rec) => writeLocal([rec, ...readLocal().filter((c) => c.id !== rec.id)]);
const dropLocal = (id) => writeLocal(readLocal().filter((c) => c.id !== id));
// (a moved chat keeps the time it was last changed, not the time it was moved)
const asSummary = ({ id, type, title, colour, designId, updatedAt, at }) => ({ id, type, title, colour, designId: designId || null, at: Number(at) || 0, updatedAt: Number(at) || new Date(updatedAt || 0).getTime() });
const asUpload = (rec) => ({ type: rec.type, title: rec.title, colour: rec.colour, designId: rec.designId || null, at: Number(rec.at) || 0, body: rec.body });

/* ---------- one save at a time per chat ---------- */

// A chat's saves go one after the other (two at once could arrive in the wrong order): a save waits for the one
// running, and a newer one takes the place of one still waiting ({ replaced: true }).
const lanes = new Map(); // chat id -> { busy, queued: { run, resolve } }
const inLane = (id, run) =>
  new Promise((resolve) => {
    const lane = lanes.get(id) || { busy: false, queued: null };
    lanes.set(id, lane);
    if (lane.queued) lane.queued.resolve({ replaced: true });
    lane.queued = { run, resolve };
    const next = () => {
      if (lane.busy) return;
      if (!lane.queued) {
        lanes.delete(id);
        return;
      }
      const job = lane.queued;
      lane.queued = null;
      lane.busy = true;
      Promise.resolve()
        .then(job.run)
        .catch(() => ({ failed: true }))
        .then((out) => {
          lane.busy = false;
          job.resolve(out);
          next();
        });
    };
    next();
  });

/* ---------- the store ---------- */

// A visitor's chats go to their account once they have logged in (those that don't make it stay here and are tried
// again next time). Never another customer's chats left in this browser.
let moving = null;
export function moveLocalChats() {
  if (!loggedIn()) return Promise.resolve();
  if (!moving)
    moving = (async () => {
      for (const rec of mine(readLocal()).reverse()) {
        if (lanes.has(rec.id)) continue; // being saved right now: that newer save covers it
        try {
          await chatService.save(rec.id, asUpload({ ...rec, at: rec.at || rec.updatedAt }));
          dropLocal(rec.id);
        } catch (err) {
          // the account has a newer copy, or it can never be saved: this one goes; anything else is tried next time
          if ([409, 413].includes(err?.response?.status)) dropLocal(rec.id);
        }
      }
    })().finally(() => {
      moving = null;
    });
  return moving;
}

// -> { chats: [summary] newest first, error: "" | what went wrong }
export async function listChats() {
  const local = mine(readLocal()).map(asSummary);
  if (!loggedIn()) return { chats: local, error: "" };
  await moveLocalChats();
  try {
    const server = (await chatService.list()).map(asSummary);
    const left = mine(readLocal()).map(asSummary).filter((c) => !server.some((s) => s.id === c.id));
    return { chats: [...server, ...left].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CHATS_KEPT), error: "" };
  } catch {
    return { chats: local, error: "Couldn’t load the chats saved to your account. Check your connection and try again." };
  }
}

// The account's copy of a chat -> { rec } | { gone: true } (the customer deleted it) | { missing: true } (not on the
// account: it went by itself — not changed for CHAT_DAYS days, or past the newest CHATS_KEPT — or never got there;
// 13 Nov 2026) | { failed: true } (offline …)
export async function accountChat(id) {
  try {
    const c = await chatService.get(id);
    return { rec: { ...asSummary(c), body: c.body || {} } };
  } catch (err) {
    const status = err?.response?.status;
    return status === 410 ? { gone: true } : status === 404 ? { missing: true } : { failed: true };
  }
}
// Only the stamp of the account's copy (from the list: small, no messages) -> { at } | { gone: true } | { failed: true }
export async function accountStamp(id) {
  try {
    const c = ((await chatService.list()) || []).find((x) => x.id === id);
    return c ? { at: Number(c.at) || 0 } : { gone: true };
  } catch {
    return { failed: true };
  }
}

// -> the whole chat, or null. Logged in: the newer of this browser's copy and the account's.
export async function loadChat(id) {
  const here = mine(readLocal()).find((c) => c.id === id) || null;
  if (!loggedIn()) return here;
  const r = await accountChat(id);
  if (!r.rec) return here;
  return here && (Number(here.at) || 0) > (r.rec.at || 0) ? here : r.rec;
}

// Saves the chat where it belongs. leaving: the page is closing (the account copy is sent with keepalive; the
// browser keeps its own copy of the open chat anyway).
// -> { saved } | { local } (a visitor: in this browser) | { stale } (409: the account has a newer copy — nothing kept
//    here) | { tooLong } (nothing kept here: it would fail every time) | { failed } (offline, too many saves: kept
//    here, with its owner, and sent next time) | { left } | { replaced } | { skipped }
export async function saveChat(rec, { leaving = false } = {}) {
  if (!rec?.id || !worthKeeping(rec.body)) return { skipped: true };
  if (!loggedIn()) {
    saveLocal(rec);
    return { local: true };
  }
  if (rec.body?.tooLong) return { tooLong: true };
  if (leaving) {
    chatService.saveOnLeave(rec.id, asUpload(rec));
    return { left: true };
  }
  return inLane(rec.id, async () => {
    if (moving) await moving;
    try {
      await chatService.save(rec.id, asUpload(rec));
      if (readLocal().some((c) => c.id === rec.id)) dropLocal(rec.id);
      return { saved: true };
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409 || status === 413) {
        if (readLocal().some((c) => c.id === rec.id)) dropLocal(rec.id);
        return status === 409 ? { stale: true } : { tooLong: true };
      }
      saveLocal({ ...rec, owner: rec.owner || myId() });
      return { failed: true };
    }
  });
}

export async function removeChat(id) {
  dropLocal(id);
  if (loggedIn()) await chatService.remove(id);
}

/* ---------- this browser's room copies ---------- */

const keysOf = (store) => {
  try {
    const out = [];
    for (let i = 0; i < store.length; i++) out.push(store.key(i));
    return out.filter(Boolean);
  } catch {
    return [];
  }
};
const drop = (store, key) => {
  try {
    store.removeItem(key);
  } catch {
    /* blocked */
  }
};
// The browser's storage is full: the other garments' room copies make way (their chats are safe in Chats; their
// designs stay). -> how many were removed
export function makeRoom(keepType = "") {
  let freed = 0;
  for (const k of keysOf(localStorage)) {
    if (!k.startsWith(ROOM_PREFIX) || k.slice(ROOM_PREFIX.length).replace(/:at$/, "") === keepType) continue;
    drop(localStorage, k);
    freed += 1;
  }
  return freed;
}
// Signing out: the design room left in this browser (rooms, designs, typed words, undo, a picked photo) and the
// signed-in customer's own chats kept here go, so the next person on this phone sees none of it. A visitor's chats stay.
// (Not when a login only runs out — the same person logs in again and finds everything.)
export function forgetDesignRoom() {
  for (const k of keysOf(localStorage)) if ([ROOM_PREFIX, DRAFT_PREFIX, TYPED_PREFIX].some((p) => k.startsWith(p))) drop(localStorage, k);
  if (typeof sessionStorage !== "undefined") for (const k of keysOf(sessionStorage)) if (k.startsWith(UNDO_PREFIX)) drop(sessionStorage, k);
  writeLocal(readLocal().filter((c) => !c.owner));
  dropAllFiles();
}
