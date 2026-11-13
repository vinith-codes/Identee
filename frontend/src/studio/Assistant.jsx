// studio/Assistant.jsx
//
// The Design Room's design assistant: a guided chat in the "What to add"
// panel. This version costs nothing to run — what it says and does is
// written in assistantScript.js (slogans, layouts, the design check, colour /
// print-area / size help). The paid AI parts can replace those scripted
// replies later (see docs/AI_PLAN.md).
import { useEffect, useRef, useState } from "react";
import { CANCEL, EXAMPLES, IMPROVE, NOT_NOW, PROMPT_MAX, replyTo, smartCanAnswer, smartPlan } from "./assistantScript";
import { imageUrl } from "../utils/imageUrl";
import WaitCard from "./WaitCard";
import IdeaPreview from "./IdeaPreview";
import PlanCard from "./PlanCard";
import PhotoPlanCard from "./PhotoPlanCard";
import MyPictures from "./MyPictures";
import SheetCard from "./SheetCard";
import { assistAct, STARTER_CHIP, ASK_TEAM, STARTER, starterStep, starterOptions, starterBrief, BROWSE_CHIP } from "./assistantV2";
import { speak, speechSupported, startListening, stopSpeaking, touchScreen, unlockVoice, voiceOutSupported } from "./voiceInput";
import { PhotoError, shrinkPhoto } from "./shrinkPhoto";
import { GroupCard, OrdersCard, ReorderCard, SizeCard, SpotPicker } from "./AssistantCards";
import { keepTyped, leftLine, MIC_LANGS, micError, nextMicLang, readMicLang, readReadAloud, readTyped, saveMicLang, saveReadAloud, spokenLine, spotName, SUGGEST, WAIT_TIPS } from "./assistantExtras";
import { dropFile, keepFile, keptFile } from "./roomFiles";

const PICTURE_HINT = "Usually 20–40 seconds. You can look around the room meanwhile.";
// the acts that take a while (an AI or the server): the chat waits for them with a wait card
const SLOW = ["generate", "slogans", "edit", "improve", "drawPlan", "photoPlace", "photoUnderstand", "photoMake", "smart", "assist", "help", "ideas"];
// What the wait card says for an AI job: { label, expect (usual seconds), hint }
const waitFor = (a) =>
  a.type === "assist"
    ? { label: a.steps ? "Making your pick…" : "Thinking…", expect: a.steps ? 30 : 8, hint: a.steps ? "Each piece is drawn from the sheet. Usually 20–40 seconds." : "" }
    : a.type === "smart"
    ? { label: "Thinking…", expect: 5 }
    : a.type === "edit"
    ? { label: "Working on it…", expect: 8, hint: "If you asked for pictures, each one takes about 20–40 seconds." }
    : a.type === "slogans"
      ? { label: "Writing a few…", expect: 6 }
      : a.type === "improve"
        ? { label: "Improving your idea…", expect: 9 }
      : a.type === "photoUnderstand"
        ? { label: "Looking at your photo…", expect: 6 }
      : a.type === "photoMake"
        ? a.job === "copy"
          ? { label: "Copying the design…", expect: 30, hint: PICTURE_HINT }
          : a.job === "inspired"
            ? { label: "Drawing your design…", expect: 25, hint: PICTURE_HINT }
            : a.job === "art"
              ? { label: "Redrawing your photo…", expect: 35, hint: PICTURE_HINT }
              : a.enhance
                ? { label: "Making your photo sharper…", expect: 30, hint: PICTURE_HINT }
                : { label: a.cutOut ? "Removing the background…" : "Putting your photo on the tee…", expect: a.cutOut ? 8 : 3, hint: a.cutOut ? "Free. Usually a few seconds." : "" }
      : a.type === "photoPlace"
        ? a.cutOut
          ? { label: "Removing the background…", expect: 8, hint: "Free. Usually a few seconds." }
          : { label: "Putting your photo on the tee…", expect: 3 }
      : a.type === "drawPlan"
        ? { label: a.items?.length > 1 ? `Drawing ${a.items.length} pictures at the same time…` : "Drawing your design…", expect: a.items?.length > 1 ? 30 : 25, hint: a.items?.length > 1 ? "Usually 20–40 seconds for all of them. You can look around the room meanwhile." : PICTURE_HINT }
      : a.photoUrl
        ? { label: "Redrawing your photo…", expect: 35, hint: PICTURE_HINT }
        : a.baseUrl
          ? { label: "Changing your design…", expect: 25, hint: PICTURE_HINT }
          : { label: "Drawing your design…", expect: 25, hint: PICTURE_HINT };

/**
 * The conversation (messages) and its state live in the page, so the chat is
 * still there after switching tabs.
 *   ctx()      what the assistant knows about the tee right now
 *   onAct(a)   the page does something: add text, apply a layout, change size, open an area / tab, go to review, recolour
 *   onFix(i)   apply a design-check fix
 *   placed     which print areas each AI-made design is on: { [url]: ["Left Chest"] }
 *   fabric     the tee's colour — AI designs are shown on it, as they will look on the tee
 *
 * The act "generate" (the image AI) takes a while: onAct returns a promise of
 * the messages to show when the pictures are ready.
 */
// autoSay: a message to send as if typed, once (the home page's "What do you want on your tee?" box); onAutoSaid clears it
// onWorking(bool): an AI request is running (the page warns before the tab is closed meanwhile)
// photoNudge: a counter — when it goes up (the chat was opened to send a photo), 📎 lights up for a moment
// chatId, roomKey (13 Nov 2026): this chat and the garment's room — the words typed in the box and a photo picked
//   with 📎 are kept for them until sent (closing the Assistant, a reload or leaving the page doesn't lose them)
// working: an AI request of this chat is still running (started before the Assistant was closed and opened again)
export default function Assistant({ messages, setMessages, state, setState, ctx, onAct, onFix, placed = {}, fabric, autoSay, onAutoSaid, onWorking, photoNudge = 0, chatId = "", roomKey = "", working = false }) {
  const [draft, setDraft] = useState(() => (roomKey ? readTyped(roomKey, chatId) : ""));
  useEffect(() => {
    if (roomKey) keepTyped(roomKey, chatId, draft);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const photoKey = `photo:${roomKey}`;
  // false | true (a short "Thinking…") | { label, expect, hint } for the AI: a card with a live seconds count
  const [thinking, setThinking] = useState(false);
  const [pickFor, setPickFor] = useState(null); // the design whose "Other area" list is open
  const [moveAsk, setMoveAsk] = useState(null); // "Other area" for a picture already on the tee: { url, key, label } — keep both, or move?
  const log = useRef(null);
  const box = useRef(null);
  const timer = useRef(null);
  const job = useRef(null); // the AI request running now: { act, stopped }
  const photoBox = useRef(null); // the hidden file picker behind 📎
  // the message box grows with what is typed (up to about 6 lines, then it scrolls), so a long idea can be read
  // back before it is sent; it shrinks again when it is sent or cleared
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [draft]);
  const [nudging, setNudging] = useState(false);
  useEffect(() => {
    if (!photoNudge) return;
    setNudging(true);
    const t = setTimeout(() => setNudging(false), 4000);
    return () => clearTimeout(t);
  }, [photoNudge]);
  const [attached, setAttached] = useState(null); // a photo picked with 📎, waiting to be sent with the words: { file, w, h, local }
  // the photo picked but not sent before the page closed comes back to the box (13 Nov 2026, roomFiles.js)
  useEffect(() => {
    if (!roomKey) return undefined;
    let alive = true;
    keptFile(photoKey).then((f) => {
      if (!alive || !f?.buf || f.chatId !== chatId) return;
      try {
        const file = new File([f.buf], f.name || "photo.jpg", { type: f.type || "image/jpeg" });
        setAttached((cur) => cur || { file, w: f.w, h: f.h, local: URL.createObjectURL(file) });
      } catch {
        /* an old browser without File(): the photo just isn't brought back */
      }
    });
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 🎤 speak instead of type (round 3): the words land in the box as they are heard.
  // Round 9 (13 Nov 2026), talking with the Assistant: what was heard is sent by itself 1.5 s after the customer stops
  // (Wait, or a tap on the words, stops that so they can be fixed first), and the answer to a spoken message is read
  // out with the phone's own voice (the speaker button next to the mic turns that off; remembered on this device)
  const [listening, setListening] = useState(false);
  const [micLang, setMicLang] = useState(readMicLang); // round 8: English or Tamil, remembered in this browser
  const [spotFor, setSpotFor] = useState(null); // round 8: the picture whose "Change a part" view is open
  const stopListen = useRef(null);
  const heard = useRef(""); // the words the mic heard this time
  const micFailed = useRef(false); // listening ended with an error: what was heard so far is not sent
  // 13 Nov 2026: the words were sent (Send, Enter, a chip) while the mic still listened — what it hears after that
  // never comes back to the box or is sent again
  const dropHeard = useRef(false);
  // the box was tapped or typed in while the mic listened: the words stay there to be fixed, never sent by themselves
  const held = useRef(false);
  const fromMic = useRef(false); // the words in the box were spoken (also after a word was fixed): the answer is read out
  const voiceTurn = useRef(false); // the message being sent right now was spoken
  const sendRef = useRef(null); // the newest send(), for the pause timer
  const alive = useRef(true); // this Assistant is still open (a request that ends after it closed is never read out)
  const [autoSend, setAutoSend] = useState(""); // what was heard, waiting the short pause before it is sent
  const [speaking, setSpeaking] = useState(false); // the answer is being read out
  const [readAloud, setReadAloud] = useState(readReadAloud);
  const readAloudNow = useRef(readAloud);
  const [voiceNote, setVoiceNote] = useState(""); // a short note over the box: why the mic couldn't listen, reading aloud on / off
  const quiet = () => {
    stopSpeaking();
    setSpeaking(false);
  };
  // Stop on the reading bar: this answer stays quiet, also what comes at its end (a concept sheet's names; 13 Nov 2026)
  const stopReading = () => {
    if (job.current) job.current.voice = false;
    quiet();
  };
  // the words go now (Send, Enter, a chip): the mic stops, and what it still hears is dropped (13 Nov 2026)
  const dropListening = () => {
    if (!stopListen.current) return;
    dropHeard.current = true;
    stopListen.current();
  };
  // the box tapped or typed in while the mic listens: the mic stops, and the words wait there to be fixed
  const holdHeard = () => {
    if (!stopListen.current || held.current) return;
    held.current = true;
    stopListen.current();
  };
  const toggleListen = () => {
    quiet(); // (never listens while the Assistant is talking)
    setAutoSend("");
    setVoiceNote("");
    if (listening) {
      stopListen.current?.();
      return;
    }
    unlockVoice(); // (iPhone: inside this tap, so the answer can be heard later)
    heard.current = "";
    micFailed.current = false;
    dropHeard.current = held.current = false;
    const before = draft.trim();
    setListening(true);
    stopListen.current = startListening({
      lang: micLang,
      onText: (text) => {
        if (dropHeard.current || held.current) return; // (sent already, or being fixed: the box isn't written over)
        heard.current = text;
        setDraft(before && text ? `${before} ${text}` : before || text);
      },
      onEnd: () => {
        setListening(false);
        stopListen.current = null;
        if (dropHeard.current) return;
        if (held.current) {
          fromMic.current = Boolean(heard.current); // (the answer is still read out when it is sent)
          return;
        }
        if (heard.current && !micFailed.current) {
          // sent by itself after a short pause (only when listening ended without an error: never half a sentence)
          fromMic.current = true;
          setAutoSend(before ? `${before} ${heard.current}` : heard.current);
        } else if (!touchScreen()) setTimeout(() => box.current?.focus(), 50); // (a phone's keyboard isn't popped up)
      },
      onError: (why) => {
        micFailed.current = true;
        if (why === "language-not-supported") {
          setMicLang("en-IN");
          saveMicLang("en-IN");
        }
        setVoiceNote(micError(why));
      },
    });
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopListen.current?.();
      stopSpeaking(); // closing the Assistant or opening another chat ends the talking
    };
  }, []);
  // reading answers aloud, on or off (remembered on this device)
  const toggleReadAloud = () => {
    const on = !readAloud;
    setReadAloud(on);
    readAloudNow.current = on;
    saveReadAloud(on);
    if (on) unlockVoice();
    else quiet();
    setVoiceNote(on ? "Reading aloud is on. When you speak to me, I answer out loud." : "Reading aloud is off. Tap the speaker next to the mic to turn it back on.");
  };
  // the answer to a spoken message, read out — only while this Assistant is open and reading aloud is on
  const readOut = (msgs) => {
    if (!alive.current || !readAloudNow.current || !voiceOutSupported()) return;
    const words = (msgs || []).map(spokenLine).filter(Boolean).join(" ");
    if (!words) return;
    setSpeaking(true);
    speak(words, { onDone: () => alive.current && setSpeaking(false) });
  };

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, thinking]);
  // A card that grows after it arrived (the orders are looked up, a group's answers come in) stays in view: while the
  // reader is at the end of the chat, the chat follows what was added. Someone reading further up is left alone.
  const atEnd = useRef(true);
  useEffect(() => {
    const el = log.current;
    if (!el || typeof MutationObserver === "undefined") return undefined;
    const onScroll = () => {
      atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const seen = new MutationObserver(() => {
      if (atEnd.current) el.scrollTop = el.scrollHeight;
    });
    // pictures that load late (photos, idea cards: no fixed height) push the end down — a long chat still opens on
    // its latest message (13 Nov 2026). (load doesn't bubble: caught on the way down)
    const onLoad = (e) => {
      if (atEnd.current && e.target?.tagName === "IMG") el.scrollTop = el.scrollHeight;
    };
    // the chat got shorter or taller (the phone's keyboard opened or closed, the box grew): the newest message stays
    // in sight (13 Nov 2026, feedback 4) — not while a box inside the chat is being typed in (the team note, the size
    // card): that box must stay where the customer is typing
    const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (atEnd.current && !el.contains(document.activeElement)) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("load", onLoad, true);
    seen.observe(el, { childList: true, subtree: true });
    sized?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", onLoad, true);
      seen.disconnect();
      sized?.disconnect();
    };
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The customer must never be stuck: every slow AI job ends (also when it fails), a failed one gets a
  // "Try again" (the same request — nothing to type again), and while it runs the chat says so.
  // voice (round 9): the request was spoken — its answer is read out (the early reply, then what comes at the end)
  const run = (act, wait, after = [], voice = voiceTurn.current) => {
    setThinking(wait);
    onWorking?.(true);
    // say(msgs): the page may show messages while the request still runs (the brain's reply before the sheet is drawn)
    const me = {
      act,
      wait,
      stopped: false,
      voice,
      say: (msgs) => {
        setMessages((m) => {
          const i = m.findIndex((x) => x.pending);
          return i < 0 ? [...m, ...msgs] : [...m.slice(0, i), ...msgs, ...m.slice(i)];
        });
        if (me.voice && !me.stopped) readOut(msgs);
      },
    };
    job.current = me;
    // a marker kept with the chat: after a reload mid-request it becomes "cut off — Try again"
    setMessages((m) => [...m, { pending: act, wait }]);
    // the page may say what it is doing now (a chat request that turned into drawing two pictures)
    Promise.resolve()
      .then(() => onAct(act, (now) => !me.stopped && setThinking(now), me))
      .then((made) => made || [])
      .catch(() => [{ from: "bot", text: "Something went wrong on my side." }, { failed: true }])
      .then((made) => {
        if (me.stopped) {
          // Stopped, but a picture finished anyway: it was already counted, so it is offered (not put on the tee)
          const pics = made.filter((x) => x.designs || x.sheet); // (a concept sheet too: it was counted)
          setMessages((m) => {
            const rest = m.filter((x) => !x.pending);
            return pics.length ? [...rest, { from: "bot", text: pics.some((x) => x.sheet) ? "The concepts you stopped finished anyway, so they’re here if you want them." : "The picture you stopped finished anyway, so it’s here if you want it. Nothing was added to your tee." }, ...pics.map((x) => ({ ...x, again: null }))] : rest;
          });
          return;
        }
        job.current = null;
        setThinking(false);
        onWorking?.(false);
        // the smart chat couldn't answer (offline, switched off, out of credit): the fixed replies answer, as before
        const back = made.find((x) => x.fallback);
        if (back) {
          setMessages((m) => m.filter((x) => !x.pending));
          // (never 💡 Suggest: the fixed chat would take its words as a change to make — 13 Nov 2026)
          if (act.suggest) setMessages((m) => [...m, { from: "bot", text: SUGGEST.off }]);
          else answer(back.fallback.text, false, me.voice);
          return;
        }
        // { failed: true } from the page = this request can simply be tried again; { retry: act } = try that one
        const out = made.flatMap((x) => (x.menu === "Ask the team" ? [{ help: {} }] : x.menu ? helper(x.menu) : [x])).map((x) => (x.failed ? { retry: act, wait } : x.retry && !x.wait ? { ...x, wait: waitFor(x.retry) } : x));
        setMessages((m) => [...m.filter((x) => !x.pending), ...out, ...after]);
        if (me.voice) readOut([...out, ...after]);
      });
  };
  // Stop: the customer stops waiting at once. A chat edit changes nothing on the tee (the page checks "stopped").
  // A picture already being drawn may still count as one of today's requests — said plainly.
  const stop = () => {
    const now = job.current;
    if (!now) return;
    now.stopped = true;
    job.current = null;
    setThinking(false);
    onWorking?.(false);
    quiet();
    const drawing = now.act.type === "generate" || now.act.type === "edit";
    setMessages((m) => [
      ...m.filter((x) => !x.pending),
      { from: "me", text: "Stop" },
      { from: "bot", text: drawing ? "Stopped. Nothing was changed on your tee. (If the picture was already being drawn, it may still count as one of today’s requests.)" : "Stopped." },
      { retry: now.act, wait: now.wait },
    ]);
  };
  const retry = (i, m) => {
    if (thinking || working) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: "Try again" }]);
    run(m.retry, m.wait);
  };

  // tapped: the customer tapped a choice (typed messages may be sent to the text AI; taps never are)
  const say = (text, tapped = false) => {
    // (working: the last request still runs — it started before the Assistant was closed; one at a time)
    if (thinking || working || !text) return false;
    dropListening(); // (13 Nov 2026: what the mic still hears isn't sent a second time)
    // round 9: a tap or a new message ends the read-out and the wait before spoken words are sent
    setAutoSend("");
    setVoiceNote("");
    quiet();
    // round 6 (8 Nov 2026): two taps that stay on the page — the three-tap start, and the way to a person
    if (text === STARTER_CHIP) {
      setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text }, { starter: {} }]);
      return true;
    }
    if (text === BROWSE_CHIP) {
      // round 7: the sheets the admin featured — a starting point, free to look at
      setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text }]);
      run({ type: "ideas" }, { label: "Looking up ideas…", expect: 3 });
      return true;
    }
    if (text === ASK_TEAM) {
      if (!ctx().ai.loggedIn) return onAct({ type: "login" }) || true;
      setMessages((m) => [...m.map((x) => (x.chips || x.retry ? { ...x, done: true } : x)), { from: "me", text }, { help: {} }]);
      return true;
    }
    // the chips just answered can't be tapped again
    // ("Not now" on a plan card closes that card too)
    setMessages((m) => [...m.map((x) => (x.chips || x.retry || ((x.plan || x.photoPlan) && text === NOT_NOW) ? { ...x, done: true } : x)), { from: "me", text }]);
    // the smart Assistant (23 Oct 2026): a typed message goes to Google's text AI — unless it answers a question the
    // fixed chat just asked, is a button's own words, or is a pasted player list (assistantScript.smartCanAnswer).
    // Taps never go there. If it can't answer, the fixed replies below answer instead.
    if (!tapped && smartCanAnswer(text, ctx(), state)) {
      // Assistant v2 (7 Nov 2026): the brain answers with steps; a bare pick ("2 and 3") skips it (studio/assistantV2.js)
      const a = ctx().ai.v2 ? assistAct(text, messages) : { type: "smart", text };
      run(a, waitFor(a));
      return true;
    }
    return answer(text, tapped);
  };
  // The fixed replies (assistantScript.replyTo), as before the smart Assistant: every tap, and typed messages when
  // the smart chat is off or couldn't answer. spoken (round 9): the message was spoken — the reply is read out.
  const answer = (text, tapped = false, spoken = voiceTurn.current) => {
    const { out, st } = replyTo(text, ctx(), state, { tapped });
    setState(st);
    const fill = out.find((o) => o.fill);
    if (fill) {
      setDraft(fill.fill);
      setTimeout(() => box.current?.focus(), 500);
    }
    const reply = out.filter((o) => !o.act && !o.fill);
    const slow = out.find((o) => SLOW.includes(o.act?.type));
    if (slow) {
      // the AI: wait for the answer, then show what the page hands back
      run(slow.act, waitFor(slow.act), reply, spoken);
      return true;
    }
    // ("Upload a photo" opens 📎's picker here — still inside the tap, so phones allow it)
    out.filter((o) => o.act).forEach((o) => (o.act.type === "photoPick" ? pickPhoto() : onAct(o.act)));
    if (!reply.length) return true;
    setThinking(true);
    timer.current = setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
      if (spoken) readOut(reply);
    }, 450);
    return true;
  };
  // A built-in helper the smart chat opened ("Size help", "Where to print" …): the fixed chat's own answer, as if its
  // button was tapped (a quick page action — opening a tab, the review — happens at once).
  const helper = (item) => {
    const { out, st } = replyTo(item, ctx(), state, { tapped: true });
    setState(st);
    out.filter((o) => o.act && !SLOW.includes(o.act.type) && o.act.type !== "photoPick").forEach((o) => onAct(o.act));
    return out.filter((o) => !o.act && !o.fill);
  };
  // An idea the smart chat gave: "Draw this" shows the plan card (nothing is drawn until Draw is tapped)
  const drawIdea = (idea) => {
    if (thinking || working) return;
    const c = ctx();
    if (!c.ai.loggedIn) return onAct({ type: "login" });
    const plan = smartPlan(c, [{ subject: idea.picture, area: idea.area }], idea.style);
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text: `Draw: ${idea.title}` }, ...plan]);
  };
  // the idea typed on the home page: sent once the chat is open (a moment later, so the room is ready)
  useEffect(() => {
    if (!autoSay) return;
    const t = setTimeout(() => {
      if (say(autoSay)) onAutoSaid?.();
    }, 400);
    return () => clearTimeout(t);
  }, [autoSay]); // eslint-disable-line react-hooks/exhaustive-deps
  // 📎 — a photo in the chat, like a messaging app. Logged out: said BEFORE the picker opens, so no photo is lost.
  const pickPhoto = () => {
    if (thinking || working) return;
    if (!ctx().ai.loggedIn) {
      setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "bot", text: "Log in to send a photo. Your design stays here while you log in." }, { chips: ["Log in", "Something else"] }]);
      return;
    }
    photoBox.current?.click();
  };
  // the photo: made small enough on the phone, shown in the chat at once, then sent (the page uploads it and answers)
  // picked: the photo waits in the chat box (like a messaging app) so the customer can say what they want with it,
  // then Send sends both together
  const attachPhoto = async (file) => {
    if (!file) return;
    try {
      const ready = await shrinkPhoto(file);
      if (attached) URL.revokeObjectURL(attached.local);
      setAttached({ ...ready, local: URL.createObjectURL(ready.file) });
      setTimeout(() => box.current?.focus(), 100);
      // kept in this browser until it is sent (a reload or an accidental exit brings it back to the box)
      if (roomKey) ready.file.arrayBuffer().then((buf) => keepFile(photoKey, { chatId, buf, type: ready.file.type, name: ready.file.name, w: ready.w, h: ready.h })).catch(() => {});
    } catch (err) {
      setMessages((m) => [...m, { from: "bot", text: err instanceof PhotoError ? err.message : "The photo couldn’t be prepared. Try another one." }]);
    }
  };
  const dropAttached = () => {
    if (attached) URL.revokeObjectURL(attached.local);
    setAttached(null);
    if (roomKey) dropFile(photoKey);
  };
  const sendPhoto = async (ready, words) => {
    if (!ready || thinking || working) return;
    const { local } = ready;
    const id = `p${Date.now()}`;
    setAttached(null);
    setDraft("");
    setMessages((m) => [...m.map((x) => (x.chips || x.retry ? { ...x, done: true } : x)), { from: "me", photo: { url: local, w: ready.w, h: ready.h }, text: words, sending: id }]);
    setThinking({ label: "Sending your photo…", expect: 4, hint: "On mobile data this can take a few seconds.", noStop: true });
    onWorking?.(true);
    let out;
    try {
      out = (await onAct({ type: "photo", file: ready.file, w: ready.w, h: ready.h, text: words })) || [];
    } catch {
      out = [];
    }
    setThinking(false);
    onWorking?.(false);
    const sent = out.find((x) => x.photoSent)?.photoSent;
    // sent: the photo in the chat now points at the uploaded copy (it is still there after a reload)
    setMessages((m) => [
      ...m.map((x) => (x.sending === id ? { from: "me", photo: sent || x.photo, text: x.text, ...(sent ? {} : { failed: true }) } : x)),
      ...(out.length ? out.filter((x) => !x.photoSent && !x.next) : [{ from: "bot", text: "The photo didn’t send. Check the internet connection, then tap 📎 and try again." }]),
    ]);
    if (sent) setTimeout(() => URL.revokeObjectURL(local), 5000);
    // (only once it is sent: a send cut off by a reload brings the photo back to the box)
    if (sent && roomKey) dropFile(photoKey);
    // words came with the photo: it is read with them now (no menu to pick from)
    const next = out.find((x) => x.next)?.next;
    if (sent && next) run(next, waitFor(next));
  };
  // "Change" on a design: the next thing typed is the change to make
  const startChange = (url, spot = "") => {
    if (thinking || working) return;
    setState({ ...state, wait: "aiChange", changeUrl: url, changeSpot: spot || null });
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "bot", text: spot ? `What should change at ${spotName(spot)}? For example: remove it, make it gold, put a star there.` : "What should I change? For example: make it angrier, remove the crown, add the team name under it." }, { chips: [CANCEL] }]);
  };
  // "Try another": the same request again — a new picture (it uses one of the customer's requests for today)
  const tryAnother = (act) => {
    if (thinking || working || !act) return;
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text: "Try another one" }]);
    run(act, act.photoUrl ? waitFor(act) : { ...waitFor(act), label: "Drawing another one…" });
  };
  const fix = (i, issue) => {
    onFix(issue);
    setMessages((m) => m.map((x, n) => (n === i ? { ...x, issues: x.issues.map((y) => (y.id === issue.id ? { ...y, fixed: true } : y)) } : x)));
  };

  // "Try another" sits under the newest pictures only
  const lastDesigns = messages.reduce((last, m, i) => (m.designs ? i : last), -1);
  // round 8: the newest concept sheet gets the one-tap feedback chips; the newest orders card is the live one
  const lastSheet = messages.reduce((last, m, i) => (m.sheet ? i : last), -1);
  const lastOrders = messages.reduce((last, m, i) => (m.orders ? i : last), -1);
  const patch = (i, more) => setMessages((all) => all.map((x, n) => (n === i ? { ...x, ...more } : x)));
  const left = leftLine(ctx().ai);
  const mic = MIC_LANGS.find((l) => l.key === micLang) || MIC_LANGS[0];
  // only the newest plan can still be changed and drawn (a drawing plan or a photo plan)
  const lastPlan = messages.reduce((last, m, i) => (m.plan || m.photoPlan ? i : last), -1);
  // "Make it" on a photo plan
  const makePhoto = (i, plan) => {
    if (thinking || working) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, photoPlan: plan, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: "Make it" }]);
    const a = { type: "photoMake", job: plan.job, areaKey: plan.areaKey, areaKeys: plan.areaKeys || [], style: plan.style, change: plan.change, subject: plan.subject, design: plan.design, words: plan.words, cutOut: plan.cutOut, enhance: !!plan.enhance };
    run(a, waitFor(a));
  };
  // Draw on the plan card: the plan is kept as it was drawn, and the pictures are made one after the other
  const drawPlan = (i, plan) => {
    if (thinking || working) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, plan, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: `Draw ${plan.items.length > 1 ? "them" : "it"}` }]);
    setState({ ...state, idea: null });
    const a = { type: "drawPlan", items: plan.items, style: plan.style };
    run(a, waitFor(a));
  };
  // Send (the button, Enter, or the pause after speaking): the words in the box, with the photo waiting in it.
  // spoken (round 9): the words came from the mic, so the answer is read out.
  const send = (text, spoken = false) => {
    if (thinking || working) return false;
    if (attached || text) dropListening(); // (13 Nov 2026: sent while the mic still listened — what it hears next isn't sent again)
    setAutoSend("");
    setVoiceNote("");
    // a photo waiting in the box: it goes with what was typed (or alone, and then I ask)
    if (attached) {
      fromMic.current = false;
      sendPhoto(attached, text);
      return true;
    }
    voiceTurn.current = spoken;
    const ok = say(text);
    voiceTurn.current = false;
    // only cleared when it was sent (pressing Send while busy keeps what was typed)
    if (ok) {
      setDraft("");
      fromMic.current = false;
    }
    return ok;
  };
  useEffect(() => {
    sendRef.current = send;
  });
  // round 9: what the mic heard is sent by itself after a short pause (Wait, or a tap on the words, stops it)
  useEffect(() => {
    if (!autoSend) return undefined;
    const t = setTimeout(() => {
      setAutoSend("");
      if (!sendRef.current?.(autoSend, true)) setVoiceNote("I’m still on your last request. Tap Send when I’m done.");
    }, 1500);
    return () => clearTimeout(t);
  }, [autoSend]);
  // 💡 Suggest (round 9, 13 Nov 2026): the Assistant looks at the tee as it is now and offers 3 next steps as chips.
  // Nothing is drawn or changed until one is tapped (the page drops any step but a question: DesignRoomPage chatAssist).
  const suggest = () => {
    if (thinking || working || listening) return;
    setAutoSend("");
    setVoiceNote("");
    quiet();
    // a question the fixed chat just asked ("What should I change?") is dropped, or a tapped suggestion would answer it
    if (state.wait) setState({ ...state, wait: null, changeUrl: null, changeSpot: null });
    setMessages((m) => [...m.map((x) => (x.chips || x.retry ? { ...x, done: true } : x)), { from: "me", text: SUGGEST.say }]);
    const a = { type: "assist", text: SUGGEST.say, suggest: true };
    run(a, waitFor(a), [], false);
  };

  if (ctx().ai.v2 && !ctx().ai.loggedIn) {
    return (
      <div className="dr-chat">
        <div className="dr-gate" role="region" aria-label="Sign in to design with the Assistant">
          <b>Sign in to design with the Assistant</b>
          <p>Tell it what you want in your own words — it shows you numbered design concepts, makes the one you pick, and changes anything you ask. Your tee stays here while you sign in.</p>
          <button type="button" className="dr-mini" onClick={() => onAct({ type: "login" })}>Sign in</button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="dr-chat"
      // 13 Nov 2026: another button tapped in the pause before spoken words are sent (📎, Change it, Try again …) keeps
      // the words in the box to send by hand — they may be meant for that photo or that change
      onPointerDownCapture={(e) => {
        if (autoSend && e.target.closest?.("button, input, select, a") && !e.target.closest(".dr-voicebar, .dr-send, .dr-speak")) setAutoSend("");
      }}
    >
      <div className="dr-chatlog" ref={log} aria-live="polite">
        {messages.map((m, i) => {
          if (m.pending) {
            // the request running now (nothing to show — also while it runs on after the Assistant was closed and
            // opened again), or one cut off when the page closed (the answer never came)
            if (thinking || working) return null;
            // a picture job: what finished may be in My pictures (a concept sheet isn't, so nothing is promised)
            const drew = ["generate", "edit", "drawPlan", "photoMake"].includes(m.pending.type) || (m.pending.type === "assist" && Boolean(m.pending.steps));
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                <span className="dr-msg bot">That request was cut off when you left the page.</span>
                <button type="button" className="dr-chip dr-retry" disabled={m.done} onClick={() => retry(i, { retry: m.pending, wait: m.wait })}>↻ Try again</button>
                <button type="button" className="dr-chip" disabled={m.done} onClick={() => say("Something else", true)}>Something else</button>
                {drew && (
                  <button type="button" className="dr-chip" disabled={m.done} onClick={() => setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, done: true } : x)), { mypics: true }])}>
                    My pictures
                  </button>
                )}
              </div>
            );
          }
          if (m.chips) {
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                {/* (the smart chat's follow-ups are sent as if typed, so the smart chat answers them too) */}
                {m.chips.map((c) => (
                  <button key={c} type="button" className="dr-chip" disabled={m.done || !!thinking} onClick={() => say(c, !m.smart)}>{c}</button>
                ))}
              </div>
            );
          }
          if (m.retry) {
            // a request that didn't work: the same one again, or something else
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                <button type="button" className="dr-chip dr-retry" disabled={m.done || !!thinking} onClick={() => retry(i, m)}>↻ Try again</button>
                <button type="button" className="dr-chip" disabled={m.done || !!thinking} onClick={() => say("Something else", true)}>Something else</button>
                <button type="button" className="dr-chip" disabled={m.done || !!thinking} onClick={() => say(ASK_TEAM, true)}>{ASK_TEAM}</button>
              </div>
            );
          }
          if (m.mypics) {
            // "My pictures": the pictures made or uploaded before (in any chat); tapping one asks where it goes
            const c = ctx();
            return (
              <div key={i} className="dr-mypics-card">
                <MyPictures loggedIn={c.ai.loggedIn} onLogin={() => onAct({ type: "login" })} find={m.find} limit={6} onPick={(picture) => onAct({ type: "mypic", picture })} onLoaded={() => i === messages.length - 1 && log.current && (log.current.scrollTop = log.current.scrollHeight)} />
              </div>
            );
          }
          if (m.ideas) {
            // the smart chat's ideas: each with the Assistant's own tools — draw it (the plan card first), put its
            // words on the tee, or ask for more like it
            const c = ctx();
            return (
              <div key={i} className="dr-ideas">
                {m.ideas.map((idea, n) => (
                  <div key={`${n}-${idea.title}`} className="dr-idea">
                    <b>{idea.title}</b>
                    {idea.about && <p>{idea.about}</p>}
                    <div className="dr-idea-acts">
                      {idea.picture && c.ai.available && (
                        <button type="button" className="dr-mini" disabled={!!thinking} onClick={() => drawIdea(idea)}>
                          {c.ai.loggedIn ? "Draw this" : "Log in to draw"}
                        </button>
                      )}
                      {idea.words && (
                        <button type="button" className="dr-mini" onClick={() => onAct({ type: "text", text: idea.words })}>Add “{idea.words}” to tee</button>
                      )}
                      <button type="button" className="dr-dact" disabled={!!thinking} onClick={() => say(`More ideas like “${idea.title}”`)}>More like this</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          if (m.slogans) {
            return (
              <div key={i} className="dr-chatcards">
                {m.slogans.map((s) => (
                  <div key={s} className="dr-chatcard">
                    <b>{s}</b>
                    <button type="button" className="dr-mini" onClick={() => onAct({ type: "text", text: s })}>Add to tee</button>
                  </div>
                ))}
              </div>
            );
          }
          if (m.preview) {
            // "Improve my idea": what will be drawn, before any picture request is spent
            // its print area can be changed until it is drawn (the idea still waiting is this one)
            // (one of several pictures: its area is shown, and changed in the plan card under them)
            const live = !thinking && !m.preview.fixed && state.idea?.improved?.prompt === m.preview.prompt;
            const free = ctx().areas.filter((a) => a.free || a.key === m.preview.area);
            const pickArea = (key) => {
              const label = free.find((a) => a.key === key)?.label;
              setMessages((all) => all.map((x, n) => (n === i ? { ...x, preview: { ...x.preview, area: key, areaLabel: label } } : x)));
              setState({ ...state, idea: { ...state.idea, improved: { ...state.idea.improved, area: key } } });
            };
            return <IdeaPreview key={i} preview={m.preview} {...(live ? { areas: free, onArea: pickArea } : {})} />;
          }
          if (m.photoPlan) {
            const c = ctx();
            return (
              <PhotoPlanCard
                key={i}
                plan={m.photoPlan}
                areas={c.areas}
                styles={c.ai.styles}
                photoStyles={c.ai.photoStyles || []}
                ai={c.ai}
                live={i === lastPlan && !m.done && !thinking}
                onChange={(photoPlan) => setMessages((all) => all.map((x, n) => (n === i ? { ...x, photoPlan } : x)))}
                onMake={(plan) => makePhoto(i, plan)}
                onCancel={() => say(NOT_NOW, true)}
              />
            );
          }
          if (m.plan) {
            const c = ctx();
            const live = i === lastPlan && !m.done && !thinking;
            const change = (plan) => setMessages((all) => all.map((x, n) => (n === i ? { ...x, plan } : x)));
            return (
              <PlanCard
                key={i}
                plan={m.plan}
                areas={c.areas}
                styles={c.ai.styles}
                left={c.ai.left}
                live={live}
                onChange={change}
                onDraw={(plan) => drawPlan(i, plan)}
                onImprove={m.plan.improvable && c.ai.text ? () => say(IMPROVE, true) : null}
                onCancel={() => say(NOT_NOW, true)}
              />
            );
          }
          if (m.issues) {
            return (
              <div key={i} className="dr-chatcards">
                {m.issues.map((x) => (
                  <div key={x.id} className={`dr-issue${x.fixed ? " fixed" : ""}`}>
                    <span>{x.text}</span>
                    {x.fixed ? <b>Fixed ✓</b> : <button type="button" className="dr-mini" onClick={() => fix(i, x)}>{x.fixLabel}</button>}
                  </div>
                ))}
              </div>
            );
          }
          if (m.examples) {
            // only what works right now: picture features need the image AI, chat editing needs the text AI
            const c = ctx();
            const list = EXAMPLES.filter((e) => (e.needs === "pictures" ? c.ai.available : e.needs === "text" ? c.ai.text : e.needs === "idea" ? c.ai.available && c.ai.text : true));
            return (
              <div key={i} className="dr-examples">
                {list.map((e) => (
                  <button
                    key={e.title}
                    type="button"
                    className="dr-example"
                    onClick={() => {
                      // (everything happens here in the chat: an example is filled in to send, or started)
                      if (!e.fill) return say(e.say, true);
                      setDraft(e.say);
                      box.current?.focus();
                    }}
                  >
                    <b>{e.title}</b>
                    <span>{e.fill ? `“${e.say}”` : e.hint}</span>
                    {e.fill && e.hint && <span>{e.hint}</span>}
                  </button>
                ))}
              </div>
            );
          }
          if (m.starter) {
            // round 6: the three-tap start — who, what for, what look; the three answers become one brief for the brain
            const step = starterStep(m.starter);
            const picked = ["who", "what", "mood"].filter((k) => m.starter[k]).map((k) => m.starter[k]);
            return (
              <div key={i} className={`dr-starter${m.done ? " done" : ""}`}>
                {picked.length > 0 && <div className="dr-starter-picked">{picked.join(" · ")}</div>}
                {step && !m.done && (
                  <>
                    <div className="dr-starter-ask">{STARTER[step].ask}</div>
                    <div className="dr-chatchips">
                      {starterOptions(m.starter).map((o) => (
                        <button
                          key={o}
                          type="button"
                          className="dr-chip"
                          disabled={!!thinking}
                          onClick={() => {
                            const next = { ...m.starter, [step]: o };
                            if (starterStep(next)) return setMessages((all) => all.map((x, n) => (n === i ? { ...x, starter: next } : x)));
                            setMessages((all) => all.map((x, n) => (n === i ? { ...x, starter: next, done: true } : x)));
                            setTimeout(() => say(starterBrief(next)), 50);
                          }}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          }
          if (m.browse) {
            // an old ideas card, taken out of a very long chat to keep it under the save limit (13 Nov 2026)
            if (m.old) {
              return (
                <div key={i} className="dr-card done dr-oldcard">
                  <small className="dr-card-note">Ideas were shown here.</small>
                  <button type="button" className="dr-chip" disabled={!!thinking || working} onClick={() => say(BROWSE_CHIP, true)}>Browse ideas</button>
                </div>
              );
            }
            // round 7: Browse ideas — featured concept sheets; "Start from this" puts the sheet in this chat
            return (
              <div key={i} className="dr-browse">
                {m.browse.map((idea) => (
                  <div key={idea.id || idea.url} className="dr-idea">
                    <img src={imageUrl(idea.url, 800)} alt={idea.brief || "Concepts"} loading="lazy" />
                    <div className="dr-idea-words">
                      <div className="dr-idea-brief">{idea.brief || (idea.concepts || []).map((c) => c.title).join(" · ")}</div>
                      {idea.brief && <div className="dr-idea-titles">{(idea.concepts || []).map((c) => c.title).join(" · ")}</div>}
                    </div>
                    <button type="button" className="dr-mini" disabled={!!thinking} onClick={() => onAct({ type: "useIdea", idea })}>Start from this</button>
                  </div>
                ))}
                {!m.browse.length && <p className="dr-designhint">No ideas to browse yet — tell me what you want and I’ll show three concepts.</p>}
              </div>
            );
          }
          if (m.version) {
            // round 7: a version of the tee after an AI change — tap to go back to it. A long chat keeps the picture and
            // the tee of its newest 40 versions only (13 Nov 2026): an older one shows its words.
            const canRestore = Array.isArray(m.version.elements);
            return (
              <div key={i} className={`dr-version${m.version.thumb ? "" : " nopic"}`}>
                {m.version.thumb && <img src={m.version.thumb} alt="" />}
                <div className="dr-version-words">
                  <div className="dr-version-label">Version {m.version.n}</div>
                  <div className="dr-designhint">{m.version.label}</div>
                  {!canRestore && <div className="dr-designhint">Older version, picture not kept</div>}
                </div>
                {canRestore && <button type="button" className="dr-mini" disabled={!!thinking} onClick={() => onAct({ type: "restore", version: m.version })}>Go back to this</button>}
              </div>
            );
          }
          if (m.help) {
            // round 6: "Ask the IDENTEE team to finish it" — a line from the customer, then the tee and the chat go to the team
            return <HelpCard key={i} done={m.done} busy={!!thinking} onSend={(note) => {
              setMessages((all) => all.map((x, n) => (n === i ? { ...x, done: true } : x)));
              run({ type: "help", note }, { label: "Sending to the team…", expect: 6 });
            }} />;
          }
          if (m.sheet) {
            // Assistant v2: a concept sheet — tap a number to make that concept (a bare pick, no brain), More options for three more
            return <SheetCard key={i} sheet={m.sheet} live={!thinking} last={i === lastSheet} onPick={(n) => say(String(n))} onMore={() => say("More options")} onSay={(text) => say(text)} />;
          }
          /* round 8: size from height and weight, orders, the same tee again, the group link */
          if (m.sizeAsk) return <SizeCard key={i} ask={m.sizeAsk} ctx={ctx} onUse={(size) => onAct({ type: "size", value: size })} />;
          if (m.orders) {
            return i === lastOrders ? <OrdersCard key={i} ctx={ctx} live={!thinking} /> : <div key={i} className="dr-card done"><small className="dr-card-note">Your orders were shown here. Ask for them again to see them now.</small></div>;
          }
          if (m.reorder) return <ReorderCard key={i} ask={m.reorder} done={m.done} ctx={ctx} live={!thinking} onDone={(text) => patch(i, { done: text })} />;
          if (m.group) {
            return <GroupCard key={i} group={m.group} sheet={lastSheet >= 0 ? messages[lastSheet].sheet : null} ctx={ctx} live={!thinking} onPatch={(more) => patch(i, more)} onSay={(text) => say(text)} onMessages={(msgs) => setMessages((all) => [...all, ...msgs])} />;
          }
          if (m.designs) {
            const areas = ctx().areas.filter((a) => a.free);
            return (
              <div key={i} className="dr-designs">
                {m.designs.map((url) => (
                  <div key={url} className="dr-design">
                    <img src={imageUrl(url, 400)} alt="A design made for you" loading="lazy" style={{ background: fabric }} />
                    {placed[url]?.length ? <span className="dr-onlabel">On {placed[url].join(" and ")} ✓</span> : null}
                    {/* Everything a customer may want with a picture, as buttons (never stuck): what fits depends on whether
                        it is on the tee. Adjust on tee opens it there, ready to resize, move, turn, flip, cut out or sharpen. */}
                    <div className="dr-designacts">
                      {placed[url]?.length ? (
                        <button type="button" className="dr-mini" onClick={() => onAct({ type: "adjustPlaced", url })}>Adjust on tee</button>
                      ) : (
                        <button type="button" className="dr-mini" onClick={() => onAct({ type: "place", url })}>Add to tee</button>
                      )}
                      <button type="button" className="dr-dact" onClick={() => setPickFor(pickFor === url ? null : url)} aria-expanded={pickFor === url}>{placed[url]?.length ? "Move or copy to…" : "Other area…"}</button>
                      {!m.photo && <button type="button" className="dr-dact" disabled={!!thinking} onClick={() => startChange(url)}>Change it</button>}
                      {/* round 8: point at the part that should change (a tap marks it; nothing is drawn on the picture) */}
                      {!m.photo && <button type="button" className="dr-dact" disabled={!!thinking} onClick={() => setSpotFor(url)}>Change a part</button>}
                      {/* liked only one of the pictures: this one comes off the tee (Undo would take off all drawn together) */}
                      {placed[url]?.length ? <button type="button" className="dr-dact out" onClick={() => onAct({ type: "unplace", url })}>Remove from tee</button> : null}
                    </div>
                    {pickFor === url && (
                      <div className="dr-designareas">
                        {/* already on the tee: ask first — on both areas, or moved (it used to be added a second time, silently) */}
                        {areas.map((a) => (
                          <button key={a.key} type="button" className="dr-chip" onClick={() => { setPickFor(null); if (placed[url]?.length) setMoveAsk({ url, key: a.key, label: a.label }); else onAct({ type: "place", url, areaKey: a.key }); }}>{a.label}</button>
                        ))}
                      </div>
                    )}
                    {moveAsk?.url === url && (
                      <div className="dr-moveask" role="group" aria-label={`Put it on ${moveAsk.label}`}>
                        <p>Put it on {moveAsk.label}:</p>
                        <button type="button" className="dr-chip" onClick={() => { setMoveAsk(null); onAct({ type: "place", url, areaKey: moveAsk.key }); }}>Keep on {placed[url].join(" and ")} too</button>
                        <button type="button" className="dr-chip on" onClick={() => { setMoveAsk(null); onAct({ type: "place", url, areaKey: moveAsk.key, move: true }); }}>Move it to {moveAsk.label}</button>
                        <button type="button" className="dr-moveno" onClick={() => setMoveAsk(null)}>Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
                {/* another version, under every set of pictures (it uses one of today's requests) */}
                {m.again && (
                  <button type="button" className="dr-dact dr-tryagain" disabled={!!thinking} onClick={() => tryAnother(m.again)}>
                    ↻ Try another
                  </button>
                )}
                {i === lastDesigns && m.designs.some((u) => placed[u]?.length) && (
                  <p className="dr-designhint">Tap “Adjust on tee” to resize, move or turn it — or just tell me, like “make it bigger” or “move it up”.</p>
                )}
              </div>
            );
          }
          if (m.inks) {
            return (
              <div key={i} className="dr-chatinks">
                {m.inks.map((c) => (
                  <button key={c} type="button" className="dr-ink" style={{ background: c }} aria-label={`Use ink ${c}`} onClick={() => onAct({ type: "ink", color: c })} />
                ))}
              </div>
            );
          }
          if (m.photo) {
            const src = /^blob:/.test(m.photo.url) ? m.photo.url : imageUrl(m.photo.url, 500);
            return (
              <div key={i} className={`dr-msg me dr-photomsg${m.failed ? " failed" : ""}`}>
                <img src={src} alt="The photo you sent" />
                {m.text && <span>{m.text}</span>}
                {m.failed && <small>Not sent</small>}
              </div>
            );
          }
          return <div key={i} className={`dr-msg ${m.from}`}>{m.text}</div>;
        })}
        {thinking === true && <div className="dr-typing">Thinking…</div>}
        {thinking && thinking !== true && <WaitCard key={`${messages.length}-${thinking.label}`} {...thinking} tips={WAIT_TIPS} onStop={thinking.noStop ? undefined : stop} />}
        {/* the Assistant was closed and opened again while a request ran: it is still on its way (Send waits for it) */}
        {working && !thinking && <div className="dr-typing">Still working on your last request…</div>}
      </div>
      {spotFor && <SpotPicker url={spotFor} fabric={fabric} onClose={() => setSpotFor(null)} onUse={(words) => { const url = spotFor; setSpotFor(null); startChange(url, words); }} />}
      {/* round 8: how many pictures are left today, so the limit is never a surprise */}
      {left && <p className="dr-leftline">{left}</p>}
      {/* while the assistant works, the customer can type the next message; it is sent when it's done */}
      {thinking && thinking !== true && !speaking && <p className="dr-busynote">I’m still on your last request. Changed your mind? Press Stop. You can also type your next one; Send works again as soon as I’m done.</p>}
      {/* round 9: talking with the Assistant — the words heard wait a moment before they are sent (Wait keeps them to
          fix); the answer being read out (Stop, or Turn off for good); a short note (why the mic couldn't listen …) */}
      {autoSend ? (
        <div className="dr-voicebar" role="status">
          <span>Sending what I heard…</span>
          <button type="button" className="dr-chip" onClick={() => { setAutoSend(""); box.current?.focus(); }}>Wait</button>
        </div>
      ) : speaking ? (
        <div className="dr-voicebar" role="status">
          <span>🔊 Reading my answer…</span>
          <button type="button" className="dr-chip" onClick={stopReading}>Stop</button>
          <button type="button" className="dr-chip" onClick={toggleReadAloud} title="Don’t read my answers aloud">Turn off</button>
        </div>
      ) : voiceNote ? (
        <div className="dr-voicebar note" role="status">
          <span>{voiceNote}</span>
          <button type="button" className="dr-voicebar-x" onClick={() => setVoiceNote("")} aria-label="Close this note">✕</button>
        </div>
      ) : null}
      {/* the message box: one rounded box — the words on top, a slim row of buttons inside it underneath
          (📎 a photo, 🎤 the mic and its language, 🔊 reading aloud, 💡 Suggest — or ✨ Improve my idea in the old
          chat —, the count near the limit, and Send) */}
      <form
        className="dr-composer dr-cbox"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft.trim(), fromMic.current);
        }}
      >
        {attached && (
          <div className="dr-attached">
            <img src={attached.local} alt="The photo you picked" />
            <span>Photo ready. Say what you want with it, then tap Send.</span>
            <button type="button" className="dr-attached-x" onClick={dropAttached} aria-label="Remove the photo">✕</button>
          </div>
        )}
        <input ref={photoBox} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; attachPhoto(file); }} />
        <textarea
          ref={box}
          rows={1}
          value={draft}
          onChange={(e) => {
            holdHeard();
            setAutoSend("");
            if (!e.target.value.trim()) fromMic.current = false; // (emptied: what is typed next wasn't spoken)
            setDraft(e.target.value);
          }}
          // round 9: a tap on the words heard stops them being sent, so they can be fixed first (on an iPhone the box
          // may still have the focus, so a tap doesn't always focus it again: the press counts too). 13 Nov 2026: also
          // while the mic still listens — it stops, and the words wait in the box
          onPointerDown={() => {
            holdHeard();
            if (autoSend) setAutoSend("");
          }}
          onFocus={() => {
            holdHeard();
            if (autoSend) setAutoSend("");
          }}
          // Enter sends (as before); Shift+Enter starts a new line (not while an Indian-language keyboard is still composing)
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={attached ? "What should I do with it?" : speechSupported() ? "Describe your idea, or tap 🎤…" : "Describe your idea…"}
          aria-label={attached ? "What should I do with this photo?" : "Message the design assistant"}
          maxLength={PROMPT_MAX}
          autoComplete="off"
        />
        <div className="dr-cbar">
          <button type="button" className={`dr-attach${nudging ? " nudge" : ""}`} onClick={pickPhoto} disabled={!!thinking} aria-label="Send a photo" title="Send a photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
            </svg>
          </button>
          {speechSupported() && (
            <button type="button" className={`dr-mic${listening ? " on" : ""}`} onClick={toggleListen} disabled={!!thinking && !listening} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak your message"} title={listening ? "Listening… tap to stop" : "Speak to me. I send it when you stop."}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
              </svg>
            </button>
          )}
          {speechSupported() && (
            <button type="button" className="dr-miclang" disabled={listening || !!thinking} onClick={() => { const next = nextMicLang(micLang); setMicLang(next); saveMicLang(next); }} aria-label={`You speak in ${mic.name}. Tap to change the language.`} title={`You speak in ${mic.name}. Tap to change.`}>{mic.label}</button>
          )}
          {/* round 9: answers to what is spoken are read aloud — on or off, remembered on this device */}
          {speechSupported() && voiceOutSupported() && (
            <button type="button" className={`dr-speak${readAloud ? " on" : ""}`} onClick={toggleReadAloud} aria-pressed={readAloud} aria-label="Read my answers aloud" title={readAloud ? "When you speak, I answer out loud. Tap to turn off." : "My answers aren’t read aloud. Tap to turn on."}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d={readAloud ? "M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" : "m16 9 6 6M22 9l-6 6"} />
              </svg>
            </button>
          )}
          {/* 💡 Suggest (round 9): ideas for the tee as it is now — nothing changes until one is tapped. It took the place
              of ✨ Improve in the new Assistant (both don't fit on a phone). Hidden while words are in the box (Send is
              the button then, and the row stays short when the count shows) or a photo waits. */}
          {ctx().ai.v2 && !attached && !draft.trim() && (
            <button type="button" className="dr-improve dr-suggest" disabled={!!thinking || working || listening} onClick={suggest} title="Ideas for your tee as it is now. Nothing changes until you tap one.">
              <span aria-hidden="true">💡</span>
              {SUGGEST.label}
            </button>
          )}
          {/* what is typed is made clear first, free — always here (the examples list is only at the start of a chat);
              not while a photo waits to be sent (what is typed then is about the photo). Old chat only (round 9). */}
          {!ctx().ai.v2 && ctx().ai.available && ctx().ai.text && !attached && (
            <button
              type="button"
              className="dr-improve"
              disabled={!!thinking}
              title={draft.trim().length >= 3 ? "Makes what you typed clear first. Free." : "Free. Shows what you’ll get before drawing."}
              onClick={() => {
                const idea = draft.trim();
                if (say(idea.length >= 3 ? `${IMPROVE}: ${idea}` : IMPROVE, true)) setDraft("");
              }}
            >
              {IMPROVE} <small>free</small>
            </button>
          )}
          <span className="dr-cbar-gap" />
          {draft.length > PROMPT_MAX - 300 && <span className="dr-count" aria-live="polite">{draft.length} / {PROMPT_MAX}</span>}
          <button type="submit" className="dr-send" disabled={!!thinking || working} aria-label={thinking || working ? "Wait — the assistant is still working" : "Send"} title={thinking || working ? "Still working…" : "Send"}>
            {thinking || working ? (
              <span className="dr-send-wait" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// "Ask the IDENTEE team to finish it" (round 6, 8 Nov 2026): one line from the customer, sent with their tee and chat
function HelpCard({ done, busy, onSend }) {
  const [note, setNote] = useState("");
  return (
    <div className={`dr-helpcard${done ? " done" : ""}`}>
      <div className="dr-starter-ask">Our designers can finish it for you. In a line, what should the tee be?</div>
      {!done ? (
        <>
          <textarea className="dr-helpnote" rows={3} maxLength={1000} placeholder="e.g. A black tee for our cricket team, our logo on the front and the players’ names on the back" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="dr-chatchips">
            <button type="button" className="dr-chip on" disabled={busy || note.trim().length < 3} onClick={() => onSend(note.trim())}>Send to the IDENTEE team</button>
          </div>
          <p className="dr-designhint">Your tee as it is now and this chat go with it. A designer gets in touch on WhatsApp, usually within a day. Free.</p>
        </>
      ) : (
        <p className="dr-designhint">Sent.</p>
      )}
    </div>
  );
}
