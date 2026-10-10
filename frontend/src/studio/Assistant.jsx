// studio/Assistant.jsx
//
// The Design Room's design assistant: a guided chat in the "What to add"
// panel. This first version costs nothing to run — the answers are written
// here (slogan lists, pointers to the art library and upload). The paid AI
// parts (made-to-order designs, background removal) are announced as
// "coming soon" and can replace these scripted replies later
// (see docs/AI_PLAN.md).
import { useEffect, useRef, useState } from "react";
import { replyTo } from "./assistantScript";

/**
 * messages / setMessages live in the page, so the chat is still there after
 * switching tabs. onAddText(text) puts a line on the tee; onGo(tab) opens
 * another "What to add" tab.
 */
export default function Assistant({ messages, setMessages, areaLabel, onAddText, onGo }) {
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const log = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, thinking]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (text) => {
    if (thinking || !text) return;
    // the chips just answered can't be tapped again
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), { from: "me", text }]);
    const reply = replyTo(text, areaLabel);
    const go = reply.find((r) => r.go);
    if (go) return onGo(go.go);
    setThinking(true);
    timer.current = setTimeout(() => {
      setThinking(false);
      setMessages((m) => [...m, ...reply]);
    }, 450);
  };

  return (
    <div className="dr-chat">
      <div className="dr-chatlog" ref={log} aria-live="polite">
        {messages.map((m, i) => {
          if (m.chips) {
            return (
              <div key={i} className={`dr-chatchips${m.done ? " done" : ""}`}>
                {m.chips.map((c) => (
                  <button key={c} type="button" className="dr-chip" disabled={m.done} onClick={() => say(c)}>{c}</button>
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
                    <button type="button" className="dr-mini" onClick={() => onAddText(s)}>Add to tee</button>
                  </div>
                ))}
              </div>
            );
          }
          return <div key={i} className={`dr-msg ${m.from}`}>{m.text}</div>;
        })}
        {thinking && <div className="dr-typing">Thinking…</div>}
      </div>
      <form
        className="dr-composer"
        onSubmit={(e) => {
          e.preventDefault();
          say(draft.trim());
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A slogan for my gym team" aria-label="Message the design assistant" maxLength={200} autoComplete="off" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
