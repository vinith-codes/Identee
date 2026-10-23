// studio/chatStore.js — the Assistant's saved chats (23 Oct 2026)
//
// Each chat is a conversation together with the tee it was designing, so "Chats" in the Assistant can bring both
// back, and "New chat" / "Start designing" never throw an earlier one away.
//   logged in  → saved to the customer's account (server: /api/chats), so it opens on any device
//   visitor    → saved in this browser; moved to the account when they log in
// A chat: { id, type, title, colour, designId, updatedAt, body: { chat, chatState, aiPlaced, memory, design } }
// with design = { elements, colour, size, designId, name, locked, players }.
import chatService from "../services/chatService";

export const CHATS_KEY = "identee:chats:v1";
export const CHATS_KEPT = 20; // the same as the server keeps per customer
const TITLE_MAX = 60;

const loggedIn = () => {
  try {
    return !!JSON.parse(localStorage.getItem("userInfo") || "null")?.token;
  } catch {
    return false;
  }
};

/* ---------- what a chat is called, and whether it is worth keeping ---------- */

// the customer's first typed message (what the chat is about), else the given name
export function chatTitle(chat, fallback = "My design") {
  const first = (chat || []).find((m) => m.from === "me" && typeof m.text === "string" && m.text.trim() && !/^(Stop|Try again|Make it|Draw (it|them))$/.test(m.text.trim()));
  const t = (first?.text || "").replace(/\s+/g, " ").trim().replace(/^Draw: /, "");
  return t ? (t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t) : fallback;
}
// nothing said and nothing on the tee: not a chat to keep (opening the room mustn't fill the list)
export const worthKeeping = (body) => Boolean(body?.chat?.some((m) => m.from === "me") || body?.design?.elements?.length);

/* ---------- what the smart Assistant reads of the chat ---------- */

// one message in words (pictures and cards as a short note), or null
export const toHistory = (m) =>
  m.from === "me" ? { who: "customer", text: m.text || (m.photo ? "(sent a photo)" : "") }
  : m.from === "bot" ? { who: "assistant", text: m.text }
  : m.slogans ? { who: "assistant", text: `Slogans shown: ${m.slogans.join(" | ")}` }
  : m.ideas ? { who: "assistant", text: `Ideas shown: ${m.ideas.map((i) => i.title).join(" | ")}` }
  : m.plan ? { who: "assistant", text: `Drawing plan shown: ${m.plan.items.map((x) => x.subject).join(" | ")}` }
  : m.designs ? { who: "assistant", text: `${m.designs.length} new picture${m.designs.length === 1 ? "" : "s"} shown` }
  : m.mypics ? { who: "assistant", text: "Showed the pictures they made or uploaded before (My pictures)" }
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
// newest first; when the browser is full, the oldest chats go first
const writeLocal = (list) => {
  let keep = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CHATS_KEPT);
  while (keep.length) {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(keep));
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
const asSummary = ({ id, type, title, colour, designId, updatedAt }) => ({ id, type, title, colour, designId: designId || null, updatedAt: new Date(updatedAt || 0).getTime() });
const asUpload = (rec) => ({ type: rec.type, title: rec.title, colour: rec.colour, designId: rec.designId || null, body: rec.body });

/* ---------- the store ---------- */

// A visitor's chats go to their account once they have logged in (those that don't make it stay here and are tried
// again next time).
let moving = null;
export function moveLocalChats() {
  if (!loggedIn()) return Promise.resolve();
  if (!moving)
    moving = (async () => {
      for (const rec of readLocal().reverse()) {
        try {
          await chatService.save(rec.id, asUpload(rec));
          dropLocal(rec.id);
        } catch {
          // kept in this browser
        }
      }
    })().finally(() => {
      moving = null;
    });
  return moving;
}

// -> { chats: [summary] newest first, error: "" | what went wrong }
export async function listChats() {
  const local = readLocal().map(asSummary);
  if (!loggedIn()) return { chats: local, error: "" };
  await moveLocalChats();
  try {
    const server = (await chatService.list()).map(asSummary);
    const left = readLocal().map(asSummary).filter((c) => !server.some((s) => s.id === c.id));
    return { chats: [...server, ...left].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CHATS_KEPT), error: "" };
  } catch {
    return { chats: local, error: "Couldn’t load the chats saved to your account. Check your connection and try again." };
  }
}

// -> the whole chat, or null
export async function loadChat(id) {
  const here = readLocal().find((c) => c.id === id);
  if (here || !loggedIn()) return here || null;
  try {
    const c = await chatService.get(id);
    return { ...asSummary(c), body: c.body || {} };
  } catch {
    return null;
  }
}

// Saves the chat where it belongs. leaving: the page is closing (the account copy is sent with keepalive; the
// browser keeps its own copy of the open chat anyway).
export async function saveChat(rec, { leaving = false } = {}) {
  if (!rec?.id || !worthKeeping(rec.body)) return;
  if (!loggedIn()) return saveLocal(rec);
  if (leaving) return chatService.saveOnLeave(rec.id, asUpload(rec));
  try {
    await chatService.save(rec.id, asUpload(rec));
    if (readLocal().some((c) => c.id === rec.id)) dropLocal(rec.id);
  } catch {
    saveLocal(rec); // offline or refused: kept here and sent to the account later
  }
}

export async function removeChat(id) {
  dropLocal(id);
  if (loggedIn()) await chatService.remove(id);
}
