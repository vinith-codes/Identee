// scripts/assistantWalk.mjs — walks the Assistant v2 brain through many kinds of customer messages and prints what
// it would do (Phase 4 of docs/ASSISTANT_V2_PLAN.md). Every reply must say something, and every step must be one the
// page can run. Nothing is drawn: the brain only decides; sheets and pieces are never requested here.
//
//   node scripts/assistantWalk.mjs --direct                      the stand-in brain (AI_CHAT_PROVIDER=mock), no cost
//   node scripts/assistantWalk.mjs --url http://127.0.0.1:5099 --token <jwt> [--only 1-12]
//                                                                 a running backend (the real brain when its key is set:
//                                                                 about ₹0.30 a message, nothing drawn)
import process from "process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((x) => x.length));
const direct = Boolean(args.direct);
const areas = [
  { key: "centre-front", label: "Centre front", free: true },
  { key: "left-chest", label: "Left chest", free: true },
  { key: "full-back", label: "Full back", free: true },
  { key: "left-sleeve", label: "Left sleeve", free: true },
  { key: "right-sleeve", label: "Right sleeve", free: true },
];
const styles = ["Bold mascot", "Cartoon", "Minimal line", "Hand lettering", "Realistic", "Anime"];
const facts = { garment: "Oversized Tee", teeColour: "Black", teeColours: ["White", "Black", "Mustard Yellow", "Red", "Maroon", "Olive"], size: "M", sizes: ["S", "M", "L", "XL", "2XL"], price: 699, wasPrice: 999, pictureAddOn: 100, shipping: "₹100 shipping, free from 3 pieces", offer: "Extra 10% off at checkout with code IDENTEE10", picturesLeft: 20, canDraw: true, pieces: 1 };
const emptyTee = { teeColour: "Black", items: [] };
const teeWithText = { teeColour: "Black", items: [{ id: "t1", type: "text", text: "VORTEX", area: "full-back", colour: "#ffffff", font: "Bebas Neue", size: "large" }, { id: "p1", type: "image", about: "a neon spiral vortex", area: "centre-front" }] };
const oneSheet = [{ n: 1, brief: "college fest tee for club Vortex", concepts: [{ n: 1, title: "Cosmic Swirl" }, { n: 2, title: "Cyber Glitch" }, { n: 3, title: "Street Graffiti" }], developed: [] }];

// [message, what we expect (a step kind, "ask", "none" = words only, or "any"), design, sheets]
const WALK = [
  ["create t-shirt designs for identee with front back and sleeve print", "concepts"],
  ["I need a tee for my college fest, our club is Vortex", "concepts|ask"],
  ["designs for my cricket team Thunder, name on the back with number 7, something fierce on the front, sponsor Raj Sports on the sleeve", "concepts|ask"],
  ["more options", "concepts", emptyTee, oneSheet],
  ["show me 3 more", "concepts", emptyTee, oneSheet],
  ["2", "develop", emptyTee, oneSheet],
  ["3 and 1 suit me", "develop", emptyTee, oneSheet],
  ["the second one but only the front", "develop", emptyTee, oneSheet],
  ["I like 2 but put the swirl on the back instead", "develop|edit|ask", emptyTee, oneSheet],
  ["draw a lion holding a cricket bat", "concepts"],
  ["just draw a lion holding a cricket bat, quickly", "draw"],
  ["draw a lion on the front and a tiger on the back", "concepts|draw"],
  ["hand lettering that says Work smarter not harder", "draw"],
  ["make the text gold", "edit", teeWithText],
  ["make it bigger and curved", "edit", teeWithText],
  ["move the vortex a bit up", "edit", teeWithText],
  ["change the tee to maroon", "edit", teeWithText],
  ["delete the back text", "edit", teeWithText],
  ["this looks dull", "edit|concepts|ask|none", teeWithText],
  ["put my name on it", "ask", teeWithText],
  ["my name is Vinith, put it under the vortex", "edit", teeWithText],
  ["add number 7 on the back", "edit", teeWithText],
  ["a slogan for my mother", "slogans"],
  ["funny caption about Monday", "slogans"],
  ["which size am I, I am 5 ft 8 and 72 kg", "menu|none"],
  ["how much is this tee", "none"],
  ["when will it reach Madurai", "none"],
  ["can I return it", "none"],
  ["which colours print well on black", "none|menu"],
  ["Arun 7 L, Karthik 10 XL, Deepak 3 M", "menu|none"],
  ["team order", "menu|ask|none"],
  ["undo", "undo"],
  ["no, go back", "undo|ask"],
  ["what can you do", "none"],
  ["hi", "none"],
  ["thanks", "none"],
  ["what is the capital of France", "none"],
  ["enakku oru fest tee venum, club name Vortex", "concepts|ask"],
  ["idha konjam periya pannu", "edit", teeWithText],
  ["எனக்கு ஒரு டீ-ஷர்ட் டிசைன் வேணும், கிரிக்கெட் டீம்", "concepts|ask"],
  ["text ah gold ah mathu", "edit", teeWithText],
  ["make me a complete design for my startup Nexora, logo on the chest, website on the back", "concepts|ask"],
  ["avengers design", "concepts|ask"],
  ["something for my dad's 60th birthday", "concepts|ask"],
  ["I don't like any of these", "concepts|ask|none", emptyTee, oneSheet],
  ["different style, more minimal", "concepts", emptyTee, oneSheet],
  ["can you make it in Tamil letters", "edit|ask", teeWithText],
  ["put the same design on the sleeve too", "edit|develop|ask", teeWithText],
  ["remove everything and start again", "edit|ask", teeWithText],
  ["is the picture good enough to print", "menu|none", teeWithText],
  ["photo to art", "menu"],
  ["I want to upload my own logo", "menu"],
  ["show my pictures", "menu"],
  ["skip", "any", emptyTee, oneSheet],
  ["you decide", "any", emptyTee, oneSheet],
  ["4", "develop|ask|none", emptyTee, oneSheet],
  ["99", "ask|none", emptyTee, oneSheet],
  ["make it look like a 90s cassette tape", "concepts|draw|edit|ask"],
  ["I have 0 pictures left what can I do", "none"],
  ["price for 5 tees", "none"],
  ["continue to review", "menu"],
];

const only = args.only ? String(args.only).split("-").map(Number) : null;
let brain;
if (direct) {
  process.env.AI_CHAT_PROVIDER = "mock";
  brain = (await import("../services/assistantBrain.js")).brainReply;
} else if (!args.url || !args.token) {
  console.error("Use --direct, or --url <backend> --token <jwt>");
  process.exit(2);
}
const ask = async (message, design, sheets, history) => {
  if (direct) return brain({ message, history, design, facts, areas, styles, sheets });
  const r = await fetch(`${args.url}/api/ai/assist`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.token}` }, body: JSON.stringify({ message, history, design, facts, areas, sheets }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${j?.message || ""}`);
  return j;
};
let bad = 0;
const history = [];
for (let i = 0; i < WALK.length; i++) {
  if (only && (i + 1 < only[0] || i + 1 > (only[1] || only[0]))) continue;
  const [message, expect, design = emptyTee, sheets = []] = WALK[i];
  const t0 = Date.now();
  let res;
  try {
    res = await ask(message, design, sheets, history.slice(-6));
  } catch (e) {
    console.log(`${String(i + 1).padStart(2)}. ✗ ${message}\n    ERROR ${e.message}`);
    bad++;
    continue;
  }
  const kinds = (res.steps || []).map((s) => s.type);
  const got = kinds.length ? kinds.join("+") : "none";
  const okKind = expect === "any" || expect.split("|").some((k) => (k === "none" ? !kinds.length : kinds.includes(k)));
  const okReply = Boolean(res.reply && res.reply.trim());
  const askOk = !kinds.includes("ask") || (res.steps.at(-1).type === "ask" && res.steps.at(-1).options?.length >= 1);
  const ok = okKind && okReply && askOk;
  if (!ok) bad++;
  console.log(`${String(i + 1).padStart(2)}. ${ok ? "✓" : "✗"} ${message}  [${got}${okKind ? "" : ` — wanted ${expect}`}] ${Date.now() - t0} ms`);
  console.log(`    ${(res.reply || "(no reply)").replace(/\s+/g, " ").slice(0, 160)}`);
  for (const s of res.steps || []) {
    const brief = s.type === "concepts" ? s.concepts.map((c) => c.title).join(" / ") : s.type === "develop" ? `picks ${s.picks.join(",")}${s.pieces ? ` pieces ${s.pieces.join(",")}` : ""}` : s.type === "ask" ? `${s.question} [${(s.options || []).join(" | ")}]` : s.type === "draw" ? `${s.subject} @ ${s.area} (${s.style})` : s.type === "edit" ? s.message : s.type === "slogans" ? s.about : s.type === "menu" ? s.item : "";
    console.log(`    → ${s.type}: ${brief.slice(0, 150)}`);
  }
  if (res.chips?.length) console.log(`    chips: ${res.chips.join(" · ")}`);
  history.push({ who: "customer", text: message }, { who: "assistant", text: res.reply || "" });
}
console.log(`\n${WALK.length - bad} of ${only ? "the chosen" : WALK.length} messages fine, ${bad} to look at.`);
process.exit(bad ? 1 : 0);
