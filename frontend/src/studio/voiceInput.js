// studio/voiceInput.js — speak instead of type (Assistant v2 round 3, 7 Nov 2026). The browser's own speech
// recognition (Chrome, Edge, Safari on iPhone); nothing is sent to our server. Tanglish comes through fine with
// en-IN; Tamil words may come back in Tamil script, which the Assistant reads too.
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
