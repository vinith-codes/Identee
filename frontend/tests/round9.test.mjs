// Round 9 (13 Nov 2026): talking with the Assistant and 💡 Suggest — the pure helpers (studio/assistantExtras.js), the
// read-out queue (studio/voiceInput.js, with a stand-in for the browser's voice) and the box's row rules (designRoom.css).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanForVoice, isTamil, MIC_ERRORS, micError, readReadAloud, saveReadAloud, spokenLine, SUGGEST, voiceFor } from "../src/studio/assistantExtras.js";
import { speak, stopSpeaking, touchScreen, unlockVoice, voiceOutSupported } from "../src/studio/voiceInput.js";
import { IMPROVE } from "../src/studio/assistantScript.js";
import { STARTER_CHIP, suggestionsFor } from "../src/studio/assistantV2.js";

/* ---------- what is read out ---------- */
test("an answer is read without emoji, page addresses or stars; ₹ is said as rupees; I’ll stays I'll", () => {
  assert.equal(cleanForVoice("I’ll do it ✨ (/refund-policy) for ₹699"), "I'll do it for 699 rupees");
  assert.equal(cleanForVoice("“Bold” *gold* text ✓ — ₹1,398 for 2"), "Bold gold text — 1,398 rupees for 2");
  assert.equal(cleanForVoice("Here are three 👍🏽 concepts…"), "Here are three concepts");
  assert.equal(cleanForVoice(""), "");
  // a long answer stops at a sentence, never past 600 letters
  const long = `${"This is one sentence of the answer. ".repeat(30)}`;
  const said = cleanForVoice(long);
  assert.ok(said.length <= 600);
  assert.ok(said.endsWith("."));
});

test("only the Assistant's words and a sheet's numbered titles are read out", () => {
  assert.equal(spokenLine({ from: "bot", text: "Here you go ✨" }), "Here you go");
  assert.equal(spokenLine({ sheet: { concepts: [{ n: 4, title: "Lion King" }, { n: 5, title: "Gold “Crest”" }] } }), "4: Lion King. 5: Gold Crest. Tap or say the number you like.");
  assert.equal(spokenLine({ from: "me", text: "a lion" }), "");
  assert.equal(spokenLine({ chips: ["More options"] }), "");
  assert.equal(spokenLine({ designs: ["/uploads/a.png"] }), "");
  assert.equal(spokenLine({ pending: { type: "assist" } }), "");
  assert.equal(spokenLine({ sheet: { concepts: [] } }), "");
  assert.equal(spokenLine(null), "");
});

test("the voice: Tamil words need a Tamil voice; English prefers Indian, then British, voices on the device first", () => {
  const v = (lang, localService = true, name = lang) => ({ lang, localService, name });
  const all = [v("en-US"), v("en-GB", false, "Google UK"), v("en-IN", false, "Google India"), v("en_IN", true, "Android India"), v("ta-IN")];
  assert.equal(voiceFor(all, "வணக்கம்").lang, "ta-IN");
  assert.equal(voiceFor(all.filter((x) => !x.lang.startsWith("ta")), "வணக்கம்"), null); // stays written
  assert.equal(voiceFor(all, "Hello").name, "Android India"); // en_IN (Android's spelling), on the device
  assert.equal(voiceFor([v("en-IN", false, "online India"), v("en-IN", true, "device India")], "Hello").name, "device India");
  assert.equal(voiceFor([v("en-US"), v("en-GB")], "Hello").lang, "en-GB");
  assert.equal(voiceFor([v("en-US"), v("en-IN", false, "online India")], "Hello").lang, "en-US"); // the online one sends the words away
  assert.equal(voiceFor([v("hi-IN"), v("ta-IN")], "Hello"), null); // no English voice: the browser's own default speaks
  assert.equal(voiceFor([], "Hello"), null);
  assert.equal(isTamil("Tamil வணக்கம்"), true);
  assert.equal(isTamil("Vanakkam"), false);
});

test("every mic problem gets a plain message; a stop on purpose ('aborted') or an unknown one says nothing", () => {
  for (const why of ["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "network", "language-not-supported"]) {
    assert.ok(micError(why).length > 10, why);
    assert.equal(micError(why), MIC_ERRORS[why]);
  }
  assert.match(micError("not-allowed"), /keyboard/); // the keyboard's own 🎤 still works there
  assert.equal(micError("aborted"), "");
  assert.equal(micError("something new"), "");
  assert.equal(micError(undefined), "");
});

test("💡 Suggest asks for suggestions without the words that make the Assistant draw a sheet", () => {
  assert.equal(SUGGEST.label, "Suggest");
  assert.doesNotMatch(SUGGEST.say, /idea|design/i);
  assert.ok(!SUGGEST.say.startsWith(IMPROVE));
  assert.match(SUGGEST.say, /suggestions/); // (the stand-in brain on the server answers these words: assistantBrain.test.mjs)
  // Browse ideas with none ticked yet: the 3-tap start and this month's starters (DesignRoomPage loadIdeas)
  const starts = [STARTER_CHIP, ...suggestionsFor(new Date(2026, 10, 13))];
  assert.equal(starts.length, 4);
  assert.equal(new Set(starts).size, 4);
});

test("reading aloud is on until it is turned off on this device; a blocked storage keeps it on", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  assert.equal(readReadAloud(), true);
  saveReadAloud(false);
  assert.equal(readReadAloud(), false);
  saveReadAloud(true);
  assert.equal(readReadAloud(), true);
  globalThis.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readReadAloud(), true);
  assert.doesNotThrow(() => saveReadAloud(false));
  delete globalThis.localStorage;
});

/* ---------- the read-out queue, with a stand-in for the browser's voice ---------- */
function fakeVoice({ voices = [{ lang: "en-IN", localService: true, name: "India" }], late = false } = {}) {
  const queue = [];
  const on = {};
  const s = {
    speaking: false,
    pending: false,
    paused: false,
    cancels: 0,
    ready: !late,
    getVoices: () => (s.ready ? voices : []),
    addEventListener: (name, f) => (on[name] = f),
    removeEventListener: (name) => delete on[name],
    speak: (u) => {
      queue.push(u);
      s.speaking = true;
    },
    // like the browser: everything queued ends with an error ("interrupted")
    cancel: () => {
      s.cancels += 1;
      const was = queue.splice(0);
      s.speaking = false;
      was.forEach((u) => u.onerror?.({ error: "interrupted" }));
    },
    resume: () => (s.paused = false),
    // the voice finishes the sentence it is saying
    finishOne: () => {
      const u = queue.shift();
      s.speaking = queue.length > 0;
      u?.onend?.();
      return u;
    },
    voicesArrive: () => {
      s.ready = true;
      on.voiceschanged?.();
    },
  };
  class Utterance {
    constructor(text) {
      this.text = text;
      this.volume = 1;
    }
  }
  globalThis.window = { speechSynthesis: s, SpeechSynthesisUtterance: Utterance };
  return { s, queue };
}

test("an answer is said a sentence at a time with the chosen voice; done once everything queued is said", async () => {
  const { s, queue } = fakeVoice();
  assert.equal(voiceOutSupported(), true);
  let done = 0;
  await speak("Here are three concepts. Which one do you like?", { onDone: () => (done += 1) });
  assert.deepEqual(queue.map((u) => u.text), ["Here are three concepts.", "Which one do you like?"]);
  assert.equal(queue[0].voice.name, "India");
  assert.equal(queue[0].lang, "en-IN");
  // the sheet's titles arrive while it still talks: they wait their turn, and "done" comes once, at the very end
  await speak("1: Lion. 2: Crest.", { onDone: () => (done += 1) });
  assert.equal(queue.length, 4);
  s.finishOne();
  s.finishOne();
  s.finishOne();
  assert.equal(done, 0);
  s.finishOne();
  assert.equal(done, 1);
  stopSpeaking();
  delete globalThis.window;
});

test("Stop: it goes quiet at once and 'done' never comes; a new answer after it is said as usual", async () => {
  const { s, queue } = fakeVoice();
  let done = 0;
  await speak("One. Two. Three.", { onDone: () => (done += 1) });
  stopSpeaking();
  assert.equal(s.cancels, 1);
  assert.equal(queue.length, 0);
  assert.equal(done, 0);
  // nothing was being said: Stop doesn't call the browser
  stopSpeaking();
  assert.equal(s.cancels, 1);
  await speak("Next answer.", { onDone: () => (done += 1) });
  s.finishOne();
  assert.equal(done, 1);
  stopSpeaking();
  delete globalThis.window;
});

test("voices that arrive late are waited for; a Stop pressed meanwhile means nothing is said", async () => {
  const { s, queue } = fakeVoice({ late: true });
  const p = speak("Hello there.", {});
  s.voicesArrive();
  await p;
  assert.equal(queue.length, 1);
  assert.equal(queue[0].voice.name, "India");
  stopSpeaking();
  const { s: s2, queue: q2 } = fakeVoice({ late: true });
  const p2 = speak("Hello again.", {});
  stopSpeaking();
  s2.voicesArrive();
  await p2;
  assert.equal(q2.length, 0);
  delete globalThis.window;
});

test("Tamil words with no Tamil voice: nothing is said (the answer stays written) and it is done at once", async () => {
  const { queue } = fakeVoice();
  let done = 0;
  await speak("வணக்கம், இதோ மூன்று டிசைன்கள்.", { onDone: () => (done += 1) });
  assert.equal(queue.length, 0);
  assert.equal(done, 1);
  const { queue: q2 } = fakeVoice({ voices: [{ lang: "ta-IN", localService: true, name: "Tamil" }] });
  await speak("வணக்கம்.", {});
  assert.equal(q2[0].voice.name, "Tamil");
  assert.equal(q2[0].lang, "ta-IN");
  stopSpeaking();
  delete globalThis.window;
});

test("English with no English voice listed: the browser's default voice says it in Indian English", async () => {
  const { queue } = fakeVoice({ voices: [] });
  const p = speak("Hello.", {});
  await p; // (no voices at all: it waits about 1.2 s for them, then goes ahead)
  assert.equal(queue.length, 1);
  assert.equal(queue[0].voice, undefined);
  assert.equal(queue[0].lang, "en-IN");
  stopSpeaking();
  delete globalThis.window;
});

test("a phone that never says 'ended': once the voice has been quiet for 3 s it counts as done", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { s } = fakeVoice();
    let done = 0;
    await speak("One sentence.", { onDone: () => (done += 1) });
    mock.timers.tick(2000);
    assert.equal(done, 0); // still talking
    s.speaking = false; // it went quiet, but no "ended" came
    mock.timers.tick(2000);
    assert.equal(done, 0);
    mock.timers.tick(1000);
    assert.equal(done, 1);
  } finally {
    stopSpeaking();
    mock.timers.reset();
    delete globalThis.window;
  }
});

test("no voice in this browser: nothing breaks, and 'done' comes at once", async () => {
  delete globalThis.window;
  assert.equal(voiceOutSupported(), false);
  let done = 0;
  await speak("Hello.", { onDone: () => (done += 1) });
  assert.equal(done, 1);
  assert.doesNotThrow(() => stopSpeaking());
  assert.doesNotThrow(() => unlockVoice());
  assert.equal(touchScreen(), false);
});

test("the silent word that lets an iPhone talk later is said on iPhones only", () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const as = (userAgent, extra = {}) => Object.defineProperty(globalThis, "navigator", { value: { userAgent, platform: "", maxTouchPoints: 0, ...extra }, configurable: true });
  try {
    const { queue } = fakeVoice();
    as("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile");
    unlockVoice();
    assert.equal(queue.length, 0);
    as("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1");
    unlockVoice();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].volume, 0);
    as("Mozilla/5.0 (Macintosh) Safari/605", { platform: "MacIntel", maxTouchPoints: 5 }); // an iPad
    unlockVoice();
    assert.equal(queue.length, 2);
  } finally {
    if (real) Object.defineProperty(globalThis, "navigator", real);
    stopSpeaking();
    delete globalThis.window;
  }
});

test("a finger, not a mouse: the box isn't focused after listening, so a phone's keyboard doesn't jump up", () => {
  globalThis.window = { matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }) };
  assert.equal(touchScreen(), true);
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  assert.equal(touchScreen(), false);
  delete globalThis.window;
});

/* ---------- the box's row ---------- */
test("the box's row never pushes Send out of the box, and small phones get a tighter row", () => {
  const css = readFileSync(new URL("../src/studio/designRoom.css", import.meta.url), "utf8");
  assert.match(css, /\.dr-cbar \{ flex-wrap: wrap; row-gap: 4px; \}/);
  assert.match(css, /\.dr-composer\.dr-cbox \.dr-send \{ margin-left: auto; \}/);
  const small = css.slice(css.indexOf("@media (max-width: 380px) {"));
  assert.match(small, /\.dr-cbar \{ gap: 4px; \}/);
  assert.match(small, /\.dr-cbar-gap \{ display: none; \}/);
  // and the Assistant: 💡 Suggest only in the new Assistant, ✨ Improve only in the old chat
  const jsx = readFileSync(new URL("../src/studio/Assistant.jsx", import.meta.url), "utf8");
  assert.match(jsx, /\{ctx\(\)\.ai\.v2 && !attached && !draft\.trim\(\) && \(/);
  assert.match(jsx, /\{!ctx\(\)\.ai\.v2 && ctx\(\)\.ai\.available && ctx\(\)\.ai\.text && !attached && \(/);
});
