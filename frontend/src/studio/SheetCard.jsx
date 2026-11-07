// studio/SheetCard.jsx — a concept sheet in the chat (Assistant v2, 7 Nov 2026): one picture with three numbered tees,
// a button per number (tapping one makes that concept's real artwork and puts it on the tee), and More options.
import { useState } from "react";
import { imageUrl } from "../utils/imageUrl";

export default function SheetCard({ sheet, live = true, onPick, onMore }) {
  const [open, setOpen] = useState(false); // the full-size sheet
  const concepts = sheet.concepts || [];
  const developed = new Set(sheet.developed || []);
  return (
    <div className="dr-sheet" data-done={live ? undefined : ""}>
      <button type="button" className="dr-sheet-pic" onClick={() => setOpen(true)} aria-label="See the concepts larger">
        <img src={imageUrl(sheet.url, 1200)} alt={`Concepts ${concepts.map((c) => c.n).join(", ")}`} loading="lazy" />
      </button>
      <ol className="dr-sheet-list">
        {concepts.map((c) => (
          <li key={c.n}>
            <button type="button" className={`dr-sheet-pick${developed.has(c.n) ? " made" : ""}`} disabled={!live} onClick={() => onPick?.(c.n)} title={developed.has(c.n) ? "Made already — tap to make it again" : "Make this one"}>
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
        <span className="dr-sheet-hint">Tap a number, or say “2 and 3” — I’ll make the real artwork and put it on your tee.</span>
      </div>
      {open && (
        <div className="dr-sheet-full" role="dialog" aria-label="The concepts, larger" onClick={() => setOpen(false)}>
          <img src={imageUrl(sheet.url, 2000)} alt="" />
          <button type="button" className="dr-sheet-close" aria-label="Close">✕</button>
        </div>
      )}
    </div>
  );
}
