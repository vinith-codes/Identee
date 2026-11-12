// services/groupPoll.js — the group link's rules, kept apart from the database so they can be tested
// (11 Nov 2026, Assistant round 8; models/groupPollModel.js)
export const MAX_ENTRIES = 99; // the Design Room's own limit on tees in one team order

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// the votes per choice: [{ n, title, votes }], and how many friends answered
export const tally = (poll) => {
  const entries = poll.entries || [];
  return {
    count: entries.length,
    options: (poll.options || []).map((o) => ({ n: o.n, title: o.title, votes: entries.filter((e) => e.vote === o.n).length })),
  };
};

// what anyone with the link may see: the picture, the choices, the counts. Never the names.
export const publicView = (poll) => ({
  token: poll.token,
  title: poll.title,
  garment: poll.garment,
  picture: poll.picture,
  sizes: poll.sizes,
  askNumber: poll.askNumber,
  closed: Boolean(poll.closedAt),
  full: (poll.entries || []).length >= MAX_ENTRIES,
  ...tally(poll),
});

// a friend's answer, checked against the link's own sizes and choices: { entry } or { error }
export const cleanEntry = (body, poll) => {
  const name = clip(body?.name, 24);
  if (name.length < 1) return { error: "Please type your name." };
  const size = clip(body?.size, 12);
  if ((poll.sizes || []).length && !poll.sizes.includes(size)) return { error: "Please pick your size." };
  const number = poll.askNumber ? String(body?.number ?? "").replace(/[^0-9]/g, "").slice(0, 4) : "";
  const asked = Number(body?.vote);
  const vote = (poll.options || []).some((o) => o.n === asked) ? asked : null;
  if ((poll.options || []).length && vote === null) return { error: "Please pick the design you like." };
  return { entry: { name, size, number, vote } };
};

// what the owner may ask friends to choose from and fill in
export const cleanGroup = (body, { ourUpload = () => false } = {}) => {
  const picture = body?.picture && ourUpload(String(body.picture)) ? String(body.picture) : "";
  const options = (Array.isArray(body?.options) ? body.options : [])
    .map((o) => ({ n: Number(o?.n), title: clip(o?.title, 60) }))
    .filter((o) => Number.isInteger(o.n) && o.n > 0)
    .slice(0, 6);
  const sizes = [...new Set((Array.isArray(body?.sizes) ? body.sizes : []).map((s) => clip(s, 12)).filter(Boolean))].slice(0, 20);
  return {
    title: clip(body?.title, 80),
    garment: clip(body?.garment, 60),
    picture,
    options: picture ? options : [], // nothing to look at = nothing to vote on
    sizes,
    askNumber: Boolean(body?.askNumber),
  };
};
