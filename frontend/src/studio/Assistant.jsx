// studio/Assistant.jsx
//
// The Design Room's design assistant: a guided chat in the "What to add"
// panel. This version costs nothing to run — what it says and does is
// written in assistantScript.js (slogans, layouts, the design check, colour /
// print-area / size help). The paid AI parts can replace those scripted
// replies later (see docs/AI_PLAN.md).
import { useEffect, useRef, useState } from "react";
import { EXAMPLES, replyTo } from "./assistantScript";
import { imageUrl } from "../utils/imageUrl";

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
export default function Assistant({ messages, setMessages, state, setState, ctx, onAct, onFix, placed = {}, fabric }) {
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false); // false | true | a line of text to show while waiting
  const [pickFor, setPickFor] = useState(null); // the design whose "Other area" list is open
  const log = useRef(null);
  const box = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, thinking]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // tapped: the customer tapped a choice (typed messages may be sent to the text AI; taps never are)
  const say = (text, tapped = false) => {
    if (thinking || !text) return;
    // the chips just answered can't be tapped again
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text }]);
    const { out, st } = replyTo(text, ctx(), state, { tapped });
    setState(st);
    const reply = out.filter((o) => !o.act);
    const slow = out.find((o) => ["generate", "slogans", "edit"].includes(o.act?.type));
    if (slow) {
      // the AI: wait for the answer, then show what the page hands back
      setThinking(slow.act.type === "edit" ? "Working on it… (a picture takes about 20 seconds)" : slow.act.type === "slogans" ? "Writing a few…" : slow.act.photoUrl ? (/free/i.test(slow.act.artStyle || "") ? "Making your art…" : "Redrawing your photo… this takes about 20 seconds.") : slow.act.baseUrl ? "Changing your design… this takes about 20 seconds." : "Drawing your designs… this takes about 20 seconds.");
      Promise.resolve(onAct(slow.act)).then((made) => {
        setThinking(false);
        setMessages((m) => [...m, ...(made || []), ...reply]);
      });
      return;
    }
    out.filter((o) => o.act).forEach((o) => onAct(o.act));
    if (!reply.length) return;
    setThinking(true);
    timer.current = setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
    }, 450);
  };
  // "Change" on a design: the next thing typed is the change to make
  const startChange = (url) => {
    if (thinking) return;
    setState({ ...state, wait: "aiChange", changeUrl: url });
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "bot", text: "What should I change? For example: make it angrier, remove the crown, add the team name under it." }]);
  };
  const fix = (i, issue) => {
    onFix(issue);
    setMessages((m) => m.map((x, n) => (n === i ? { ...x, issues: x.issues.map((y) => (y.id === issue.id ? { ...y, fixed: true } : y)) } : x)));
  };

  return (
    <div className="dr-chat">
      <div className="dr-chatlog" ref={log} aria-live="polite">
        {messages.map((m, i) => {
          if (m.chips) {
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                {m.chips.map((c) => (
                  <button key={c} type="button" className="dr-chip" disabled={m.done} onClick={() => say(c, true)}>{c}</button>
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
            const list = EXAMPLES.filter((e) => (e.needs === "pictures" ? c.ai.available : e.needs === "text" ? c.ai.text : true));
            return (
              <div key={i} className="dr-examples">
                {list.map((e) => (
                  <button
                    key={e.title}
                    type="button"
                    className="dr-example"
                    onClick={() => {
                      if (!e.fill) return say(e.say, true);
                      setDraft(e.say);
                      box.current?.focus();
                    }}
                  >
                    <b>{e.title}</b>
                    <span>{e.fill ? `“${e.say}”` : e.hint}</span>
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
        {thinking && <div className="dr-typing">{thinking === true ? "Thinking…" : thinking}</div>}
      </div>
      <form
        className="dr-composer"
        onSubmit={(e) => {
          e.preventDefault();
          say(draft.trim());
          setDraft("");
        }}
      >
        <input ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Try: a tiger on the front, a tree on the back" aria-label="Message the design assistant" maxLength={400} autoComplete="off" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
