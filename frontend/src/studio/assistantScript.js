// studio/assistantScript.js
//
// What the design assistant says. This first version is free to run: the
// replies are written here. The paid AI can replace replyTo() later
// (see docs/AI_PLAN.md).
const MENU = ["Slogan ideas", "Make a design", "Remove a background"];
const SLOGANS = {
  "Gym team": ["No days off", "Lift. Rest. Repeat.", "Stronger than yesterday"],
  "College fest": ["Class of chaos", "One fest. Zero sleep.", "Made in the back bench"],
  Birthday: ["Level up day", "Cake first, plans later", "Another lap round the sun"],
  "Family trip": ["Trip mode on", "Same bus, same madness", "Are we there yet"],
  "Office team": ["Deadline survivors", "Powered by chai", "Team before ego"],
};
const NOT_ALLOWED = /logo|nike|adidas|puma|marvel|disney|celebr|actor|actress|cricketer|footballer/i;

const bot = (text) => ({ from: "bot", text });
const chips = (list) => ({ chips: list });
export const firstMessages = () => [bot("Hi. Tell me what you have in mind, or pick a starting point."), chips(MENU)];

// What the assistant says back to a tapped chip or a typed message.
export function replyTo(text, areaLabel) {
  if (SLOGANS[text]) {
    return [bot(`Three for a ${text.toLowerCase()} tee. Tap one to put it on ${areaLabel}.`), { slogans: SLOGANS[text] }, bot("Anything else?"), chips(MENU)];
  }
  if (text === "Open the art library") return [{ go: "art" }];
  if (text === "Upload a picture") return [{ go: "upload" }];
  if (NOT_ALLOWED.test(text)) {
    return [bot("I can’t help with brand logos or famous faces — they belong to someone else and can’t be printed. Try an original idea instead."), chips(["Slogan ideas", "Open the art library"])];
  }
  if (text === MENU[0] || /slogan|quote|text|line|caption|words/i.test(text)) return [bot("Who is the tee for?"), chips(Object.keys(SLOGANS))];
  if (text === MENU[2] || /background|cut ?out|remove/i.test(text)) {
    return [bot("Removing a picture’s background is coming soon. For now, upload a picture that already has a see-through background (PNG)."), chips(["Upload a picture", "Slogan ideas"])];
  }
  if (text === MENU[1] || /design|draw|make|picture|art|image/i.test(text)) {
    return [bot("Designs made to order are coming soon. For now, pick from our art library or upload your own picture."), chips(["Open the art library", "Upload a picture", "Slogan ideas"])];
  }
  return [bot("I only help with tee designs. Pick one to get going."), chips(MENU)];
}
