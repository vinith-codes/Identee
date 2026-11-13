// studio/teeSide.js — "Try it on me" and "Photo of it worn" in Review: which side of the tee goes to the picture AI
// (13 Nov 2026, feedback 7: a photo of the customer's back was always dressed in the FRONT print).
//
// Review's four pictures follow SIDES in DesignRoomPage.jsx: [0] the front, [1] the back, [2] left, [3] right.

// The picture of that side of the tee, or null while there isn't one (a picture that couldn't be taken). Never the
// other side instead: a back photo with the front print is the very mistake this fixes.
export const teePicture = (shots, side) => shots?.[side === "back" ? 1 : 0]?.url || null;

// Photo of it worn. sides: the sides that have a print (a Set).
//   printed on the front and the back -> "ask" (the customer picks)
//   printed on the back only          -> "back" (it used to show a plain tee from the front)
//   anything else (front, sleeves)    -> "front", as before
export const wornSideFor = (sides) => {
  const front = sides?.has?.("front");
  const back = sides?.has?.("back");
  if (front && back) return "ask";
  return back ? "back" : "front";
};
