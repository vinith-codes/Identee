// utils/deliveryDates.js - "when will my tee reach me?" (11 Nov 2026, Assistant round 8)
//
// The Assistant used to send every delivery question to the Shipping & Delivery page. Now the shop sets two numbers
// (Admin -> Settings -> AI designs: making days, shipping days) and the dates are worked out HERE, not by the AI:
// an AI counting working days gets them wrong. Working days are Monday to Saturday, as the Shipping & Delivery page
// says. Public holidays are not known here, so every date is an estimate and the Assistant says so.
const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// today in India, as a UTC-midnight date (so the UTC getters give the Indian calendar day wherever the server runs)
export const indiaDay = (now = new Date()) => {
  const d = new Date(new Date(now).getTime() + IST_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

// n working days after `day` (Sundays are skipped; the day itself is not counted)
export function addWorkingDays(day, n) {
  let d = new Date(day);
  let left = Math.max(0, Math.round(Number(n) || 0));
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (d.getUTCDay() !== 0) left -= 1;
  }
  return d;
}

export const dayWords = (d) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

// when an order placed on `day` should arrive: made in makingDays, then shippingDays on the road
export const arrivesBy = (day, makingDays, shippingDays) => addWorkingDays(addWorkingDays(day, makingDays), shippingDays);

/**
 * What the Assistant is told about delivery. `orderOn` is a ready table for the next two weeks, so "I need it by the
 * 28th" is a look-up (the last row that arrives in time), not arithmetic.
 */
export function deliveryFact({ makingDays = 4, teamMakingDays = 7, shippingDays = 7 } = {}, now = new Date()) {
  const today = indiaDay(now);
  const rows = [];
  for (let i = 0; i < 14; i += 1) {
    const day = new Date(today.getTime() + i * DAY_MS);
    rows.push({ order: dayWords(day), arrivesBy: dayWords(arrivesBy(day, makingDays, shippingDays)), teamArrivesBy: dayWords(arrivesBy(day, teamMakingDays, shippingDays)) });
  }
  return {
    today: dayWords(today),
    makingWorkingDays: makingDays,
    teamMakingWorkingDays: teamMakingDays,
    shippingWorkingDays: shippingDays,
    orderToday: { leavesUsBy: dayWords(addWorkingDays(today, makingDays)), arrivesBy: rows[0].arrivesBy },
    teamOrderToday: { leavesUsBy: dayWords(addWorkingDays(today, teamMakingDays)), arrivesBy: rows[0].teamArrivesBy },
    orderOn: rows,
    note: "Working days are Monday to Saturday. These are the latest likely dates, estimates and not promises; a public holiday adds a day.",
  };
}
