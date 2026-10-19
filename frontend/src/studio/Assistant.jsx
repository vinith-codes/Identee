// studio/Assistant.jsx
//
// The Design Room's design assistant: a guided chat in the "What to add"
// panel. This version costs nothing to run — what it says and does is
// written in assistantScript.js (slogans, layouts, the design check, colour /
// print-area / size help). The paid AI parts can replace those scripted
// replies later (see docs/AI_PLAN.md).
import { useEffect, useRef, useState } from "react";
import { CANCEL, EXAMPLES, IMPROVE, replyTo } from "./assistantScript";
import { imageUrl } from "../utils/imageUrl";
import WaitCard from "./WaitCard";
import IdeaPreview from "./IdeaPreview";

const PICTURE_HINT = "Usually 20–40 seconds. You can look around the room meanwhile.";
// What the wait card says for an AI job: { label, expect (usual seconds), hint }
const waitFor = (a) =>
  a.type === "edit"
    ? { label: "Working on it…", expect: 8, hint: "If you asked for pictures, each one takes about 20–40 seconds." }
    : a.type === "slogans"
      ? { label: "Writing a few…", expect: 6 }
      : a.type === "improve"
        ? { label: "Improving your idea…", expect: 9 }
      : a.photoUrl
        ? /free/i.test(a.artStyle || "")
          ? { label: "Making your art…", expect: 5 }
          : { label: "Redrawing your photo…", expect: 35, hint: PICTURE_HINT }
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
export default function Assistant({ messages, setMessages, state, setState, ctx, onAct, onFix, placed = {}, fabric, autoSay, onAutoSaid }) {
  const [draft, setDraft] = useState("");
  // false | true (a short "Thinking…") | { label, expect, hint } for the AI: a card with a live seconds count
  const [thinking, setThinking] = useState(false);
  const [pickFor, setPickFor] = useState(null); // the design whose "Other area" list is open
  const log = useRef(null);
  const box = useRef(null);
  const timer = useRef(null);
  const job = useRef(null); // the AI request running now: { act, stopped }

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, thinking]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The customer must never be stuck: every slow AI job ends (also when it fails), a failed one gets a
  // "Try again" (the same request — nothing to type again), and while it runs the chat says so.
  const run = (act, wait, after = []) => {
    setThinking(wait);
    const me = { act, wait, stopped: false };
    job.current = me;
    // the page may say what it is doing now (a chat request that turned into drawing two pictures)
    Promise.resolve()
      .then(() => onAct(act, (now) => !me.stopped && setThinking(now), me))
      .then((made) => made || [])
      .catch(() => [{ from: "bot", text: "Something went wrong on my side." }, { failed: true }])
      .then((made) => {
        if (me.stopped) {
          // Stopped, but a picture finished anyway: it was already counted, so it is offered (not put on the tee)
          const pics = made.filter((x) => x.designs);
          if (pics.length) setMessages((m) => [...m, { from: "bot", text: "The picture you stopped finished anyway, so it’s here if you want it. Nothing was added to your tee." }, ...pics.map((x) => ({ ...x, again: null }))]);
          return;
        }
        job.current = null;
        setThinking(false);
        // { failed: true } from the page = this request can simply be tried again; { retry: act } = try that one
        const out = made.map((x) => (x.failed ? { retry: act, wait } : x.retry && !x.wait ? { ...x, wait: waitFor(x.retry) } : x));
        setMessages((m) => [...m, ...out, ...after]);
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
    const drawing = now.act.type === "generate" || now.act.type === "edit";
    setMessages((m) => [
      ...m,
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
    setMessages((m) => [...m.map((x) => (x.chips || x.retry ? { ...x, done: true } : x)), { from: "me", text }]);
    const { out, st } = replyTo(text, ctx(), state, { tapped });
    setState(st);
    const fill = out.find((o) => o.fill);
    if (fill) {
      setDraft(fill.fill);
      setTimeout(() => box.current?.focus(), 500);
    }
    const reply = out.filter((o) => !o.act && !o.fill);
    const slow = out.find((o) => ["generate", "slogans", "edit", "improve"].includes(o.act?.type));
    if (slow) {
      // the AI: wait for the answer, then show what the page hands back
      run(slow.act, waitFor(slow.act), reply);
      return true;
    }
    out.filter((o) => o.act).forEach((o) => onAct(o.act));
    if (!reply.length) return true;
    setThinking(true);
    timer.current = setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
    }, 450);
    return true;
  };
  // the idea typed on the home page: sent once the chat is open (a moment later, so the room is ready)
  useEffect(() => {
    if (!autoSay) return;
    const t = setTimeout(() => {
      if (say(autoSay)) onAutoSaid?.();
    }, 400);
    return () => clearTimeout(t);
  }, [autoSay]); // eslint-disable-line react-hooks/exhaustive-deps
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

  return (
    <div className="dr-chat">
      <div className="dr-chatlog" ref={log} aria-live="polite">
        {messages.map((m, i) => {
          if (m.chips) {
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                {m.chips.map((c) => (
                  <button key={c} type="button" className="dr-chip" disabled={m.done || !!thinking} onClick={() => say(c, true)}>{c}</button>
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
            const live = !thinking && state.idea?.improved?.prompt === m.preview.prompt;
            const free = ctx().areas.filter((a) => a.free || a.key === m.preview.area);
            const pickArea = (key) => {
              const label = free.find((a) => a.key === key)?.label;
              setMessages((all) => all.map((x, n) => (n === i ? { ...x, preview: { ...x.preview, area: key, areaLabel: label } } : x)));
              setState({ ...state, idea: { ...state.idea, improved: { ...state.idea.improved, area: key } } });
            };
            return <IdeaPreview key={i} preview={m.preview} {...(live ? { areas: free, onArea: pickArea } : {})} />;
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
                      // drawing and photos have their own tabs (Draw, Photo) in the AI panel
                      if (e.tab) return onAct({ type: "aiTab", tab: e.tab, style: e.style });
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
                    {/* every design stays usable: Add to tee replaces what the assistant put on this area; Other area uses it somewhere else as well */}
                    <button type="button" className="dr-mini" onClick={() => onAct({ type: "place", url })}>Add to tee</button>
                    <div className="dr-designlinks">
                      <button type="button" onClick={() => setPickFor(pickFor === url ? null : url)} aria-expanded={pickFor === url}>Other area</button>
                      <button type="button" onClick={() => startChange(url)}>Change</button>
                    </div>
                    {pickFor === url && (
                      <div className="dr-designareas">
                        {areas.map((a) => (
                          <button key={a.key} type="button" className="dr-chip" onClick={() => { setPickFor(null); onAct({ type: "place", url, areaKey: a.key }); }}>{a.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {m.again && i === lastDesigns && (
                  <button type="button" className="dr-mini dr-tryagain" disabled={!!thinking} onClick={() => tryAnother(m.again)}>
                    ↻ Try another
                  </button>
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
          return <div key={i} className={`dr-msg ${m.from}`}>{m.text}</div>;
        })}
        {thinking === true && <div className="dr-typing">Thinking…</div>}
        {thinking && thinking !== true && <WaitCard key={`${messages.length}-${thinking.label}`} {...thinking} onStop={stop} />}
      </div>
      {/* while the assistant works, the customer can type the next message; it is sent when it's done */}
      {thinking && thinking !== true && <p className="dr-busynote">I’m still on your last request. Changed your mind? Press Stop. You can also type your next one; Send works again as soon as I’m done.</p>}
      {/* always here (the examples list is only at the start of a chat): what is typed is made clear first, free */}
      {ctx().ai.available && ctx().ai.text && (
        <div className="dr-improve-row">
          <button
            type="button"
            className="dr-improve"
            disabled={!!thinking}
            onClick={() => {
              const idea = draft.trim();
              if (say(idea.length >= 3 ? `${IMPROVE}: ${idea}` : IMPROVE, true)) setDraft("");
            }}
          >
            {IMPROVE}
          </button>
          <span>{draft.trim().length >= 3 ? "Makes what you typed clear first. Free." : "Free. Shows what you’ll get before drawing."}</span>
        </div>
      )}
      <form
        className="dr-composer"
        onSubmit={(e) => {
          e.preventDefault();
          // only cleared when it was sent (pressing Send while busy keeps what was typed)
          if (say(draft.trim())) setDraft("");
        }}
      >
        <input ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Try: a tiger on the front, a tree on the back" aria-label="Message the design assistant" maxLength={400} autoComplete="off" />
        <button type="submit" disabled={!!thinking} aria-label={thinking ? "Wait — the assistant is still working" : "Send"}>
          {thinking ? "Wait…" : "Send"}
        </button>
      </form>
    </div>
  );
}
