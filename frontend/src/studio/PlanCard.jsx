// studio/PlanCard.jsx
//
// The chat's plan card: what will be drawn, shown BEFORE any picture request is spent (client, 20 Oct 2026 —
// the chat replaces the Draw page). The customer checks each picture's print area, picks a style and sees what
// it costs, then taps Draw. Nothing is drawn or charged until then.
//
//   "Here's what I'll make on your Maroon Oversized Tee:
//     1. Hulk          [Centre Front ▾]
//     2. Spider-Man    [Full Back ▾]
//    Style: (Bold mascot) (Cartoon) (Realistic) …
//    [Draw both · 2 requests]   4 left today"
import { useEffect, useRef } from "react";
import { STYLE_INFO, styleSample } from "./styleInfo";

const COUNT = ["", "it", "both", "all 3"];

/**
 * @param plan      { items: [{ subject, areaKey, label? }], style, improvable }   label: what the customer sees, if not the subject
 * @param areas     [{ key, label, free }]  the garment's print areas (free: nothing overlapping is on the tee)
 * @param styles    the style names the server offers
 * @param left      the customer's picture requests left today (null = not counted)
 * @param live      the card can still be changed and drawn (the newest plan, nothing running)
 * @param onChange  (plan) => void        a print area, the style, or a picture removed
 * @param onDraw    (plan) => void
 * @param onImprove () => void            (only for one picture in the customer's own words)
 * @param onCancel  () => void
 */
export default function PlanCard({ plan, areas, styles, left, live, onChange, onDraw, onImprove, onCancel }) {
  const { items, style } = plan;
  const n = items.length;
  const short = left != null && left < n;
  const set = (patch) => onChange({ ...plan, ...patch });
  const setArea = (i, areaKey) => set({ items: items.map((x, k) => (k === i ? { ...x, areaKey } : x)) });
  const drop = (i) => set({ items: items.filter((_, k) => k !== i) });
  // a picture's choices: the free print areas, and the one it has now
  const choices = (key) => areas.filter((a) => a.free || a.key === key);
  const labelOf = (key) => areas.find((a) => a.key === key)?.label || "Choose…";
  // phones: the style row starts at the picked style, so the customer sees what is chosen
  const row = useRef(null);
  useEffect(() => {
    const box = row.current;
    const on = box?.querySelector(".pc-style.on");
    if (box && on && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, box.scrollLeft + on.getBoundingClientRect().left - box.getBoundingClientRect().left - 12);
  }, [style]);
  return (
    <div className={`pc${live ? "" : " done"}`}>
      <ol className="pc-items">
        {items.map((x, i) => (
          <li key={i}>
            <span className="pc-what">{x.label || x.subject}</span>
            {live ? (
              <span className="pc-row">
                <select aria-label={`Where to print picture ${i + 1}`} value={x.areaKey || ""} onChange={(e) => setArea(i, e.target.value)}>
                  {!x.areaKey && <option value="">Choose a print area…</option>}
                  {choices(x.areaKey).map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
                {n > 1 && <button type="button" className="pc-x" aria-label={`Leave out picture ${i + 1}`} onClick={() => drop(i)}>Leave out</button>}
              </span>
            ) : (
              <span className="pc-area">{labelOf(x.areaKey)}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="pc-h">Style</p>
      <div className="pc-styles" role="radiogroup" aria-label="Style" ref={row}>
        {styles.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === style} className={`pc-style${s === style ? " on" : ""}`} disabled={!live} onClick={() => set({ style: s })}>
            {/* the same man drawn in this style, so the customer sees what each style looks like */}
            {styleSample(s) ? <img src={styleSample(s)} alt="" width="160" height="160" /> : STYLE_INFO[s] && <i style={{ background: STYLE_INFO[s][1] }} aria-hidden="true" />}
            <b>{s}</b>
            {STYLE_INFO[s] && <span>{STYLE_INFO[s][0]}</span>}
          </button>
        ))}
      </div>
      {live && (
        <>
          <button type="button" className="pc-go" disabled={!n || short || items.some((x) => !x.areaKey)} onClick={() => onDraw(plan)}>
            Draw {COUNT[n] || n} · {n} request{n === 1 ? "" : "s"}
          </button>
          <p className="pc-note">
            {short
              ? `You have ${left} request${left === 1 ? "" : "s"} left today. Tap “Leave out” on ${n - left === 1 ? "a picture" : `${n - left} pictures`}, or come back tomorrow.`
              : `${left != null ? `${left} request${left === 1 ? "" : "s"} left today. ` : ""}Nothing is drawn until you tap Draw.`}
          </p>
          <div className="pc-more">
            {onImprove && <button type="button" className="dr-chip" onClick={onImprove}>✨ Improve my idea · free</button>}
            <button type="button" className="dr-chip" onClick={onCancel}>Not now</button>
          </div>
        </>
      )}
    </div>
  );
}
