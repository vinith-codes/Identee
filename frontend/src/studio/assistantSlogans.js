// studio/assistantSlogans.js
//
// The design assistant's slogan library: 12 occasions × 4 tones. Free to run
// (no AI call). When a text-AI key is added later, these stay as the instant
// suggestions and the AI writes extra ones to order (docs/AI_PLAN.md).

export const TONES = ["Funny", "Bold", "Emotional", "Simple"];

// occasion -> [funny, bold, emotional, simple], three lines each
export const SLOGANS = {
  "Cricket team": [
    ["Sixes only, no singles", "We bat. We bowl. We blame the pitch.", "Catch drops, spirits don’t"],
    ["Play hard. Finish harder.", "Built for the last over", "No mercy between the wickets"],
    ["Eleven hearts, one team", "For the love of the game", "Win or lose, we walk off together"],
    ["Game on", "One team", "Est. on the pitch"],
  ],
  "Gym team": [
    ["Leg day survivor", "Will lift for biryani", "My warm-up is your workout"],
    ["No days off", "Stronger than yesterday", "Earned, not given"],
    ["One more rep for the old me", "Sweat is how the body says thanks", "Showed up when it was hard"],
    ["Lift. Rest. Repeat.", "Train daily", "Made in the gym"],
  ],
  "College fest": [
    ["Made in the back bench", "One fest. Zero sleep.", "Attendance low, energy high"],
    ["Class of chaos", "Loud, proud and on stage", "We run this campus"],
    ["These days, forever", "Friends first, degrees later", "The best years, in one tee"],
    ["Fest mode", "Campus crew", "Batch pride"],
  ],
  "Farewell": [
    ["Finally free (please don’t call us)", "Last bench, first in our hearts", "Degree loading… memories saved"],
    ["We came. We passed. We’re out.", "The legends are leaving", "Seniors forever"],
    ["Not goodbye, just see you later", "Same roads end, same hearts stay", "We grew up here"],
    ["Signing off", "The last batch", "Until next time"],
  ],
  Birthday: [
    ["Cake first, plans later", "Older, not wiser", "Level up, same nonsense"],
    ["Birthday squad", "Main character today", "It’s my day. Deal with it."],
    ["Another lap round the sun", "Grateful for every year", "Made of good years and better people"],
    ["Level up day", "Birthday mode", "One year better"],
  ],
  Wedding: [
    ["Here for the food", "Team bride (and the buffet)", "He said yes to the dress budget"],
    ["Bride squad", "Groom gang", "The wedding crew"],
    ["Two families, one story", "Happily ever starts here", "Forever begins today"],
    ["Just married", "Wedding crew", "Better together"],
  ],
  "Bachelor party": [
    ["One last trip before permission slips", "Groom’s bad decisions crew", "What happens here stays in the group chat"],
    ["The groom’s army", "Last night of freedom", "Bride tribe"],
    ["Brothers before the big day", "Before the vows, the memories", "My people, one last ride"],
    ["Groom squad", "Bride tribe", "The last hurrah"],
  ],
  "Couple tees": [
    ["She’s the boss. I just live here.", "His snacks are my snacks", "Still arguing about what to eat"],
    ["Power couple", "Partners in everything", "Us against the world"],
    ["Home is wherever you are", "My favourite person", "You, me, always"],
    ["Together", "Mine", "You and me"],
  ],
  "Family trip": [
    ["Are we there yet", "Same bus, same madness", "One family, forty opinions"],
    ["Family on tour", "Trip mode on", "Bags packed, phones off"],
    ["Making memories together", "The best view is all of us", "Roads end, family doesn’t"],
    ["Family trip", "On tour", "Together again"],
  ],
  "Friends trip": [
    ["Planned in 2019, happening now", "Out of office, out of control", "We’re the reason for the rules"],
    ["Squad on tour", "No plans, just vibes", "The gang is out"],
    ["Same gang, new memories", "Friends who travel, stay", "Wherever, as long as it’s us"],
    ["Trip mode on", "Squad goals", "Road crew"],
  ],
  "Office team": [
    ["Powered by chai", "This meeting could be a tee", "Deadline survivors"],
    ["Team before ego", "We ship", "Built by us"],
    ["Colleagues by chance, friends by choice", "More than a team", "We build it together"],
    ["One team", "Crew", "Day one team"],
  ],
  Festival: [
    ["Eat. Celebrate. Repeat.", "Sweets first, diet next year", "Came for the lights, stayed for the food"],
    ["Festival mode on", "Lights, colours, us", "Celebrate loud"],
    ["Home for the festival", "Light, love and family", "Traditions we keep together"],
    ["Happy days", "Festive crew", "Celebrate"],
  ],
};

// words a customer might type -> occasion
const KEYWORDS = [
  ["Cricket team", /cricket|bat\b|bowl|wicket|ipl|match|tournament/],
  ["Gym team", /gym|fitness|workout|lift|crossfit|marathon|run club/],
  ["College fest", /college|fest|campus|culturals?|symposium|hostel/],
  ["Farewell", /farewell|graduat|convocation|reunion|alumni|batch|school/],
  ["Birthday", /birthday|b'?day|bday/],
  ["Wedding", /wedding|marriage|bride\b|groom\b|engagement|reception|sangeet/],
  ["Bachelor party", /bachelor|bachelorette|stag|hen party/],
  ["Couple tees", /couple|anniversary|girlfriend|boyfriend|wife|husband|valentine/],
  ["Family trip", /family|cousins?|relatives/],
  ["Friends trip", /trip|tour|goa|travel|friends?|gang|squad|vacation|holiday/],
  ["Office team", /office|company|corporate|startup|colleague|work team|employees?/],
  ["Festival", /festival|diwali|pongal|onam|christmas|eid|new year|navratri|holi/],
];
export const occasionIn = (text) => KEYWORDS.find(([, re]) => re.test(text.toLowerCase()))?.[0] || null;
export const toneIn = (text) => {
  const t = text.toLowerCase();
  if (/funny|fun\b|humou?r|joke|comedy|witty/.test(t)) return "Funny";
  if (/bold|strong|power|attitude|savage|mass/.test(t)) return "Bold";
  if (/emotional|sentiment|heart|touching|sweet|cute|love/.test(t)) return "Emotional";
  if (/simple|minimal|short|clean|classy/.test(t)) return "Simple";
  return null;
};

// The next three lines for an occasion: the chosen tone first, then the others.
export function slogansFor(occasion, tone, from = 0) {
  const sets = SLOGANS[occasion];
  const first = Math.max(0, TONES.indexOf(tone));
  const pool = [...sets[first], ...sets.filter((_, i) => i !== first).flat()];
  return [0, 1, 2].map((i) => pool[(from + i) % pool.length]);
}

// Lines built around the customer's own name, team or year.
export function personalLines(occasion, word) {
  const w = word.trim().slice(0, 30);
  const year = new Date().getFullYear();
  const isYear = /^\d{4}$/.test(w);
  if (isYear) return [`Est. ${w}`, `Class of ${w}`, `${occasion.replace(/ (team|tees)$/i, "")} · ${w}`];
  const byOccasion = {
    "Cricket team": [`${w} · Est. ${year}`, `Team ${w}`, `${w} — built for the last over`],
    "Gym team": [`${w} · No days off`, `Team ${w}`, `${w} — stronger than yesterday`],
    Birthday: [`${w}’s birthday squad`, `Team ${w} · ${year}`, `It’s ${w}’s day`],
    Wedding: [`Team ${w}`, `${w} · Just married`, `${w} · ${year}`],
    "Couple tees": [`${w} · Since ${year}`, `Team ${w}`, `${w}, always`],
  }[occasion];
  return byOccasion || [`${w} · Est. ${year}`, `Team ${w}`, `${w} squad`];
}
