// studio/photoIntent.js — what a customer wants made from a photo they sent in the chat, read from their own words.
// Free (no AI): used when the text AI can't read the photo (switched off, out of credit), and as a second opinion.
//   copy      only the print on a garment / object, recreated flat ("I want only this design", "same design")
//   photo     the photo itself, printed (usually without its background) ("print my photo", "as it is")
//   art       the photo redrawn in a style ("my dog as a cartoon")
//   inspired  a new design that takes the look from the photo ("something like this but with a tiger")
//   add       "add this to my tee": made print-ready (the photo, or the copied design if it is a printed garment)
// Returns { job, style, areaKey, change, subject, cutOut } — or null when the words don't say.
// Every job goes to the plan card first: nothing is made until the customer taps Make it.

const ART = [
  ["Cartoon", /\b(cartoon\w*|anime|comic|caricature)\b/],
  ["Sketch", /\b(sketch\w*|pencil|drawing of|line drawing)\b/],
  ["Sticker", /\bstickers?\b/],
  ["Watercolour", /\b(water.?colou?r|painting|painted)\b/],
  ["Pop art", /\bpop.?art\b/],
];
const escapeRe = (x) => x.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

// The print area named in the words ("on the back", "left chest") — the longest name wins ("vertical front" over
// "front"); "the front" / "the back" is that side's main free area. null when none is named.
export function areaFromWords(text, areas = []) {
  const low = String(text || "").toLowerCase();
  const named = areas
    .flatMap((a) => [a.label, a.label.replace(/^shorts\s*[–-]\s*/i, "")].map((n) => ({ a, n: n.toLowerCase() })))
    .sort((x, y) => y.n.length - x.n.length)
    .find(({ n }) => new RegExp(String.raw`\b${escapeRe(n)}\b`).test(low));
  if (named) return named.a.key;
  const side = /\b(on|at|for|to) (the |my )?back\b/.test(low) ? "back" : /\b(on|at|for|to) (the |my )?front\b/.test(low) ? "front" : null;
  return side ? areas.find((a) => a.side === side && a.main && a.free)?.key || areas.find((a) => a.side === side && a.free)?.key || null : null;
}

export function photoJobFrom(text, { areas = [], photoStyles = [] } = {}) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (low.length < 2) return null;
  const areaKey = areaFromWords(t, areas);
  // "add this to my tee on the front", "put it on the back": made print-ready for that area (the plan card shows it
  // ready to go; the customer still taps Make it)
  const addIt = /\b(add|put|place|stick|apply|print)\b.{0,40}\b(on|to|onto|in|at)\b.{0,20}\b(my |the |our )?(tee|t-?shirts?|shirt|top|front|back|chest|sleeves?|it)\b/.test(low) || /^(add|put|place|stick)\s+(this|it|that)\b/.test(low);
  const base = { areaKey, style: null, change: null, subject: null, cutOut: true };

  // a new design that only borrows the look: "like this but with a tiger", "inspired by this"
  const like = /\b(like this|similar to this|something like|inspired by|in (the )?same style|same style as)\b/.test(low);
  const but = /\b(?:but|with|having|showing)\s+(?:a |an |the )?(.{3,})$/i.exec(t);
  if (like && but && !/\b(same|this) (design|print)\b/.test(low)) return { ...base, job: "inspired", subject: but[1].replace(/^with\s+(a |an |the )?/i, "").replace(/\s+(on|at|for) (the )?(front|back|[a-z ]+chest|sleeves?)\b.*$/i, "").trim() };

  // the photo redrawn as art
  const art = ART.find(([name, re]) => photoStyles.includes(name) && re.test(low));
  if (art) return { ...base, job: "art", style: art[0] };

  // only the print, copied ("only the design", "same design", "copy this", "the print on this tee")
  const copy = /\b(only|just) (the |this )?(design|print|logo|graphic|art(work)?|picture on it)\b|\b(same|this|that|the) (design|print|graphic|logo)\b|\bcopy\b|\bextract\b|\b(design|print|logo) (from|on|of) (this|it|the (t-?shirt|tee|hoodie|shirt|cap|poster))\b/.test(low);
  if (copy) {
    // what to change while copying: "… but with KINGS XI", "… change the name to RAJ", "… instead of LIONS"
    const ch = /\b(?:but|except|and)\s+((?:change|replace|make|put|with|use|write)\b.{2,})$/i.exec(t) || /\b((?:change|replace)\b.{2,})$/i.exec(t) || /\b(with\s+(?:the )?(?:name|text|word|number)s?\b.{2,})$/i.exec(t) || /(\S+(?:\s+\S+){0,4}\s+instead of\s+.{2,})$/i.exec(t);
    return { ...base, job: "copy", change: ch ? ch[1].trim().slice(0, 200) : null };
  }

  // the photo itself
  const asPhoto = /\b(as it is|as is|print (this|my|the|our) (photo|picture|pic|image|selfie)|(my|this|our|the) (photo|picture|pic|selfie)\b|remove (the )?background|without (the |its )?background|cut ?out|(photo|picture|pic|selfie)s?)\b/.test(low);
  if (asPhoto) return { ...base, job: "photo", cutOut: !/\bas (it )?is\b|\bwith (the |its )?background\b|\bkeep (the )?background\b/.test(low) };
  // "add this to my tee": made print-ready — the photo itself, unless the photo reading sees a printed garment (then
  // its design is copied). Without the photo reading it is the photo, and the card offers "Copy just the design".
  if (addIt) return { ...base, job: "add" };
  // ("print this" alone could mean the photo or the design on it: asked, not guessed)
  return null;
}
