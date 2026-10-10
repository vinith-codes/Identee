// studio/designTemplates.js
//
// Ready-made layouts the assistant can place in one tap. Each item says
// which print area it prefers (first one the garment offers and that is
// free), the placeholder words, the letter size in cm and where its middle
// sits (y, % down the area). The customer then changes the words.

const YEAR = new Date().getFullYear();

export const TEMPLATES = [
  {
    key: "team",
    label: "Team jersey",
    says: "A small team name on the chest, and the team name, player name and number on the back.",
    items: [
      { areas: ["left-chest"], text: "TEAM NAME", cm: 1.6, y: 50 },
      { areas: ["full-back", "centre-back"], text: "TEAM NAME", cm: 4, y: 12 },
      { areas: ["full-back", "centre-back"], text: "PLAYER", cm: 2.6, y: 32 },
      { areas: ["full-back", "centre-back"], text: "07", cm: 20, y: 66 },
    ],
  },
  {
    key: "birthday",
    label: "Birthday squad",
    says: "Three lines on the front.",
    items: [
      { areas: ["centre-front", "full-front"], text: "BIRTHDAY", cm: 3, y: 24 },
      { areas: ["centre-front", "full-front"], text: "SQUAD", cm: 8, y: 50 },
      { areas: ["centre-front", "full-front"], text: `EST. ${YEAR}`, cm: 2, y: 78 },
    ],
  },
  {
    key: "class",
    label: "Class of",
    says: "The year large on the front, with a small line under it.",
    items: [
      { areas: ["centre-front", "full-front"], text: "CLASS OF", cm: 3, y: 24 },
      { areas: ["centre-front", "full-front"], text: String(YEAR), cm: 10, y: 52 },
      { areas: ["centre-front", "full-front"], text: "the last benchers", cm: 2.2, y: 82, font: "Pacifico" },
    ],
  },
  {
    key: "couple",
    label: "Couple tee",
    says: "Two bold lines and a handwritten one on the front.",
    items: [
      { areas: ["centre-front", "full-front"], text: "TOGETHER", cm: 4.5, y: 30 },
      { areas: ["centre-front", "full-front"], text: `SINCE ${YEAR}`, cm: 3, y: 50 },
      { areas: ["centre-front", "full-front"], text: "you & me", cm: 3, y: 74, font: "Pacifico" },
    ],
  },
  {
    key: "trip",
    label: "Trip tee",
    says: "The place and year on the front, with a small line under it.",
    items: [
      { areas: ["centre-front", "full-front"], text: `GOA ${YEAR}`, cm: 7, y: 40 },
      { areas: ["centre-front", "full-front"], text: "same gang, new memories", cm: 1.8, y: 66, font: "Montserrat" },
    ],
  },
  {
    key: "minimal",
    label: "Minimal brand",
    says: "A small name on the chest and a small line across the top of the back.",
    items: [
      { areas: ["left-chest"], text: "your brand", cm: 1.5, y: 50, font: "Montserrat" },
      { areas: ["top-back", "full-back"], text: `EST. ${YEAR}`, cm: 2, y: 50, font: "Montserrat" },
    ],
  },
];
