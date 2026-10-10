// studio/assistantScript.js
//
// What the design assistant says and does. This version is free to run: the
// replies are written here (no AI call). A paid text AI can later replace
// replyTo() while keeping the same message shapes (see docs/AI_PLAN.md).
//
// Message shapes (drawn by Assistant.jsx):
//   { from: "bot" | "me", text }
//   { chips: [labels] }            tap-able answers
//   { slogans: [lines] }           each with "Add to tee" (all stay usable)
//   { issues: [...] }              design-check findings, each with a fix
//   { inks: [hex] }                ink colours to try
//   { act: { type, ... } }         something for the page to do (not shown)
import { SLOGANS, TONES, occasionIn, personalLines, slogansFor, toneIn } from "./assistantSlogans";
import { TEMPLATES } from "./designTemplates";

const MENU = ["Slogan ideas", "Start from a template", "Check my design", "More help"];
const MORE = ["Colour help", "Where to print", "Size help", "Remove a background", "Make a design"];
const AFTER_SLOGANS = ["Show more", "Add a name or year", "Change tone", "Something else"];
const PRINT_FOR = {
  "A small logo": [["left-chest", "right-chest", "left-sleeve"], "A small logo sits best on the chest or a sleeve."],
  "A big picture": [["centre-front", "full-front", "full-back"], "A big picture needs a big area: the front or the back."],
  "A team name": [["top-back", "full-back", "centre-front"], "A team name reads best across the top of the back, or large on the front."],
  "Name and number": [["full-back", "centre-back"], "A name and number go on the back, with the number large in the middle."],
  "Down the side": [["vertical-front", "front-right-vertical", "vertical-back"], "Text running down the tee uses one of the tall, narrow areas."],
};
const NOT_ALLOWED = /logo of|nike|adidas|puma|marvel|disney|celebr|actor|actress|cricketer|footballer/i;

const bot = (text) => ({ from: "bot", text });
const chips = (list) => ({ chips: list });
const act = (a) => ({ act: a });
export const firstMessages = () => [bot("Hi. Tell me what you have in mind, or pick a starting point."), chips(MENU)];
export const firstState = () => ({ occasion: null, tone: null, shown: 0, wait: null, template: null });

const showSlogans = (st, ctx, lead) => [bot(lead || `${st.tone} lines for a ${st.occasion.toLowerCase()} tee. Tap one to put it on ${ctx.areaLabel}.`), { slogans: slogansFor(st.occasion, st.tone, st.shown) }, chips(AFTER_SLOGANS)];

// The design check as chat messages (also used when Review is pressed).
export function checkMessages(issues, { beforeReview = false } = {}) {
  if (!issues.length) return [bot("I checked your design: pictures are sharp, text is readable and everything is inside its print area. Good to go."), chips(beforeReview ? ["Continue to review"] : MENU)];
  return [
    bot(beforeReview ? `Before you review, ${issues.length === 1 ? "one thing" : `${issues.length} things`} would not print well:` : `I found ${issues.length === 1 ? "one thing" : `${issues.length} things`} that would not print well:`),
    { issues },
    chips(beforeReview ? ["Continue to review"] : ["Check again", "Something else"]),
  ];
}

/**
 * @param text  what the customer tapped or typed
 * @param ctx   { areaLabel, teeName, hasDesign, sizes, sizeNow, chart(size), areas: [{ key, label, free }], issues(), inks }
 * @param st    conversation state (firstState())
 * @returns { out: messages, st: next state }
 */
export function replyTo(text, ctx, st) {
  const t = text.trim();
  const low = t.toLowerCase();
  const wait = st.wait;
  st = { ...st, wait: null };
  const done = (out, patch = {}) => ({ out, st: { ...st, ...patch } });

  /* ----- answers to a question the assistant just asked ----- */
  if (wait === "name" && !MENU.includes(t) && !AFTER_SLOGANS.includes(t)) {
    return done([bot(`With “${t}” in it:`), { slogans: personalLines(st.occasion, t) }, chips(AFTER_SLOGANS)]);
  }
  if (wait === "size" && ctx.sizes.includes(t.toUpperCase())) {
    const usual = t.toUpperCase();
    const i = ctx.sizes.indexOf(usual);
    const row = ctx.chart(usual);
    const smaller = i > 0 ? ctx.sizes[i - 1] : null;
    const fit = row ? ` (chest ${row.chest}″, length ${row.length}″)` : "";
    return done([
      bot(`This tee is cut oversized, so your usual ${usual}${fit} already gives the loose, dropped-shoulder look.${smaller ? ` If you want it closer to a regular fit, go one down to ${smaller}.` : ""}`),
      chips([`Use size ${usual}`, ...(smaller ? [`Use size ${smaller}`] : []), "Something else"]),
    ]);
  }

  /* ----- things the page does ----- */
  const useSize = /^use size (\S+)$/i.exec(t);
  if (useSize && ctx.sizes.includes(useSize[1].toUpperCase())) {
    return done([act({ type: "size", value: useSize[1].toUpperCase() }), bot(`Done. The tee is now size ${useSize[1].toUpperCase()}, and every print area shows its true size for it.`), chips(MENU)]);
  }
  const openArea = /^open (.+)$/i.exec(t);
  const areaToOpen = openArea && ctx.areas.find((a) => a.label.toLowerCase() === openArea[1].toLowerCase());
  if (areaToOpen) return done([act({ type: "area", key: areaToOpen.key })]);
  if (t === "Open the art library") return done([act({ type: "tab", tab: "art" })]);
  if (t === "Upload a picture") return done([act({ type: "tab", tab: "upload" })]);
  if (t === "Continue to review") return done([act({ type: "review" })]);

  /* ----- templates ----- */
  const tpl = TEMPLATES.find((x) => x.label === t);
  if (tpl) {
    if (ctx.hasDesign) return done([bot(`${tpl.label}: ${tpl.says} Your tee already has a design. What should I do?`), chips(["Start fresh", "Add to my design"])], { template: tpl.key });
    return done([act({ type: "template", key: tpl.key, fresh: true }), bot(`Done. ${tpl.says} Tap any text on the print area to change the words.`), chips(["Check my design", "Slogan ideas", "Something else"])]);
  }
  if ((t === "Start fresh" || t === "Add to my design") && st.template) {
    const chosen = TEMPLATES.find((x) => x.key === st.template);
    return done(
      [act({ type: "template", key: chosen.key, fresh: t === "Start fresh" }), bot(`Done. ${chosen.says} Tap any text on the print area to change the words. Not what you wanted? Press Undo (↶).`), chips(["Check my design", "Something else"])],
      { template: null },
    );
  }
  if (t === MENU[1] || /template|layout|jersey|ready.?made design/.test(low)) return done([bot("Pick a layout. I’ll place the text in the right spots and you change the words."), chips(TEMPLATES.map((x) => x.label))]);

  /* ----- design check ----- */
  if (t === MENU[2] || t === "Check again" || /check|will (it|this) print|look good|review my/.test(low)) {
    if (!ctx.hasDesign) return done([bot("There’s nothing on the tee yet. Add some text or a picture and I’ll check it."), chips(MENU)]);
    return done(checkMessages(ctx.issues()));
  }

  /* ----- small helpers ----- */
  if (t === MENU[3] || t === "Something else") return done([bot("What do you need?"), chips([...MENU.slice(0, 3), ...MORE])]);
  if (t === "Colour help" || /colou?r/.test(low)) {
    return done([bot(`On a ${ctx.teeName.toLowerCase()} tee these ink colours stand out best. Tap one to use it for the text on ${ctx.areaLabel}.`), { inks: ctx.inks }, chips(["Something else"])]);
  }
  if (t === "Where to print" || /where (should|do|can) i (print|put)|which (print )?area/.test(low)) return done([bot("What are you printing?"), chips(Object.keys(PRINT_FOR))]);
  if (PRINT_FOR[t]) {
    const [keys, why] = PRINT_FOR[t];
    const open = keys.map((k) => ctx.areas.find((a) => a.key === k && a.free)).filter(Boolean);
    return done([bot(open.length ? why : `${why} Those areas are covered by another print on your tee right now.`), chips([...open.map((a) => `Open ${a.label}`), "Something else"])]);
  }
  if (t === "Size help" || /\bsize\b|which size|fit me/.test(low)) return done([bot("What size do you usually wear in regular tees?"), chips(ctx.sizes)], { wait: "size" });
  if (NOT_ALLOWED.test(t)) {
    return done([bot("I can’t help with brand logos or famous faces — they belong to someone else and can’t be printed. Try an original idea instead."), chips(["Slogan ideas", "Open the art library"])]);
  }
  if (t === "Remove a background" || /background|cut ?out/.test(low)) {
    return done([bot("Upload your picture, tap it on the print area, then press “Remove background” in its settings. It’s free and runs in your browser."), chips(["Upload a picture", "Something else"])]);
  }

  /* ----- slogans ----- */
  if (t === "Show more" && st.occasion) return done(showSlogans({ ...st, shown: st.shown + 3 }, ctx, "Three more:"), { shown: st.shown + 3 });
  if (t === "Add a name or year" && st.occasion) return done([bot("Type the name, team name or year to put in the line.")], { wait: "name" });
  if (t === "Change tone" && st.occasion) return done([bot("Which tone?"), chips(TONES)], { tone: null });
  const occasion = SLOGANS[t] ? t : occasionIn(low);
  const tone = TONES.includes(t) ? t : toneIn(low);
  const asksSlogan = t === MENU[0] || /slogan|quote|tagline|caption|line\b|words|write|text/.test(low);
  if (occasion || tone || asksSlogan) {
    const next = { ...st, occasion: occasion || st.occasion, tone: tone || (occasion ? null : st.tone), shown: 0 };
    if (!next.occasion) return done([bot("Who is the tee for?"), chips(Object.keys(SLOGANS))], next);
    if (!next.tone) return done([bot(`A ${next.occasion.toLowerCase()} tee. Which tone?`), chips(TONES)], next);
    return done(showSlogans(next, ctx), next);
  }

  if (t === "Make a design" || /design|draw|make|picture|art|image|logo/.test(low)) {
    return done([bot("Designs made to order are coming soon. For now, pick from our art library, upload your own picture, or start from a template."), chips(["Open the art library", "Upload a picture", "Start from a template"])]);
  }
  return done([bot("I can help with slogans, layouts, checking your design, colours, print areas and sizes. Pick one to get going."), chips([...MENU.slice(0, 3), ...MORE.slice(0, 3)])]);
}
