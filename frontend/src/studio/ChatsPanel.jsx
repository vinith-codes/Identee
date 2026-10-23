// studio/ChatsPanel.jsx — "Chats" in the Assistant (23 Oct 2026): the customer's earlier chats, each with the tee
// it was designing, and "New chat". It covers the chat while open; the chats themselves live in chatStore.js.
import { useEffect, useState } from "react";
import { listChats, removeChat } from "./chatStore";

const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/**
 *   currentId    the chat open now (marked, and not deletable here)
 *   saveNow()    saves the open chat first, so the list shows it as it is
 *   onOpen(c)    open an earlier chat (a summary from the list)
 *   onNew()      start a new chat (and an empty tee)
 *   about(c)     a short line for a chat: the garment and colour → { text, hex }
 *   loggedIn / onLogin   visitors are told their chats stay on this device
 *   locked       an AI job is running: switching chats waits for it
 */
export default function ChatsPanel({ currentId, saveNow, onOpen, onNew, onClose, about, loggedIn, onLogin, locked }) {
  const [state, setState] = useState({ loading: true, chats: [], error: "" });
  const [asking, setAsking] = useState(null); // the chat whose "Delete?" is showing
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.resolve(saveNow?.())
      .catch(() => {})
      .then(listChats)
      .then((r) => alive && setState({ loading: false, ...r }));
    return () => {
      alive = false;
    };
  }, [tries]); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = async (id) => {
    setAsking(null);
    setState((s) => ({ ...s, chats: s.chats.filter((c) => c.id !== id) }));
    try {
      await removeChat(id);
    } catch {
      setState((s) => ({ ...s, error: "Couldn’t delete that chat. Try again." }));
      setTries((n) => n + 1);
    }
  };

  const shown = state.chats;
  return (
    <div className="dr-chats" role="dialog" aria-label="Your chats">
      <div className="dr-chats-head">
        <b>Your chats</b>
        <button type="button" className="dr-chats-x" aria-label="Back to the chat" onClick={onClose}>
          ✕
        </button>
      </div>
      <button type="button" className="dr-chats-new" disabled={locked} onClick={onNew}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
        <small>Starts an empty tee. This chat stays saved here.</small>
      </button>
      {locked && <p className="dr-chats-note">The Assistant is still working. You can switch chats when it has finished.</p>}
      {!loggedIn && (
        <p className="dr-chats-note">
          Your chats are saved on this device.{" "}
          <button type="button" className="dr-linkbtn" onClick={onLogin}>
            Log in
          </button>{" "}
          to keep them on all your devices.
        </p>
      )}
      {state.error && (
        <p className="dr-chats-note bad">
          {state.error}{" "}
          <button type="button" className="dr-linkbtn" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <div className="dr-chats-list">
        {state.loading && <p className="dr-chats-note">Loading your chats…</p>}
        {!state.loading && !shown.length && <p className="dr-chats-note">No saved chats yet. When you talk to the Assistant or design a tee, it’s saved here.</p>}
        {shown.map((c) => {
          const now = c.id === currentId;
          const info = about?.(c) || {};
          return (
            <div key={c.id} className={`dr-chatrow${now ? " now" : ""}`}>
              {asking === c.id ? (
                <div className="dr-chatask">
                  <span>Delete this chat and its design for good?</span>
                  <button type="button" className="dr-chatask-yes" onClick={() => drop(c.id)}>
                    Delete
                  </button>
                  <button type="button" className="dr-chatask-no" onClick={() => setAsking(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="dr-chatopen" disabled={now || locked} onClick={() => onOpen(c)} aria-current={now ? "true" : undefined}>
                    <span className="dr-chatdot" style={{ background: info.hex || "var(--line)" }} aria-hidden="true" />
                    <span className="dr-chatwords">
                      <b>{c.title || "My design"}</b>
                      <small>
                        {now ? "Open now" : ago(c.updatedAt)}
                        {info.text ? ` · ${info.text}` : ""}
                      </small>
                    </span>
                  </button>
                  {!now && (
                    <button type="button" className="dr-chatdel" aria-label={`Delete the chat “${c.title || "My design"}”`} title="Delete" onClick={() => setAsking(c.id)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
