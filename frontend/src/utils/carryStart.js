// utils/carryStart.js — the home page's ways in ("Your words", "Your photo", "Describe it"…) first go to
// "choose your T-shirt" (/customizable); what the customer tapped travels along to the Design Room.
const STARTS = ["text", "draw", "art", "upload"];

// "&start=text" / "&photo=1" (or "") from the address of the choice page — only known values
export const carryFrom = (params) => {
  const start = params.get("start");
  return `${STARTS.includes(start) ? `&start=${start}` : ""}${params.get("photo") === "1" ? "&photo=1" : ""}`;
};

// the idea typed on the home page (router state), kept while the customer picks the T-shirt
export const ideaFrom = (location) => (typeof location.state?.idea === "string" ? location.state.idea : "");
