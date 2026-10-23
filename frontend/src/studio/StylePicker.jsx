// studio/StylePicker.jsx — the picture styles on the Draw card (PlanCard) and on a photo's "new design" plan
// (PhotoPlanCard), compact (23 Oct 2026): the four that suit the idea best, as small sample tiles in one row, and
// "More styles" for the rest, grouped. With 14 styles, showing every one made the card several screens tall on a
// phone. A style picked under "More styles" moves into the row, so the choice is always in sight.
import { useState } from "react";
import { STYLE_GROUPS, STYLE_INFO, styleSample, topStyles } from "./styleInfo";

/**
 * @param styles   the style names the server offers
 * @param value    the style picked now
 * @param onPick   (style) => void
 * @param live     the card can still be changed (else only the picked style is shown)
 * @param subject  what will be drawn (a style named in it is suggested)
 */
export default function StylePicker({ styles, value, onPick, live, subject = "" }) {
  // the row is worked out once, when the card appears, so the tiles don't jump around while choosing
  const [top] = useState(() => topStyles(styles, value, subject));
  const [open, setOpen] = useState(false);
  const shown = !value || top.includes(value) ? top : [value, ...top.slice(0, 3)];
  const rest = styles.filter((s) => !shown.includes(s));
  const grouped = STYLE_GROUPS.map(([name, list]) => [name, list.filter((s) => rest.includes(s))]);
  const loose = rest.filter((s) => !STYLE_GROUPS.some(([, list]) => list.includes(s)));
  if (loose.length) grouped.push(["More", loose]);
  const groups = grouped.filter(([, list]) => list.length);

  const tile = (s, fromMore = false) => (
    <button
      key={s}
      type="button"
      role="radio"
      aria-checked={s === value}
      className={`pc-style${s === value ? " on" : ""}`}
      disabled={!live}
      title={STYLE_INFO[s]?.[0] || s}
      onClick={() => {
        onPick(s);
        if (fromMore) setOpen(false); // (it moves into the row above; the list folds away again)
      }}
    >
      {styleSample(s) ? <img src={styleSample(s)} alt="" width="160" height="160" loading="lazy" /> : <i style={{ background: STYLE_INFO[s]?.[1] || "var(--line)" }} aria-hidden="true" />}
      <b>{s}</b>
    </button>
  );

  return (
    <div className="pc-pick" role="radiogroup" aria-label="Style">
      <div className="pc-styles">{live ? shown.map((s) => tile(s)) : value && tile(value)}</div>
      {live && rest.length > 0 && (
        <button type="button" className="pc-allstyles" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Fewer styles ▴" : `More styles (${rest.length}) ▾`}
        </button>
      )}
      {live && open && (
        <div className="pc-groups">
          {groups.map(([name, list]) => (
            <div key={name} className="pc-group">
              <p className="pc-gh">{name}</p>
              <div className="pc-styles">{list.map((s) => tile(s, true))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
