// studio/SheetCard.jsx — a concept sheet in the chat (Assistant v2, 7 Nov 2026): one picture with three numbered tees.
// Tapping the picture zooms it (a tap on a picture means "look closer"); making a concept is always a Make button —
// the numbered ones under the picture, or the one under each tee in the zoomed view.
import { useState } from "react";
import { createPortal } from "react-dom";
import { imageUrl } from "../utils/imageUrl";
import { FEEDBACK } from "./assistantExtras";

// last + onSay (round 8): the newest sheet also gets one-tap feedback ("Too busy", "Other colours" ...)
export default function SheetCard({ sheet, live = true, last = false, onPick, onMore, onSay }) {
  const [open, setOpen] = useState(false); // the large view
  const [copied, setCopied] = useState(false); // Share (round 5): the link went to the clipboard
  // the phone's share sheet with the sheet's link (WhatsApp …); else the link is copied
  const share = async () => {
    const url = imageUrl(sheet.url, 2000);
    const text = `Which one — ${concepts.map((c) => c.n).join(", ")}? My tee concepts on IDENTEE`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My tee concepts", text, url });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  const concepts = sheet.concepts || [];
  const developed = new Set(sheet.developed || []);
  const make = (n) => {
    if (!live) return;
    setOpen(false);
    onPick?.(n);
  };
  return (
    <div className="dr-sheet" data-done={live ? undefined : ""}>
      <button type="button" className="dr-sheet-pic" onClick={() => setOpen(true)} aria-label="See the concepts larger">
        <img src={imageUrl(sheet.url, 1200)} alt={`Concepts ${concepts.map((c) => c.n).join(", ")}`} loading="lazy" />
        {concepts.map((c, i) => (
          <span key={c.n} className={`dr-sheet-zone${developed.has(c.n) ? " made" : ""}`} style={{ left: `${(100 * i) / concepts.length}%`, width: `${100 / concepts.length}%` }} aria-hidden="true" />
        ))}
        <span className="dr-sheet-zoom" aria-hidden="true">⤢ Zoom</span>
      </button>
      <ol className="dr-sheet-list">
        {concepts.map((c) => (
          <li key={c.n}>
            <button type="button" className={`dr-sheet-pick${developed.has(c.n) ? " made" : ""}`} disabled={!live} onClick={() => make(c.n)} title={developed.has(c.n) ? "Made already — tap to make it again" : "Make this one"}>
              <b>{c.n}</b>
              <span>
                {c.title}
                {developed.has(c.n) ? " ✓" : ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="dr-sheet-acts">
        <button type="button" className="dr-chip" disabled={!live} onClick={() => onMore?.()}>More options</button>
        <button type="button" className="dr-chip" onClick={share} title="Send these three to your friends">{copied ? "Link copied" : "Share"}</button>
        <span className="dr-sheet-hint">Tap a number to make it, or say “2 and 3” — or “2 but with the text in gold”. Tap the picture to zoom.</span>
      </div>
      {last && live && onSay && (
        <div className="dr-sheet-fb" role="group" aria-label="Not quite right? Tell me in one tap">
          <span>Not quite right?</span>
          {FEEDBACK.map((f) => (
            <button key={f.label} type="button" className="dr-chip" onClick={() => onSay(f.say)}>{f.label}</button>
          ))}
        </div>
      )}
      {open &&
        createPortal(
          <div className="dr-sheet-full" role="dialog" aria-label="The concepts, larger">
            <div className="dr-sheet-full-bar">
              <span>Scroll to look around. Make one with its button.</span>
              <button type="button" className="dr-sheet-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="dr-sheet-full-scroll">
              <div className="dr-sheet-full-pic">
                <img src={imageUrl(sheet.url, 2000)} alt="" />
                {concepts.map((c, i) => (
                  <span key={c.n} className="dr-sheet-zone" style={{ left: `${(100 * i) / concepts.length}%`, width: `${100 / concepts.length}%` }}>
                    <button type="button" className="dr-sheet-make" disabled={!live} onClick={() => make(c.n)}>
                      Make {c.n} · {c.title}
                      {developed.has(c.n) ? " ✓" : ""}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
