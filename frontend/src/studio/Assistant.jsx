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
import { PhotoError, shrinkPhoto } from "./shrinkPhoto";

const PICTURE_HINT = "Usually 20–40 seconds. You can look around the room meanwhile.";
// the acts that take a while (an AI or the server): the chat waits for them with a wait card
const SLOW = ["generate", "slogans", "edit", "improve", "drawPlan", "photoPlace", "photoUnderstand", "photoMake", "smart"];
// What the wait card says for an AI job: { label, expect (usual seconds), hint }
const waitFor = (a) =>
  a.type === "smart"
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
export default function Assistant({ messages, setMessages, state, setState, ctx, onAct, onFix, placed = {}, fabric, autoSay, onAutoSaid, onWorking, photoNudge = 0 }) {
  const [draft, setDraft] = useState("");
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

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, thinking]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The customer must never be stuck: every slow AI job ends (also when it fails), a failed one gets a
  // "Try again" (the same request — nothing to type again), and while it runs the chat says so.
  const run = (act, wait, after = []) => {
    setThinking(wait);
    onWorking?.(true);
    const me = { act, wait, stopped: false };
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
          const pics = made.filter((x) => x.designs);
          setMessages((m) => {
            const rest = m.filter((x) => !x.pending);
            return pics.length ? [...rest, { from: "bot", text: "The picture you stopped finished anyway, so it’s here if you want it. Nothing was added to your tee." }, ...pics.map((x) => ({ ...x, again: null }))] : rest;
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
          answer(back.fallback.text, false);
          return;
        }
        // { failed: true } from the page = this request can simply be tried again; { retry: act } = try that one
        const out = made.flatMap((x) => (x.menu ? helper(x.menu) : [x])).map((x) => (x.failed ? { retry: act, wait } : x.retry && !x.wait ? { ...x, wait: waitFor(x.retry) } : x));
        setMessages((m) => [...m.filter((x) => !x.pending), ...out, ...after]);
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
    const drawing = now.act.type === "generate" || now.act.type === "edit";
    setMessages((m) => [
      ...m.filter((x) => !x.pending),
      { from: "me", text: "Stop" },
      { from: "bot", text: drawing ? "Stopped. Nothing was changed on your tee. (If the picture was already being drawn, it may still count as one of today’s requests.)" : "Stopped." },
      { retry: now.act, wait: now.wait },
    ]);
  };
  const retry = (i, m) => {
    if (thinking) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: "Try again" }]);
    run(m.retry, m.wait);
  };

  // tapped: the customer tapped a choice (typed messages may be sent to the text AI; taps never are)
  const say = (text, tapped = false) => {
    if (thinking || !text) return false;
    // the chips just answered can't be tapped again
    // ("Not now" on a plan card closes that card too)
    setMessages((m) => [...m.map((x) => (x.chips || x.retry || ((x.plan || x.photoPlan) && text === NOT_NOW) ? { ...x, done: true } : x)), { from: "me", text }]);
    // the smart Assistant (23 Oct 2026): a typed message goes to Google's text AI — unless it answers a question the
    // fixed chat just asked, is a button's own words, or is a pasted player list (assistantScript.smartCanAnswer).
    // Taps never go there. If it can't answer, the fixed replies below answer instead.
    if (!tapped && smartCanAnswer(text, ctx(), state)) {
      const a = { type: "smart", text };
      run(a, waitFor(a));
      return true;
    }
    return answer(text, tapped);
  };
  // The fixed replies (assistantScript.replyTo), as before the smart Assistant: every tap, and typed messages when
  // the smart chat is off or couldn't answer.
  const answer = (text, tapped = false) => {
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
      run(slow.act, waitFor(slow.act), reply);
      return true;
    }
    // ("Upload a photo" opens 📎's picker here — still inside the tap, so phones allow it)
    out.filter((o) => o.act).forEach((o) => (o.act.type === "photoPick" ? pickPhoto() : onAct(o.act)));
    if (!reply.length) return true;
    setThinking(true);
    timer.current = setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
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
    if (thinking) return;
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
    if (thinking) return;
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
    } catch (err) {
      setMessages((m) => [...m, { from: "bot", text: err instanceof PhotoError ? err.message : "The photo couldn’t be prepared. Try another one." }]);
    }
  };
  const dropAttached = () => {
    if (attached) URL.revokeObjectURL(attached.local);
    setAttached(null);
  };
  const sendPhoto = async (ready, words) => {
    if (!ready || thinking) return;
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
    // words came with the photo: it is read with them now (no menu to pick from)
    const next = out.find((x) => x.next)?.next;
    if (sent && next) run(next, waitFor(next));
  };
  // "Change" on a design: the next thing typed is the change to make
  const startChange = (url) => {
    if (thinking) return;
    setState({ ...state, wait: "aiChange", changeUrl: url });
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "bot", text: "What should I change? For example: make it angrier, remove the crown, add the team name under it." }, { chips: [CANCEL] }]);
  };
  // "Try another": the same request again — a new picture (it uses one of the customer's requests for today)
  const tryAnother = (act) => {
    if (thinking || !act) return;
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text: "Try another one" }]);
    run(act, act.photoUrl ? waitFor(act) : { ...waitFor(act), label: "Drawing another one…" });
  };
  const fix = (i, issue) => {
    onFix(issue);
    setMessages((m) => m.map((x, n) => (n === i ? { ...x, issues: x.issues.map((y) => (y.id === issue.id ? { ...y, fixed: true } : y)) } : x)));
  };

  // "Try another" sits under the newest pictures only
  const lastDesigns = messages.reduce((last, m, i) => (m.designs ? i : last), -1);
  // only the newest plan can still be changed and drawn (a drawing plan or a photo plan)
  const lastPlan = messages.reduce((last, m, i) => (m.plan || m.photoPlan ? i : last), -1);
  // "Make it" on a photo plan
  const makePhoto = (i, plan) => {
    if (thinking) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, photoPlan: plan, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: "Make it" }]);
    const a = { type: "photoMake", job: plan.job, areaKey: plan.areaKey, areaKeys: plan.areaKeys || [], style: plan.style, change: plan.change, subject: plan.subject, design: plan.design, words: plan.words, cutOut: plan.cutOut, enhance: !!plan.enhance };
    run(a, waitFor(a));
  };
  // Draw on the plan card: the plan is kept as it was drawn, and the pictures are made one after the other
  const drawPlan = (i, plan) => {
    if (thinking) return;
    setMessages((all) => [...all.map((x, n) => (n === i ? { ...x, plan, done: true } : x.chips ? { ...x, done: true } : x)), { from: "me", text: `Draw ${plan.items.length > 1 ? "them" : "it"}` }]);
    setState({ ...state, idea: null });
    const a = { type: "drawPlan", items: plan.items, style: plan.style };
    run(a, waitFor(a));
  };

  return (
    <div className="dr-chat">
      <div className="dr-chatlog" ref={log} aria-live="polite">
        {messages.map((m, i) => {
          if (m.pending) {
            // the request running now (nothing to show), or one a reload cut off (the answer never came)
            if (thinking) return null;
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                <span className="dr-msg bot">That request was cut off — the page reloaded before I could answer.</span>
                <button type="button" className="dr-chip dr-retry" disabled={m.done} onClick={() => retry(i, { retry: m.pending, wait: m.wait })}>↻ Try again</button>
                <button type="button" className="dr-chip" disabled={m.done} onClick={() => say("Something else", true)}>Something else</button>
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
        {thinking && thinking !== true && <WaitCard key={`${messages.length}-${thinking.label}`} {...thinking} onStop={thinking.noStop ? undefined : stop} />}
      </div>
      {/* while the assistant works, the customer can type the next message; it is sent when it's done */}
      {thinking && thinking !== true && <p className="dr-busynote">I’m still on your last request. Changed your mind? Press Stop. You can also type your next one; Send works again as soon as I’m done.</p>}
      {/* the message box: one rounded box — the words on top, a slim row of buttons inside it underneath
          (📎 a photo, ✨ Improve my idea — free, the count near the limit, and Send) */}
      <form
        className="dr-composer dr-cbox"
        onSubmit={(e) => {
          e.preventDefault();
          if (thinking) return;
          // a photo waiting in the box: it goes with what was typed (or alone, and then I ask)
          if (attached) return sendPhoto(attached, draft.trim());
          // only cleared when it was sent (pressing Send while busy keeps what was typed)
          if (say(draft.trim())) setDraft("");
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
          onChange={(e) => setDraft(e.target.value)}
          // Enter sends (as before); Shift+Enter starts a new line (not while an Indian-language keyboard is still composing)
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={attached ? "What should I do with it?" : "Describe your idea…"}
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
          {/* what is typed is made clear first, free — always here (the examples list is only at the start of a chat);
              not while a photo waits to be sent (what is typed then is about the photo) */}
          {ctx().ai.available && ctx().ai.text && !attached && (
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
          <button type="submit" className="dr-send" disabled={!!thinking} aria-label={thinking ? "Wait — the assistant is still working" : "Send"} title={thinking ? "Still working…" : "Send"}>
            {thinking ? (
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
