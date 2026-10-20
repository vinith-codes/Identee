// studio/photoIntent.js — what a customer wants made from a photo they sent in the chat, read from their own words.
// Free (no AI): used when the text AI can't read the photo (switched off, out of credit), and as a second opinion.
//   copy      only the print on a garment / object, recreated flat ("I want only this design", "same design")
//   photo     the photo itself, printed (usually without its background) ("print my photo", "as it is")
//   art       the photo redrawn in a style ("my dog as a cartoon")
//   inspired  a new design that takes the look from the photo ("something like this but with a tiger")
// Returns { job, style, areaKey, change, subject, cutOut } — or null when the words don't say.

const ART = [
  ["Cartoon", /\b(cartoon\w*|anime|comic|caricature)\b/],
  ["Sketch", /\b(sketch\w*|pencil|drawing of|line drawing)\b/],
  ["Sticker", /\bstickers?\b/],
  ["Watercolour", /\b(water.?colou?r|painting|painted)\b/],
  ["Pop art", /\bpop.?art\b/],
];
const escapeRe = (x) => x.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

export function photoJobFrom(text, { areas = [], photoStyles = [] } = {}) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (low.length < 2) return null;
  // the print area named ("on the back", "left chest"): the longest name wins ("vertical front" over "front")
  const named = areas
    .flatMap((a) => [a.label, a.label.replace(/^shorts\s*[–-]\s*/i, "")].map((n) => ({ a, n: n.toLowerCase() })))
    .sort((x, y) => y.n.length - x.n.length)
    .find(({ n }) => new RegExp(String.raw`\b${escapeRe(n)}\b`).test(low));
  const side = !named && /\b(on|at|for) (the )?back\b/.test(low) ? "back" : !named && /\b(on|at|for) (the )?front\b/.test(low) ? "front" : null;
  const areaKey = named?.a.key || (side ? areas.find((a) => a.side === side && a.main && a.free)?.key || areas.find((a) => a.side === side && a.free)?.key || null : null);
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
  // ("print this" alone could mean the photo or the design on it: asked, not guessed)
  return null;
}
