// studio/voiceInput.js — speak instead of type (Assistant v2 round 3, 7 Nov 2026). The browser's own speech
// recognition (Chrome, Edge, Safari on iPhone); nothing is sent to our server. Tanglish comes through fine with
// en-IN; Tamil words may come back in Tamil script, which the Assistant reads too.
// Round 9 (13 Nov 2026): the other way too — the Assistant's answer read out with the phone's own free voice
// (speak / stopSpeaking below). Nothing is sent to our server for that either.
import { isTamil, voiceFor } from "./assistantExtras";

const Recognition = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

export const speechSupported = () => Boolean(Recognition());

/**
 * Starts listening. onText(text, final) is called as words come in; onEnd() when it stops (silence, Stop, or an error).
 * @returns a stop() function
 */
export function startListening({ lang = "en-IN", onText, onEnd, onError } = {}) {
  const R = Recognition();
  if (!R) {
    onError?.("not supported");
    onEnd?.();
    return () => {};
  }
  const rec = new R();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (const r of e.results) {
      text += r[0]?.transcript || "";
      if (r.isFinal) final = true;
    }
    onText?.(text.trim(), final);
  };
  rec.onerror = (e) => {
    onError?.(e?.error || "error");
    finish();
  };
  rec.onend = finish;
  try {
    rec.start();
  } catch (err) {
    onError?.(err?.message || "error");
    finish();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

/* ---------- round 9 (13 Nov 2026): reading the answer out ---------- */
const synth = () => (typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null);
export const voiceOutSupported = () => Boolean(synth());
// a phone or tablet (a finger, not a mouse): after listening the box isn't focused, so the keyboard doesn't jump up
export const touchScreen = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

const listVoices = (s) => {
  try {
    return s.getVoices() || [];
  } catch {
    return [];
  }
};
// the phone's voices: Chrome on Android lists them a moment late (an event says when) — never waits more than 1.2 s
const voices = () =>
  new Promise((resolve) => {
    const s = synth();
    const now = s ? listVoices(s) : [];
    if (!s || now.length) return resolve(now);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      s.removeEventListener?.("voiceschanged", finish);
      resolve(listVoices(s));
    };
    s.addEventListener?.("voiceschanged", finish);
    setTimeout(finish, 1200);
  });

// iPhone / iPad: a page may only talk after a tap. A silent word said inside the mic's tap lets the answer be heard
// later (it comes after the pause, without a tap). Other phones don't need it, so it isn't said there.
const apple = () => typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export function unlockVoice() {
  const s = synth();
  if (!s || !apple()) return;
  try {
    const u = new window.SpeechSynthesisUtterance(" ");
    u.volume = 0;
    s.speak(u);
  } catch {
    /* no voice here */
  }
}

// The sentences being said now. Kept here so Chrome doesn't throw one away before it ends (it then never says
// "ended"). onIdle: called once when the last one is done (or after Stop: never).
const saying = new Set();
let onIdle = null;
let stops = 0;
let watch = null;
const idle = () => {
  clearInterval(watch);
  watch = null;
  const f = onIdle;
  onIdle = null;
  f?.();
};
const ended = (u) => {
  if (saying.delete(u) && !saying.size) idle();
};
// some phones never say "ended": once the voice has been quiet for about 3 s, it counts as done
const watchVoice = (s) => {
  if (watch) return;
  let quiet = 0;
  watch = setInterval(() => {
    quiet = s.speaking || s.pending ? 0 : quiet + 1;
    if (!saying.size || quiet >= 3) {
      saying.clear();
      idle();
    }
  }, 1000);
  watch.unref?.(); // (tests in Node: the timer doesn't keep them running)
};

/**
 * Reads the words out with the phone's own voice, a sentence at a time (Chrome stops one long piece after about
 * 15 s). Called again while it talks, the new words wait their turn. Tamil words with no Tamil voice on the phone:
 * nothing is said (the answer stays written). onDone() when everything queued has been said.
 */
export async function speak(text, { onDone } = {}) {
  const s = synth();
  const words = String(text || "").trim();
  if (!s || !words) {
    if (!saying.size) onDone?.();
    return;
  }
  const my = stops;
  const voice = voiceFor(await voices(), words);
  if (my !== stops) return; // Stop was pressed meanwhile
  if (isTamil(words) && !voice) {
    if (!saying.size) onDone?.();
    return;
  }
  onIdle = onDone || null;
  const parts = (words.match(/[^.!?।]+[.!?।]*/g) || [words]).map((p) => p.trim()).filter(Boolean);
  const queue = parts.map((part) => {
    const u = new window.SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ? String(voice.lang).replace(/_/g, "-") : "en-IN";
    u.onend = () => ended(u);
    u.onerror = () => ended(u);
    saying.add(u);
    return u;
  });
  try {
    if (s.paused) s.resume(); // (a tab that was in the background can be left paused)
  } catch {
    /* nothing to resume */
  }
  for (const u of queue) {
    try {
      s.speak(u);
    } catch {
      saying.delete(u);
    }
  }
  if (!saying.size) idle();
  else watchVoice(s);
}

export function stopSpeaking() {
  stops += 1;
  const s = synth();
  const busy = saying.size > 0 || Boolean(s?.speaking || s?.pending);
  saying.clear();
  onIdle = null;
  clearInterval(watch);
  watch = null;
  try {
    if (busy) s?.cancel();
  } catch {
    /* nothing was being said */
  }
}
