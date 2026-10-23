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
//   { designs: [url] }             pictures the image AI made, each with "Add to tee"
//   { from: "me", photo, text }    a photo the customer sent with 📎 ({ url, w, h }), with their words if any
//   { plan: { items, style } }     the plan card (PlanCard.jsx): what will be drawn, where, in which style — nothing
//                                  is drawn (or charged) until the customer taps Draw (act "drawPlan")
//   { examples: true }             the list of things the assistant can do (EXAMPLES)
//   { act: { type, ... } }         something for the page to do (not shown)
//
// "Make a design" is the one paid part: the page asks the server, which asks
// the image AI (act type "generate"). Everything else here is free.
import { SLOGANS, TONES, occasionIn, personalLines, slogansFor, toneIn } from "./assistantSlogans";
import { TEMPLATES } from "./designTemplates";
import { parsePlayers, playerLabel } from "./teamOrder";
import { styleIn } from "./styleInfo";
import { areasFromWords } from "./photoIntent";

const MENU = ["Slogan ideas", "Start from a template", "Check my design", "More help"];
const MORE_PHOTO = "Photo to art";
const MORE_STYLE = "Style it for me";
const TEAM_ORDER = "Team order";
const ADD_PLAYERS = "Add my players";
// "Improve my idea" in the chat (see st.idea): make it clear first (free), then draw
export const IMPROVE = "✨ Improve my idea";
export const DRAW_THIS = "Use the improved idea";
export const DRAW_MINE = "Use my own words";
// (old chats kept in the browser may still show this chip: it now leads to the plan card)
export const IN_DRAW_TAB = "Open in the Draw tab";
// the plan card's "Not now": nothing is drawn
export const NOT_NOW = "Not now";
// a photo sent with 📎 (st.photo): what to do with it — the first two are free
export const PHOTO_AS_IS = "Put it on my tee as it is";
export const PHOTO_CUT = "Remove the background first";
export const PHOTO_ART = "Turn it into art";
// a photo of a printed tee / hoodie / poster: only its design, copied flat (1 request)
export const PHOTO_COPY = "Copy just the design from it";
// how much a customer may type in the chat (the server allows the same): 2,000 characters ≈ 300 words, plenty for
// a detailed idea — it only stops something pasted by mistake (a whole page) from being sent
export const PROMPT_MAX = 2000;
export const PHOTO_CHOICES = [PHOTO_COPY, PHOTO_AS_IS, PHOTO_CUT, PHOTO_ART];
// after art (or a copied design) was made from the photo: back to the photo itself, on the same areas (free)
export const PHOTO_REVERT = "Use my photo instead · free";
// Ways back, so the customer is never stuck: every question has one of these (or "Something else").
export const BACK = "← Back";
export const CHANGE_IDEA = "Change my idea";
export const CANCEL = "Cancel";
const KEEP_DESIGN = "Keep my design";
const KEEP_EDITING = "Keep editing";
const OUT = "Something else";
const orOut = (list) => chips([...list, OUT]);
const MOODS = ["Royal", "Sporty", "Cute", "Minimal", "Retro", "Bold"];
const MORE = ["Colour help", "Where to print", "Size help", MORE_PHOTO, MORE_STYLE, "Remove a background", "Make a design", IMPROVE];
const AFTER_SLOGANS = ["Show more", "Add a name or year", "Change tone", "Something else"];
const PRINT_FOR = {
  "A small logo": [["left-chest", "right-chest", "left-sleeve"], "A small logo sits best on the chest or a sleeve."],
  "A big picture": [["centre-front", "full-front", "full-back"], "A big picture needs a big area: the front or the back."],
  "A team name": [["top-back", "full-back", "centre-front"], "A team name reads best across the top of the back, or large on the front."],
  "Name and number": [["full-back", "centre-back"], "A name and number go on the back, with the number large in the middle."],
  "Down the side": [["vertical-front", "front-right-vertical", "vertical-back"], "Text running down the tee uses one of the tall, narrow areas."],
  "On the shorts": [["left-leg", "right-leg"], "A shorts print goes on the front of a leg, left or right."],
};
const escapeRe = (x) => x.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
// What the customer may call a print area: its name, and for the shorts' areas also without "Shorts –" ("left leg").
const areaNames = (a) => [...new Set([a.label, a.label.replace(/^shorts\s*[–-]\s*/i, "")].map((n) => n.toLowerCase()))];
// The print area named in a message, and the name used (the longest name wins: "vertical front" over "front").
const namedArea = (areas, low) =>
  (areas || [])
    .flatMap((a) => areaNames(a).map((name) => ({ a, name })))
    .sort((x, y) => y.name.length - x.name.length)
    .find(({ name }) => new RegExp(String.raw`\b${escapeRe(name)}\b`).test(low)) || null;
// "a tiger on the left leg": what to draw (without the area's name) and the area it is for.
// Two areas named ("Naruto on the front and Ben 10 on the back"): the words stay whole and multi is set — that is
// one picture per area, so it goes to the planner (or Improve), never one picture for one area.
const subjectAndArea = (t, areas) => {
  if (areasFromWords(t, areas).length > 1) return { subject: t, areaKey: null, multi: true };
  const hit = namedArea(areas, t.toLowerCase());
  if (!hit) return { subject: t, areaKey: null };
  const subject = t.replace(new RegExp(String.raw`\s*\b((on|in|at|for|to) )?(the )?${escapeRe(hit.name)}( area)?\b`, "i"), " ").replace(/\s+/g, " ").trim();
  return { subject: subject.length >= 2 ? subject : t, areaKey: hit.a.key };
};
// what an idea is kept as while it waits (Improve / Use my own words / Change my idea)
const ideaOf = (said) => ({ subject: said.subject, areaKey: said.areaKey, ...(said.multi ? { multi: true } : {}), improved: null });

export const bot = (text) => ({ from: "bot", text });
export const chips = (list) => ({ chips: list });
const AFTER_DESIGNS = ["Make more", "Something else"];
// words that mean "change what is on my tee" (handled by the text AI, see studio/aiOps.js)
const EDIT_WORDS = /\b(bigger|larger|smaller|tiny|huge|move|shift|delete|remove|erase|rotate|tilt|curve|curved|straight|vertical|bold|italic|underline|centre|center|align|resize|shrink|enlarge|increase|decrease|reduce|colou?r|font|outline|spacing|duplicate|copy|swap|rename|capitals?|uppercase|lowercase|change|restyle|style|look|make (it|the|this|that|my|them)|set (it|the|this)|put|add|write|insert|type|replace)\b/;
const STARTS_NEW = /^(make|draw|generate|create|design|give)( me)? (a|an|some|new|another)\b/;
const act = (a) => ({ act: a });
// What the assistant can do, shown as soon as it opens (customers cannot guess what to type).
// fill: the example is put in the message box so they can see how to ask, change it and send.
// Without fill, tapping it starts that feature straight away.
export const EXAMPLES = [
  { title: "Design the whole tee in one sentence", hint: "Up to three pictures at once: front, back, a sleeve", say: "A tiger on the front and a tree on the back, on a black t-shirt", fill: true, needs: "pictures" },
  { title: "Draw a picture for me", hint: "You pick the style and where it goes before anything is drawn", say: "Draw a lion holding a cricket bat", fill: true, needs: "pictures" },
  { title: "✨ Improve my idea", hint: "Say it your way: a picture, words, where each goes. I’ll show what you’ll get before drawing (free)", say: IMPROVE, needs: "idea" },
  { title: "Turn my photo into art", hint: "Cartoon, sketch, sticker and more", say: "Photo to art", needs: "pictures" },
  { title: "Turn words into lettering art", say: "Hand lettering that says “Work smarter not harder”", fill: true, needs: "pictures" },
  { title: "Write a slogan", say: "A slogan for my mother", fill: true },
  { title: "Change things by telling me", say: "Make the text gold, curved and a bit bigger", fill: true, needs: "text" },
  { title: "Style my text for a mood", hint: "Royal, sporty, cute, minimal…", say: "Style it for me", needs: "text" },
  { title: "Order for a team", hint: "A different name and number on each tee", say: TEAM_ORDER },
  { title: "Start from a ready layout", hint: "Team jersey, birthday, couple tee…", say: "Start from a template" },
  { title: "Check my design before printing", hint: "Blurry pictures, tiny text, colours that won’t show", say: "Check my design" },
];
const HELLO = "Hi. I can design your tee with you. Tap one to try it, or type what you want in your own words.";
export const firstMessages = () => [bot(HELLO), { examples: true }, chips(["More help"])];
export const firstState = () => ({ occasion: null, tone: null, shown: 0, wait: null, template: null, subject: null, areaKey: null, lastDesign: null, changeUrl: null, ask: null, said: [], photoUrl: null, idea: null, backTo: null, backIdea: null, photo: null });
// after slogans the AI wrote
export const AFTER_AI_SLOGANS = ["Show more", "Change tone", "Something else"];
export const AFTER_DESIGN_CHIPS = AFTER_DESIGNS;

// The plan card for pictures to draw. areaKey: the area named, if it is free — else the open one, else the main
// front area, else the first free one (the customer can change it on the card). style: the one named in their own
// words ("a realistic tiger"), else the first.
const PLAN_SAYS = "Here’s my plan. Check where it goes and pick a style, then tap Draw. Nothing is drawn until then.";
const areaForPlan = (ctx, key) => {
  const free = (k) => k && (ctx.areas || []).some((a) => a.key === k && a.free);
  return [key, ctx.activeKey].find(free) || (ctx.areas || []).find((a) => a.free && a.main && a.side === "front")?.key || (ctx.areas || []).find((a) => a.free)?.key || null;
};
const planFor = (ctx, subject, areaKey, { style, improvable = false, label } = {}) => ({
  plan: { items: [{ subject, areaKey: areaForPlan(ctx, areaKey), ...(label ? { label } : {}) }], style: style || styleIn(subject, ctx.ai.styles) || ctx.ai.styles[0], improvable },
});
// an idea in the customer's own words as the plan card: one picture, or — when it names more than one area and the
// text AI is there — the planner splits it into one picture per area (act "edit" shows the same plan card)
const ideaPlan = (ctx, idea, opts) =>
  idea.multi && ctx.ai.text ? [act({ type: "edit", message: idea.subject })] : [bot(PLAN_SAYS), planFor(ctx, idea.subject, idea.areaKey, opts)];

/* ----- the smart Assistant (23 Oct 2026): typed messages read by Google's text AI (server: /api/ai/chat) -----
   replyTo() below stays exactly as it was: it answers every tap, every answer to a question it just asked, and any
   typed message when the smart chat is off or fails. */

// the words of a button: typed exactly, they get that button's own answer (not the smart chat)
const BUTTON_WORDS = new Set([...MENU, ...MORE, TEAM_ORDER, ADD_PLAYERS, BACK, CHANGE_IDEA, CANCEL, NOT_NOW, DRAW_THIS, DRAW_MINE, IN_DRAW_TAB, KEEP_DESIGN, KEEP_EDITING, OUT, ...PHOTO_CHOICES, PHOTO_REVERT, ...AFTER_SLOGANS, "Make more", "What can you do?", "Log in", "Continue to review", "Start fresh", "Add to my design", "Check again", "Upload a photo", "Use the picture on my tee", ...TEMPLATES.map((x) => x.label)]);

/** Whether a TYPED message goes to the smart chat (taps never do). */
export function smartCanAnswer(text, ctx, st) {
  if (!ctx?.ai?.smart) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  // the script just asked something (a size, a slogan topic, what to draw, what to do with the photo …): this is
  // the answer to its own question
  if (st?.wait) return false;
  if (t.startsWith(IMPROVE)) return false; // the ✨ button
  if (BUTTON_WORDS.has(t) || /^(use size \S+|open .+)$/i.test(t)) return false;
  // a pasted player list: one tee per player (the script reads names, numbers and sizes exactly)
  const list = parsePlayers(t, ctx.sizes || [], ctx.sizeNow);
  if (list.length >= 2 && list.every((p) => p.name && p.number)) return false;
  return true;
}

/** The plan card for pictures the smart chat suggested ([{ subject, area }]): nothing is drawn until Draw is tapped. */
export function smartPlan(ctx, pictures, style) {
  const items = [];
  for (const p of pictures || []) {
    if (!p?.subject) continue;
    // each picture on its own free area (the one named, else the next free one)
    const taken = items.map((x) => x.areaKey);
    const named = (ctx.areas || []).some((a) => a.key === p.area && a.free && !taken.includes(a.key)) ? p.area : null;
    const areaKey = named || areaForPlan({ ...ctx, areas: (ctx.areas || []).filter((a) => !taken.includes(a.key)) }, null);
    items.push({ subject: p.subject, areaKey });
  }
  if (!items.length) return [];
  const styles = ctx.ai?.styles || [];
  return [bot(PLAN_SAYS), { plan: { items: items.slice(0, 3), style: styles.includes(style) ? style : styleIn(items[0].subject, styles) || styles[0] } }];
}

const showSlogans = (st, ctx, lead) => [bot(lead || `${st.tone} lines for a ${st.occasion.toLowerCase()} tee. Tap one to put it on ${ctx.areaLabel}.`), { slogans: slogansFor(st.occasion, st.tone, st.shown) }, chips(AFTER_SLOGANS)];

// The design check as chat messages (also used when Review is pressed).
export function checkMessages(issues, { beforeReview = false } = {}) {
  if (!issues.length) return [bot("I checked your design: pictures are sharp, text is readable and everything is inside its print area. Good to go."), chips(beforeReview ? ["Continue to review"] : MENU)];
  return [
    bot(beforeReview ? `Before you review, ${issues.length === 1 ? "one thing" : `${issues.length} things`} would not print well:` : `I found ${issues.length === 1 ? "one thing" : `${issues.length} things`} that would not print well:`),
    { issues },
    chips(beforeReview ? ["Continue to review", KEEP_EDITING] : ["Check again", "Something else"]),
  ];
}

/**
 * @param text  what the customer tapped or typed
 * @param ctx   { areaLabel, teeName, hasDesign, sizes, sizeNow, chart(size), areas: [{ key, label, free }], issues(), inks,
 *                ai: { available, reason, loggedIn, left, styles, photoStyles, text },   text = the text AI is on
 *                photoOnTee,    the address of an uploaded picture on the tee, if any
 *                hasText,       there is at least one text item on the tee
 *                hasRoles }     a text is marked as the player's name / number (team orders)
 * @param st    conversation state (firstState())
 * @param opts  { tapped }  true when the customer tapped a choice instead of typing
 * @returns { out: messages, st: next state }
 */
export function replyTo(text, ctx, st, { tapped = false } = {}) {
  const t = text.trim();
  const low = t.toLowerCase();
  const wait = st.wait;
  st = { ...st, wait: null };
  const done = (out, patch = {}) => ({ out, st: { ...st, ...patch } });

  /* ----- ways back ----- */
  // "Something else" also drops whatever was half-asked (an idea, a layout, a change, a photo)
  const clean = { idea: null, template: null, changeUrl: null, photoUrl: null, backTo: null };
  if (t === BACK) {
    if (st.backTo === "idea" && st.backIdea) {
      const idea = st.backIdea;
      return done(
        [bot(`Your idea: “${idea.improved?.prompt || idea.subject}”. What should I do with it?`), orOut(idea.improved ? [DRAW_THIS, DRAW_MINE, CHANGE_IDEA] : [IMPROVE, DRAW_MINE, CHANGE_IDEA])],
        { ...clean, idea, backIdea: null },
      );
    }
    if (st.backTo === "occasion") return done([bot("Who is the tee for?"), orOut(Object.keys(SLOGANS))], { ...clean, occasion: null, tone: null });
    if (st.backTo === "photoChoice" && st.photo) return done([bot("What should I do with your photo?"), orOut(PHOTO_CHOICES)], clean);
    if (st.backTo === "photo") return done([bot("Which photo should I redraw?"), orOut(["Upload a photo", ...(ctx.photoOnTee ? ["Use the picture on my tee"] : [])])], clean);
    return done([bot("What do you need?"), chips(["What can you do?", ...MENU.slice(0, 3), ...MORE])], clean);
  }
  // a photo just sent without words: what is typed next says what to make from it (read with the photo)
  if (st.photo && wait === "photoWhat" && !tapped && t.length >= 2 && t !== OUT) return done([act({ type: "photoUnderstand", text: t })]);
  if (t === NOT_NOW) return done([bot("OK, nothing was drawn. Tell me whenever you want to try again."), chips(MENU)], clean);
  if (t === CANCEL && wait === "aiChange") return done([bot("OK, I left that design as it is."), chips(AFTER_DESIGNS)], { changeUrl: null });
  if (t === KEEP_DESIGN && st.template) return done([bot("OK, I left your design as it is."), chips(MENU)], { template: null });
  if (t === KEEP_EDITING) return done([bot("OK. Change what you like, then press Review again — or ask me to check it."), chips(["Check again", "Something else"])]);
  // "Change my idea": the idea goes back into the message box to be changed and sent again
  if (t === CHANGE_IDEA && (st.idea || st.backIdea)) {
    const idea = st.idea || st.backIdea;
    return done([bot("Change anything you like in the box below and send it again. I’ll make it clear before drawing."), { fill: idea.subject }, chips([OUT])], { ...clean, wait: "idea" });
  }

  /* ----- team order: one tee per player, each with their own name and number ----- */
  const list = tapped ? [] : parsePlayers(t, ctx.sizes, ctx.sizeNow);
  // a name and a number each — or only names when the tee has a name but no number (office / event layouts)
  const namesOnly = ctx.roles?.name && !ctx.roles?.number;
  if (list.length >= 2 && list.every((p) => p.name && (p.number || namesOnly))) {
    if (!ctx.hasRoles) {
      return done([bot("That looks like a team list. First the tee needs a place for the name and the number: start with the Team jersey layout, then send me the list again."), orOut(["Team jersey"])]);
    }
    // the list has names (or numbers) but the tee has no text set to carry them
    const lacks = [!ctx.roles?.name && "name", !ctx.roles?.number && list.some((p) => p.number) && "number"].filter(Boolean);
    const missing = lacks.length && ctx.roles ? ` Note: no text on the tee is set as the player’s ${lacks[0]}, so the ${lacks[0]}s won’t be printed. Tap that text and use “Ordering for a team?” at the bottom of its settings.` : "";
    const names = list.slice(0, 4).map((p) => `${playerLabel(p)} (${p.size})`).join(", ");
    return done([
      act({ type: "players", players: list }),
      bot(
        ctx.players > 0
          ? `Added ${list.length} players to the ${ctx.players} already on your list (anyone listed twice is skipped): ${names}${list.length > 4 ? " and more" : ""}. Remove anyone you don’t want in the player list.${missing}`
          : `Done. ${list.length} players, one tee each: ${names}${list.length > 4 ? " and more" : ""}. In Review, tap a player to see their tee.${missing}`,
      ),
      orOut(["Continue to review", "Check my design"]),
    ]);
  }
  if (t === TEAM_ORDER || t === ADD_PLAYERS || /team order|each player|per player|every player|different (name|number)/.test(low)) {
    if (!ctx.hasRoles) {
      return done([bot("One design, with a different name and number on each tee. Start with the Team jersey layout (or tap a text and use “Ordering for a team?” at the bottom of its settings)."), orOut(["Team jersey"])]);
    }
    return done([bot("Send me your players as name, number and size, one per line or separated by commas, like this: Arun 7 L, Karthik 10 XL. Every player gets their own tee with the same design. You can also fill the list in Review."), chips(["Continue to review", "Something else"])]);
  }

  /* ----- answers to a question the assistant just asked ----- */
  if (wait === "name" && !MENU.includes(t) && !AFTER_SLOGANS.includes(t) && t !== "Something else") {
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

  /* ----- the design maker's questions ----- */
  const offTopic = MENU.includes(t) || MORE.includes(t) || t === "Something else";
  if (wait === "aiSubject" && !offTopic) {
    return done([bot("Which style?"), orOut(ctx.ai.styles)], { ...subjectAndArea(t, ctx.areas), wait: "aiStyle" });
  }
  const typedStyle = wait === "aiStyle" ? ctx.ai.styles.find((s) => s === t || low.includes(s.toLowerCase())) : null;
  if (typedStyle) {
    const job = { subject: st.subject, style: typedStyle, ...(st.areaKey ? { areaKey: st.areaKey } : {}) };
    return done([act({ type: "generate", ...job })], { lastDesign: job });
  }
  if (wait === "drawWhat" && !offTopic && t.length >= 2) {
    const said = subjectAndArea(t.replace(/^(please )?(can you |could you )?(draw|design|make|create|generate)( me)?( an?| the| some)?\s+/i, ""), ctx.areas);
    return done(ideaPlan(ctx, said, { improvable: !!ctx.ai.text }), { idea: ideaOf(said) });
  }
  if (wait === "aiChange" && !offTopic && st.changeUrl) {
    return done([act({ type: "generate", baseUrl: st.changeUrl, change: t })], { changeUrl: null });
  }
  if (t === "Make more" && st.lastDesign) return done([act({ type: "generate", ...st.lastDesign })]);

  /* ----- "Improve my idea": a drawing idea typed in the chat (st.idea), made clear by the text AI before any
     picture request is spent. The preview says what the customer will get; nothing is drawn until they say so. ----- */
  if (st.idea) {
    const ai = ctx.ai;
    const better = st.idea.improved;
    // (already improved: tapping it again asks for a new idea, below)
    if (t === IMPROVE && !better) return done([act({ type: "improve", idea: st.idea.subject, areaKey: st.idea.areaKey })]);
    if ((t === DRAW_THIS || t === IN_DRAW_TAB) && better) {
      const style = ai.styles.includes(better.style) ? better.style : null;
      // (more than one picture: each on its own area, as the improved idea said)
      if (better.pictures?.length > 1) return done([bot(PLAN_SAYS), { plan: { items: better.pictures.map((p) => ({ subject: p.prompt, areaKey: p.areaKey || p.area || null })), style: style || ai.styles[0] } }]);
      return done([bot(PLAN_SAYS), planFor(ctx, better.prompt, better.area || st.idea.areaKey, { style })]);
    }
    if (t === DRAW_MINE || t === IN_DRAW_TAB) {
      return done(ideaPlan(ctx, st.idea, { improvable: !better && !!ai.text }), better ? { idea: { ...st.idea, improved: null } } : {});
    }
  }
  // "✨ Improve my idea" on its own (the examples, More help, the button above the message box): ask for the idea,
  // then make it clear. From the button with something typed it comes as "✨ Improve my idea: <the idea>".
  const typedIdea = t.startsWith(`${IMPROVE}:`) ? t.slice(IMPROVE.length + 1).trim() : "";
  if (t === IMPROVE || typedIdea) {
    const ai = ctx.ai;
    if (!ai.available || !ai.text) return done([bot("Improving ideas is not available right now. Describe your picture in your own words and I’ll draw it."), chips(["Make a design", "Something else"])]);
    if (typedIdea.length >= 3) {
      const idea = subjectAndArea(typedIdea, ctx.areas);
      return done([act({ type: "improve", idea: idea.subject, areaKey: idea.areaKey })], { idea: ideaOf(idea) });
    }
    return done([bot("Tell me your idea in your own words: what to draw, any words on it, and where each part goes. For example: “Vijay’s face at the top and the name VIJAY in bold letters at the bottom left”. I’ll make it clear and show you what you’ll get before anything is drawn."), chips([OUT])], { wait: "idea", idea: null });
  }
  if (wait === "idea" && !offTopic && t.length >= 3) {
    const idea = subjectAndArea(t, ctx.areas);
    return done([act({ type: "improve", idea: idea.subject, areaKey: idea.areaKey })], { idea: ideaOf(idea) });
  }
  if (t === "Log in") return done([act({ type: "login" })]);

  /* ----- slogans written to order (the text AI) -----
     When it is available the customer can ask for a slogan about anything, in
     their own words. The page asks the server (act "slogans") and remembers
     the lines shown (st.said) so "Show more" brings new ones. If it is not
     available, the built-in library further down answers instead. */
  if (ctx.ai.text) {
    const menuWord = MENU.includes(t) || MORE.includes(t) || t === "Something else";
    const ask = (about, tone, fresh) => done([act({ type: "slogans", ask: about, tone, avoid: fresh ? [] : st.said })], { ask: about, tone: tone || null, ...(fresh ? { said: [] } : {}) });
    if (wait === "sloganTopic" && !menuWord) return ask(t, null, true);
    if (t === "Show more" && st.ask) return ask(st.ask, st.tone, false);
    if (t === "Change tone" && st.ask) return done([bot("Which tone?"), orOut(TONES)], { wait: "sloganTone" });
    if (wait === "sloganTone" && TONES.includes(t)) return ask(st.ask, t, false);
    if (t === MENU[0]) return done([bot("What is it about? Say it in your own words, or pick one."), orOut(["My mother", "Our cricket team", "A birthday", "A college farewell", "A family trip"])], { wait: "sloganTopic" });
  }

  /* ----- a photo sent with 📎 (st.photo): on the tee as it is, without its background (both free), or as art ----- */
  if (st.photo && t === PHOTO_COPY) return done([act({ type: "photoUnderstand", text: "", job: "copy" })]);
  if (st.photo && t === PHOTO_AS_IS) return done([act({ type: "photoPlace", cutOut: false })]);
  if (st.photo && t === PHOTO_CUT) return done([act({ type: "photoPlace", cutOut: true })]);
  if (st.photo && t === PHOTO_REVERT) return done([act({ type: "photoMake", job: "photo", cutOut: true, areaKeys: st.photoLastKeys || [] })]);
  if (st.photo && t === PHOTO_ART) {
    // art needs the AI (there are no free looks any more): without it, the free choices for the photo itself
    if (!(ctx.ai.available && ctx.ai.loggedIn && ctx.ai.left !== 0)) {
      return done([bot(!ctx.ai.loggedIn ? "Log in to turn your photo into art." : ctx.ai.left === 0 ? "You’ve used today’s AI requests, so art has to wait until tomorrow. You can still put your photo on, free:" : "Turning photos into art isn’t available right now. You can still put your photo on, free:"), chips([...(ctx.ai.loggedIn ? [PHOTO_CUT, PHOTO_AS_IS] : ["Log in"]), BACK])], { backTo: "photoChoice" });
    }
    return done([bot("Which style? Each one uses 1 request."), chips([...(ctx.ai.photoStyles || []), BACK])], { photoUrl: st.photo.url, wait: "photoStyle", backTo: "photoChoice" });
  }

  /* ----- photo to art (the image AI redraws the customer's own photo) ----- */
  if (wait === "photoStyle" && st.photoUrl && (ctx.ai.photoStyles || []).includes(t)) {
    return done([act({ type: "generate", photoUrl: st.photoUrl, artStyle: t })], { photoUrl: null });
  }
  if (t === "Upload a photo") return done([act({ type: "photoPick" })]);
  if (t === "Use the picture on my tee" && ctx.photoOnTee) return done([bot("Which style?"), chips([...ctx.ai.photoStyles, BACK])], { photoUrl: ctx.photoOnTee, wait: "photoStyle", backTo: "photo" });
  if (t === MORE_PHOTO || /(photo|picture|pic|selfie).*(cartoon|sketch|sticker|art|drawing|painting)|(cartoon|sketch|sticker|drawing|painting).*(of|from) (my|this|a) (photo|picture|pic)|photo to art/.test(low)) {
    const ai = ctx.ai;
    if (!ai.available) return done([bot("Turning photos into art is not available right now. You can still upload your photo as it is."), chips(["Upload a picture", "Something else"])]);
    if (!ai.loggedIn) return done([bot("I can redraw your photo as a cartoon, a sketch or a sticker. Log in first so it is kept for you."), chips(["Log in", "Something else"])]);
    if (ai.left === 0) return done([bot("You’ve used today’s design requests. They reset tomorrow. Until then you can put your photo on the tee as it is."), chips(["Upload a picture", "Something else"])]);
    return done([bot("Send me a photo of a person, a pet or anything you like, and I’ll redraw it as art for your tee."), orOut(["Upload a photo", ...(ctx.photoOnTee ? ["Use the picture on my tee"] : [])])]);
  }

  /* ----- words as a picture: a slogan or quote drawn as hand lettering (the image AI) -----
     "God is my only belief as an image", "typography that says …", "a quote design: …".
     Not for "add text that says …" — that is real text on the tee, handled further down. */
  const LETTERING = "Hand lettering";
  const asPicture = /\b(typography|lettering|hand.?lettered|calligraphy|word ?art|text art|quote (design|art|image|picture|poster))\b|\b(as|into|in) (an? )?(image|picture|design|art|artwork|poster)\b|\b(design|image|picture|art|poster|badge)( with (the )?(words|text|quote))? (that|which) (says?|reads?)\b/.test(low);
  if (asPicture && !tapped && !/^(add|write|put|type|insert)\b/.test(low) && (ctx.ai.styles || []).includes(LETTERING)) {
    const ai = ctx.ai;
    if (!ai.available) return done([bot("Drawing words as art is not available right now. You can add them as text and style them: tap “Add text”, then ask me to “Style it for me”."), chips(["Something else"])]);
    if (!ai.loggedIn) return done([bot("I can draw those words as lettering art. Log in first so your designs are kept for you."), chips(["Log in", "Something else"])]);
    if (ai.left === 0) return done([bot("You’ve used today’s design requests. They reset tomorrow. Until then you can add the words as text and style them."), chips([MORE_STYLE, "Slogan ideas", "Something else"])]);
    // the words: what is in quotation marks, else the sentence without the asking part
    const quoted = /[“"‘']([^”"’']{2,160})[”"’']/.exec(t);
    // a print area named in the message ("… in vertical front"): the design is made for that area, and the
    // area's name is not part of what to draw
    const hit = namedArea(ctx.areas, low);
    const named = hit?.a;
    const label = hit ? escapeRe(hit.name) : "";
    const unArea = (x) => (named ? x.replace(new RegExp(String.raw`\s*\b((on|in|at|for|to) )?(the )?` + label + String.raw`( area)?\b`, "i"), " ") : x);
    const said = (quoted ? quoted[1] : unArea(t))
      .replace(/^(please )?(i (want|need|would like)|can you|could you|make|draw|create|generate|give me|design|write)( me)?( an?| the)?\s+/i, "")
      .replace(/\b(as|into|in) (an? )?(image|picture|design|art|artwork|poster)\b.*$/i, "")
      .replace(/^(an? |the )?((hand.?lettered|brush|bold|retro|elegant|simple) )*(typography|lettering|calligraphy|word ?art|text art|quote|design|image|picture|art|poster|badge)( design| art| image| picture| poster)?( with (the )?(words|text|quote))?( (that|which) (says?|reads?))?[:,]?\s*/i, "")
      .replace(/^(the )?(text|words?|quote|slogan|line|saying|phrase)[:,]?\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (said.length < 2) return done([bot("Which words should I draw? Type them, for example: “Work smarter not harder” as an image."), chips(["Something else"])]);
    // More than words: a picture of something AND words, or where each goes ("the vijay image at the top and the
    // text VIJAY as an image at the bottom left"). Lettering the whole sentence drew the instructions themselves,
    // so such a request goes to "Improve my idea" — it shows what will be drawn before a request is used.
    const mixed = !quoted && (/\b(image|picture|photo|portrait|drawing|illustration|logo|face|cartoon|sketch)\b/.test(said.toLowerCase()) || /\b(top|bottom|left|right|cent(re|er)|middle|below|above|under(neath)?)\b|\band (the )?(text|words?|name)\b/.test(said.toLowerCase()));
    if (mixed) {
      const idea = subjectAndArea(t, ctx.areas);
      if (ai.text) {
        return done(
          [bot("That’s a picture and words together. Let me make the idea clear first — it’s free, and I’ll show you what you’ll get before drawing."), orOut([IMPROVE, DRAW_MINE])],
          { idea: ideaOf(idea), wait: null },
        );
      }
      return done([bot(PLAN_SAYS), planFor(ctx, idea.subject, idea.areaKey, { style: LETTERING })]);
    }
    // anything else they asked for (a crown, rays, colours) stays in the request as written
    const job = { subject: quoted ? `${unArea(t.replace(quoted[0], "")).replace(/\s+/g, " ").trim()} — the words to letter, spelled exactly: “${said}”` : `the words “${said}”, spelled exactly`, style: LETTERING, ...(named ? { areaKey: named.key } : {}) };
    return done([bot(PLAN_SAYS), planFor(ctx, job.subject, job.areaKey, { style: LETTERING, label: `“${said}” as lettering art` })]);
  }

  /* ----- the stylist: fonts, colours and shape chosen together for a mood (the text AI) ----- */
  if (ctx.ai.text && (t === MORE_STYLE || MOODS.includes(t))) {
    if (!ctx.hasText) return done([bot("Add some text first, then I can style it for you."), orOut(["Slogan ideas", "Start from a template"])]);
    if (t === MORE_STYLE) return done([bot("What mood should the text have? Pick one, or type your own (elegant, spooky, beach…)."), orOut(MOODS)]);
    return done([act({ type: "edit", message: `Restyle all the text on the tee to look ${t.toLowerCase()}` })]);
  }
  // sharper / recoloured pictures are done from the picture's own settings
  if (/\b(blurry|blurred|pixelated|sharper|sharpen|clearer|low quality|recolou?r)\b/.test(low) && !tapped) {
    return done([bot("Tap the picture on the print area, then press “Make it sharper” or “Recolour for this tee” in its settings."), chips(["Something else"])]);
  }

  /* ----- edit the tee by chat (the text AI) -----
     "make the text gold", "move the logo to the back", "delete the tagline".
     Tapped choices never come here — only something the customer typed. */
  const words = t.split(/\s+/).length;
  const aboutWords = /background|slogan|quote|tagline|caption|ideas?/.test(low);
  if (ctx.ai.text && ctx.hasDesign && !tapped && words >= 2 && EDIT_WORDS.test(low) && !STARTS_NEW.test(low) && !aboutWords) {
    return done([act({ type: "edit", message: t })]);
  }
  // A whole request in one sentence — "a tiger on the front and a tree on the back, on a black t-shirt" —
  // also goes to the text AI, which can set the tee colour and ask for a picture per print area.
  if (ctx.ai.text && !tapped && words >= 7 && !aboutWords && /\b(front|back|sleeves?|chest|t-?shirt|tee|shorts|legs?|co-?ord)\b/.test(low)) {
    return done([act({ type: "edit", message: t })]);
  }

  /* ----- things the page does ----- */
  const useSize = /^use size (\S+)$/i.exec(t);
  if (useSize && ctx.sizes.includes(useSize[1].toUpperCase())) {
    return done([act({ type: "size", value: useSize[1].toUpperCase() }), bot(`Done. The tee is now size ${useSize[1].toUpperCase()}, and every print area shows its true size for it.`), chips(MENU)]);
  }
  const openArea = /^open (.+)$/i.exec(t);
  const areaToOpen = openArea && ctx.areas.find((a) => areaNames(a).includes(openArea[1].toLowerCase()));
  if (areaToOpen) return done([act({ type: "area", key: areaToOpen.key })]);
  if (t === "Open the art library") return done([act({ type: "tab", tab: "art" })]);
  if (t === "Upload a picture") return done([act({ type: "tab", tab: "upload" })]);
  if (t === "Continue to review") return done([act({ type: "review" })]);

  /* ----- templates ----- */
  const tpl = TEMPLATES.find((x) => x.label === t);
  if (tpl) {
    if (ctx.hasDesign) return done([bot(`${tpl.label}: ${tpl.says} Your tee already has a design. What should I do?`), chips(["Start fresh", "Add to my design", KEEP_DESIGN])], { template: tpl.key });
    return done([act({ type: "template", key: tpl.key, fresh: true }), bot(`Done. ${tpl.says} Tap any text on the print area to change the words.`), chips(tpl.key === "team" ? [ADD_PLAYERS, "Check my design", "Something else"] : ["Check my design", "Slogan ideas", "Something else"])]);
  }
  if ((t === "Start fresh" || t === "Add to my design") && st.template) {
    const chosen = TEMPLATES.find((x) => x.key === st.template);
    return done(
      [act({ type: "template", key: chosen.key, fresh: t === "Start fresh" }), bot(`Done. ${chosen.says} Tap any text on the print area to change the words. Not what you wanted? Press Undo (↶).`), chips(chosen.key === "team" ? [ADD_PLAYERS, "Check my design", "Something else"] : ["Check my design", "Something else"])],
      { template: null },
    );
  }
  if (t === MENU[1] || /template|layout|jersey|ready.?made design/.test(low)) return done([bot("Pick a layout. I’ll place the text in the right spots and you change the words."), orOut(TEMPLATES.map((x) => x.label))]);

  /* ----- design check ----- */
  if (t === MENU[2] || t === "Check again" || /check|will (it|this) print|look good|review my/.test(low)) {
    if (!ctx.hasDesign) return done([bot("There’s nothing on the tee yet. Add some text or a picture and I’ll check it."), chips(MENU)]);
    return done(checkMessages(ctx.issues()));
  }

  /* ----- small helpers ----- */
  if (t === "What can you do?" || /what can you do|how (do|can) (i|you)|help me|what.*(features|options)/.test(low)) return done([bot("Here’s what I can do. Tap one to try it."), { examples: true }, chips(["More help"])]);
  if (t === MENU[3] || t === "Something else") return done([bot("What do you need?"), chips(["What can you do?", ...MENU.slice(0, 3), ...MORE])], clean);
  if (t === "Colour help" || /colou?r/.test(low)) {
    return done([bot(`On a ${ctx.teeName.toLowerCase()} tee these ink colours stand out best. Tap one to use it for the text on ${ctx.areaLabel}.`), { inks: ctx.inks }, chips(["Something else"])]);
  }
  // only the kinds of print this garment has areas for (a crop top has no tall strips; only the co-ord set has shorts)
  const hasAreaFor = (k) => PRINT_FOR[k][0].some((key) => ctx.areas.some((a) => a.key === key));
  if (t === "Where to print" || /where (should|do|can) i (print|put)|which (print )?area/.test(low)) return done([bot("What are you printing?"), orOut(Object.keys(PRINT_FOR).filter(hasAreaFor))]);
  if (PRINT_FOR[t]) {
    const [keys, why] = PRINT_FOR[t];
    const has = keys.map((k) => ctx.areas.find((a) => a.key === k)).filter(Boolean);
    const open = has.filter((a) => a.free);
    const note = !has.length ? " This garment doesn’t have those areas." : !open.length ? " Those areas are covered by another print right now." : "";
    return done([bot(`${why}${note}`), chips([...open.map((a) => `Open ${a.label}`), "Something else"])]);
  }
  if (t === "Size help" || /\bsize\b|which size|fit me/.test(low)) return done([bot("What size do you usually wear in regular tees?"), orOut(ctx.sizes)], { wait: "size" });
  if (t === "Remove a background" || /background|cut ?out/.test(low)) {
    return done([bot("Upload your picture, tap it on the print area, then press “Remove background” in its settings. It’s free and runs in your browser."), chips(["Upload a picture", "Something else"])]);
  }

  /* ----- make a design (the image AI) ----- */
  // asked before slogans: "draw a lion with a cricket bat" is a picture, not a cricket slogan
  const wordsWanted = /slogan|quote|tagline|caption|\bline\b|\bwords\b|\btext\b/.test(low);
  // ("art" and "hand lettering" too, also misspelt: "hukum in handlettring art at the top")
  const wantsDesign = t === "Make a design" || (!wordsWanted && /\b(design|draw|drawing|picture|image|logo|artwork|art|illustrat\w*|mascot|hand.?lett?e?ring|lettering)\b/.test(low));
  if (wantsDesign) {
    const ai = ctx.ai;
    if (!ai.available) {
      const why = ai.reason === "cap" ? "The design maker is taking a break until next month." : "Designs made to order are coming soon.";
      return done([bot(`${why} For now, pick from our art library, upload your own picture, or start from a template.`), orOut(["Open the art library", "Upload a picture", "Start from a template"])]);
    }
    if (!ai.loggedIn) return done([bot("I can draw a design from your description. Log in first so your designs are kept for you."), chips(["Log in", "Something else"])]);
    if (ai.left === 0) return done([bot("You’ve used today’s design requests. They reset tomorrow. Until then, try the art library or upload a picture."), orOut(["Open the art library", "Upload a picture"])]);
    // what was typed ("draw a lion holding a bat on the back") becomes the plan card; nothing typed yet: ask
    const said = t !== "Make a design" && t.split(/\s+/).length >= 3 ? subjectAndArea(t.replace(/^(please )?(can you |could you )?(draw|design|make|create|generate)( me)?( an?| the| some)?\s+/i, ""), ctx.areas) : { subject: "", areaKey: null };
    if (!said.subject) {
      return done([bot("What should I draw? Say it in your own words, and where it goes if you like. For example: a lion holding a cricket bat on the back."), chips([OUT])], { wait: "drawWhat" });
    }
    // (✨ Improve my idea on the card makes it clearer first, free, when the text AI is there)
    return done(ideaPlan(ctx, said, { improvable: !!ai.text }), { idea: ideaOf(said), wait: null });
  }

  /* ----- slogans ----- */
  if (t === "Show more" && st.occasion) return done(showSlogans({ ...st, shown: st.shown + 3 }, ctx, "Three more:"), { shown: st.shown + 3 });
  if (t === "Add a name or year" && st.occasion) return done([bot("Type the name, team name or year to put in the line."), chips(["Something else"])], { wait: "name" });
  if (t === "Change tone" && st.occasion) return done([bot("Which tone?"), chips([...TONES, BACK])], { tone: null, backTo: "occasion" });
  if (ctx.ai.text && /slogan|quote|tagline|caption|\bline\b|\bwords\b|\bsaying\b/.test(low) && t.split(/\s+/).length >= 3) {
    return done([act({ type: "slogans", ask: t, avoid: [] })], { ask: t, tone: toneIn(low), said: [] });
  }
  const occasion = SLOGANS[t] ? t : occasionIn(low);
  const tone = TONES.includes(t) ? t : toneIn(low);
  const asksSlogan = t === MENU[0] || /slogan|quote|tagline|caption|line\b|words|write|text/.test(low);
  if (occasion || tone || asksSlogan) {
    const next = { ...st, occasion: occasion || st.occasion, tone: tone || (occasion ? null : st.tone), shown: 0 };
    if (!next.occasion) return done([bot("Who is the tee for?"), orOut(Object.keys(SLOGANS))], next);
    if (!next.tone) return done([bot(`A ${next.occasion.toLowerCase()} tee. Which tone?`), chips([...TONES, BACK])], { ...next, backTo: "occasion" });
    return done(showSlogans(next, ctx), next);
  }

  if (ctx.ai.text && !tapped) return done([act({ type: "edit", message: t })]);
  return done([bot("I can help with slogans, layouts, checking your design, colours, print areas and sizes. Pick one to get going."), orOut([...MENU.slice(0, 3), ...MORE.slice(0, 3)])]);
}
