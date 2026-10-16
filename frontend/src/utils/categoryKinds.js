// utils/categoryKinds.js — which shop a category belongs to (Admin → Categories has a tab for each).
//   kind "customizable" → Design your own (/customizable)
//   kind "readymade"    → the ready-made shop (/ready-made)
// A category saved before the split has no kind yet: it behaves the old way — in Design your own when its
// "Customizable" switch is on, and in the ready-made shop as well.
export const isDesignYourOwn = (c) => (c.kind ? c.kind === "customizable" : !!c.isCustomizable);
export const isReadyMade = (c) => (c.kind ? c.kind === "readymade" : true);
