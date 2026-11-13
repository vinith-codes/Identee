// studio/assistantExtras.js — the small rules behind the Assistant's round 8 (11 Nov 2026): feedback chips under a
// concept sheet, "change this spot", tips while a picture is drawn, the pictures-left line, the mic's language,
// orders in the chat and the group link. All pure (no React, no network), so they are tested in tests/round8.test.mjs.
// Round 9 (13 Nov 2026): 💡 Suggest and talking with the Assistant (tests/round9.test.mjs).

/* ---------- one-tap feedback under a concept sheet ---------- */
// label: what the chip shows · say: what is sent to the Assistant (as if typed, so the brain answers with a new sheet)
export const FEEDBACK = [
  { label: "Too busy", say: "Too busy — show simpler ones" },
  { label: "Too plain", say: "Too plain — show bolder ones" },
  { label: "Other colours", say: "Same ideas in other colours" },
  { label: "More fun", say: "More fun — show playful ones" },
];

/* ---------- "change this spot" ---------- */
// A tapped point of a picture (x, y from 0 to 1, from the top left) in words the picture AI follows.
export function spotWords(x, y) {
  const cx = Math.min(1, Math.max(0, Number(x) || 0));
  const cy = Math.min(1, Math.max(0, Number(y) || 0));
  const col = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "centre";
  const row = cy < 1 / 3 ? "top" : cy > 2 / 3 ? "bottom" : "middle";
  const place = row === "middle" && col === "centre" ? "the centre" : row === "middle" ? `the ${col} side` : col === "centre" ? `the ${row}` : `the ${row} ${col}`;
  return `${place} (about ${Math.round(cx * 100)}% from the left, ${Math.round(cy * 100)}% from the top)`;
}
// the short name of the spot, for the chat ("the top right")
export const spotName = (words) => String(words || "").replace(/\s*\(.*$/, "");
// what the picture AI is asked when a spot was tapped: the change, there and nowhere else
export const changeAtSpot = (change, spot) => (spot ? `${change} — only at this spot of the picture: ${spot}. Keep everything else exactly the same.` : change);

/* ---------- tips while a picture is drawn ---------- */
export const WAIT_TIPS = [
  "Tap a picture to zoom in and look at the small details.",
  "Say “2 but with the words in gold” to change a concept as you pick it.",
  "Bright colours stand out on dark tees. Soft colours suit light tees.",
  "Tees for a team or a class? Ask me for a group link: friends fill in their own name and size.",
  "Not sure about your size? Tell me your height and weight.",
  "Ask “when will it arrive?” and I’ll work out the date.",
  "You can move, resize and turn every picture once it is on the tee.",
  "Want one part changed? Tap “Change a part” under a picture and point at it.",
];
// the tip showing after `secs` seconds (a new one every `every` seconds, starting from tip `start`)
export const tipAt = (tips, secs, start = 0, every = 7) => (tips?.length ? tips[(start + Math.floor(Math.max(0, secs) / every)) % tips.length] : "");

/* ---------- "14 of 20 pictures left today" ---------- */
export function leftLine(ai) {
  if (!ai?.loggedIn || !ai.available) return "";
  const left = Number(ai.left);
  const all = Number(ai.dailyPerUser);
  if (!Number.isFinite(left) || ai.left == null || !(all > 0)) return "";
  if (left <= 0) return "No pictures left today. They come back tomorrow.";
  return `${Math.min(left, all)} of ${all} pictures left today`;
}

/* ---------- the mic's language ---------- */
export const MIC_LANGS = [
  { key: "en-IN", label: "EN", name: "English" },
  { key: "ta-IN", label: "தமிழ்", name: "Tamil" },
];
const MIC_KEY = "identee:micLang";
export const readMicLang = () => {
  try {
    const v = localStorage.getItem(MIC_KEY);
    return MIC_LANGS.some((l) => l.key === v) ? v : "en-IN";
  } catch {
    return "en-IN";
  }
};
export const saveMicLang = (key) => {
  try {
    localStorage.setItem(MIC_KEY, key);
  } catch {
    /* private window: the choice lasts until the page is closed */
  }
};
export const nextMicLang = (key) => MIC_LANGS[(MIC_LANGS.findIndex((l) => l.key === key) + 1) % MIC_LANGS.length].key;

/* ---------- round 9 (13 Nov 2026): 💡 Suggest, and talking with the Assistant ---------- */
// 💡 Suggest: what is sent to the Assistant (it avoids "idea" and "design", so the brain doesn't draw a concept sheet).
// The brain answers with 3 next steps as chips; nothing on the tee changes until one is tapped.
// off: said when the smart chat can't answer just now (never handed to the fixed chat, which would take it as a change)
export const SUGGEST = { label: "Suggest", say: "Give me 3 suggestions for my tee (don't change it yet)", off: "Suggestions aren’t available just now. Tell me what you’d like to change and I’ll help." };

// what the mic says when it couldn't listen ("aborted" and anything unknown: nothing)
const KEYBOARD = " You can also tap the 🎤 on your keyboard.";
export const MIC_ERRORS = {
  "not-allowed": "The microphone isn’t allowed here. Allow it in the browser’s site settings, or type." + KEYBOARD,
  "service-not-allowed": "Listening is switched off on this phone (iPhone: Settings › General › Keyboard › Dictation)." + KEYBOARD,
  "no-speech": "I didn’t hear anything. Tap 🎤 and speak while it is red.",
  "audio-capture": "No microphone was found." + KEYBOARD,
  network: "Listening needs the internet. Check the connection, or type.",
  "language-not-supported": "This browser can’t listen in Tamil, so I switched the mic to English." + KEYBOARD,
};
export const micError = (why) => MIC_ERRORS[why] || "";

export const isTamil = (t) => /[஀-௿]/.test(String(t || ""));

// An answer as it should be read out: no emoji, no page addresses ("(/refund-policy)"), ₹699 said as "699 rupees",
// no quote marks or stars. Apostrophes stay (I’ll is still read as I'll). Long answers stop at a sentence near 600 letters.
export function cleanForVoice(t) {
  const s = String(t || "")
    .replace(/\s*\(\/[\w\-/#?=&.]*\)/g, "")
    .replace(/₹\s?([\d,]+)/g, "$1 rupees")
    .replace(/[’‘]/g, "'")
    .replace(/[“”"*#✓↻›•…]/g, " ")
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|️|‍|⃣/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= 600) return s;
  const cut = s.slice(0, 600);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 200 ? cut.slice(0, end + 1) : cut.trim();
}

// What of a chat message is read out: the Assistant's words, or a concept sheet's numbered titles. Nothing else.
export function spokenLine(m) {
  if (!m || m.pending) return "";
  if (m.sheet) {
    const list = (m.sheet.concepts || []).filter((c) => c && c.title).map((c) => `${c.n}: ${cleanForVoice(c.title)}`);
    return list.length ? `${list.join(". ")}. Tap or say the number you like.` : "";
  }
  if (m.from === "bot" && typeof m.text === "string") return cleanForVoice(m.text);
  return "";
}

// The phone's own voice for these words: Tamil words need a Tamil voice (none: null, the answer stays written).
// English: Indian English, then British, then any English — voices that live on the device first (the online ones
// send the words to Google and stop after about 15 s). null: the browser's own default voice is used.
export function voiceFor(voices, text) {
  const lang = (v) => String(v?.lang || "").replace(/_/g, "-").toLowerCase();
  const list = (voices || []).filter((v) => v && lang(v));
  const best = (arr, rank) =>
    arr.reduce((pick, v) => {
      const score = (v.localService ? 0 : 10) + rank(lang(v));
      return !pick || score < pick.score ? { v, score } : pick;
    }, null)?.v || null;
  if (isTamil(text)) return best(list.filter((v) => lang(v).startsWith("ta")), () => 0);
  return best(list.filter((v) => /^en(-|$)/.test(lang(v))), (l) => (l === "en-in" ? 0 : l === "en-gb" ? 1 : 2));
}

// Reading answers aloud: on unless the customer turned it off on this device
const READ_KEY = "identee:readAloud";
export const readReadAloud = () => {
  try {
    return localStorage.getItem(READ_KEY) !== "0";
  } catch {
    return true;
  }
};
export const saveReadAloud = (on) => {
  try {
    localStorage.setItem(READ_KEY, on ? "1" : "0");
  } catch {
    /* private window: the choice lasts until the page is closed */
  }
};

/* ---------- the words typed in the chat box, kept until sent (13 Nov 2026) ---------- */
// One box per garment's room (room = the garment key), for the chat it was typed in: closing the Assistant, a reload or
// an accidental exit doesn't lose them. Tested in tests/typedBox.test.mjs.
export const TYPED_KEY = (room) => `identee:typed:v1:${room}`;
export const readTyped = (room, chatId) => {
  try {
    const v = JSON.parse(localStorage.getItem(TYPED_KEY(room)) || "null");
    return v && v.chatId === chatId && typeof v.text === "string" ? v.text : "";
  } catch {
    return "";
  }
};
export const keepTyped = (room, chatId, text) => {
  try {
    const v = JSON.parse(localStorage.getItem(TYPED_KEY(room)) || "null");
    if (!text && v?.chatId !== chatId) return; // a new, empty chat leaves the other chat's words alone
    if (!text) localStorage.removeItem(TYPED_KEY(room));
    else localStorage.setItem(TYPED_KEY(room), JSON.stringify({ chatId, text: String(text) }));
  } catch {
    /* private window: the words last until the page is closed */
  }
};

/* ---------- size from height and weight ---------- */
export const SIZE_LIMITS = { height: [90, 215], weight: [10, 170] };
// the numbers typed in the size card: both needed, both believable
export function sizeAnswers({ who, heightCm, weightKg }) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  const ok = h >= SIZE_LIMITS.height[0] && h <= SIZE_LIMITS.height[1] && w >= SIZE_LIMITS.weight[0] && w <= SIZE_LIMITS.weight[1];
  return ok ? { who: ["men", "women", "kids"].includes(who) ? who : "men", heightCm: h, weightKg: w } : null;
}

/* ---------- orders in the chat ---------- */
export const ORDER_WORDS = { CREATED: "Placed", CONFIRMED: "Being made", PACKED: "Packed", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURN_APPROVED: "Return approved", RETURN_COMPLETED: "Returned" };
export const orderNo = (o) => o?.invoiceNumber || String(o?._id || "").slice(-6).toUpperCase();
// the design of the customer's own that an order holds (its id), or ""
export const ownDesignId = (order) => {
  const item = (order?.orderItems || []).find((i) => i.customization);
  return item ? String(item.customization?._id || item.customization) : "";
};
// "the same tee again": the order named ("0076", "IDT-0076"), else the newest one with a design of their own
export function findOrder(orders, no) {
  const own = (orders || []).filter((o) => ownDesignId(o));
  const want = String(no || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!want) return own[0] || null;
  const key = (o) => orderNo(o).replace(/[^a-z0-9]/gi, "").toLowerCase();
  return own.find((o) => key(o) === want) || own.find((o) => key(o).endsWith(want) || String(o._id).toLowerCase().endsWith(want)) || null;
}

/* ---------- the group link ---------- */
// our own picture as the server keeps it ("/uploads/ai/x.png"), whatever address it was shown from; else ""
export const uploadPath = (url) => (String(url || "").match(/\/uploads\/[\w\-./]+$/) || [""])[0];
// what friends vote on: the newest concept sheet in the chat (its picture and its numbered concepts), or nothing
export function voteFromSheet(sheet) {
  const picture = uploadPath(sheet?.url);
  const options = (sheet?.concepts || []).map((c) => ({ n: c.n, title: c.title })).filter((o) => o.n > 0);
  return picture && options.length > 1 ? { picture, options } : { picture: "", options: [] };
}
export const groupLink = (origin, token) => `${String(origin || "").replace(/\/+$/, "")}/g/${token}`;
// the concept most friends picked; null while nobody voted or two are level
export function voteLeader(options) {
  const sorted = [...(options || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!sorted.length || !sorted[0].votes) return null;
  if (sorted[1] && sorted[1].votes === sorted[0].votes) return null;
  return sorted[0];
}
// the friends' answers as tees with a name each (a size the tee doesn't come in becomes the size chosen now)
export function playersFromEntries(entries, sizes, sizeNow) {
  return (entries || [])
    .filter((e) => String(e?.name || "").trim())
    .map((e) => ({ name: String(e.name).trim(), number: String(e.number || "").trim(), size: e.size && (sizes || []).includes(e.size) ? e.size : sizeNow }));
}
// the friends' answers as a count per size ({ M: 2, L: 1 }); `skipped` = answers whose size the tee doesn't come in
export function qtysFromEntries(entries, sizes) {
  const qtys = {};
  let skipped = 0;
  for (const e of entries || []) {
    if (e?.size && (sizes || []).includes(e.size)) qtys[e.size] = Math.min(99, (qtys[e.size] || 0) + 1);
    else skipped += 1;
  }
  return { qtys, skipped };
}
