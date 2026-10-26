// Admin → Studio: "Where should it go?" (26 Oct 2026). Asked when an AI picture is tapped in the AI pictures tab:
// every print area of the tee (Free / Has a design / Covered), and how to place it — fill the area, big and centred,
// at the top, in the middle, at the bottom, or small. Looks like the customer room's PlaceSheet (same classes).
import { useState } from "react";
import { imageUrl } from "../../../utils/imageUrl";

const HOW = [
  ["fill", "Fill the area", "edge to edge"],
  ["big", "Big, centred", "92 % of the area"],
  ["top", "At the top", "a title band"],
  ["middle", "In the middle", "a figure"],
  ["bottom", "At the bottom", "a line or logo"],
  ["small", "Small", "a chest logo"],
];
const DEFAULT_HOW = { whole: "big", title: "top", hero: "middle", background: "fill", logo: "small" };

/**
 *   picture   { url, kind, prompt | about }
 *   groups    [[groupLabel, [{ key, label, cm, state: "free" | "used" | "blocked", has, blockers }]]]
 *   suggest   the print area open now
 *   onPlace(key, how, replace)
 */
export default function PlacePicker({ picture, groups, suggest, onPlace, onClose }) {
  const [how, setHow] = useState(DEFAULT_HOW[picture.kind] || "big");
  const [asking, setAsking] = useState(null);
  const [why, setWhy] = useState("");
  const tap = (a) => {
    setWhy("");
    if (a.state === "blocked") return setWhy(`${a.label} overlaps ${a.blockers.join(" and ")}, which already has a print. Pick a free area, or remove that print first.`);
    if (a.state === "used") return setAsking(a);
    onPlace(a.key, how, false);
  };
  const order = { free: 0, used: 1, blocked: 2 };
  return (
    <div className="dr-askback" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dr-ask dr-place st-place" role="dialog" aria-modal="true" aria-labelledby="st-place-h">
        <div className="dr-place-top">
          <span className="dr-place-img">
            <img src={imageUrl(picture.url, 200)} alt="" />
          </span>
          <span className="dr-place-what">
            <b>{String(picture.prompt || picture.about || "AI picture").slice(0, 60)}</b>
            <small>{picture.kind ? `AI picture · ${picture.kind}` : "AI picture"}</small>
          </span>
          <button type="button" className="dr-chats-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <h2 id="st-place-h">Where should it go?</h2>
        <div className="st-place-how" role="radiogroup" aria-label="How to place it">
          {HOW.map(([k, label, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={how === k} className={`dr-chip${how === k ? " on" : ""}`} title={hint} onClick={() => setHow(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="dr-place-list">
          {groups.map(([group, areas]) => (
            <div key={group} className="dr-place-group">
              <div className="dr-place-gh">{group}</div>
              {[...areas]
                .sort((a, b) => order[a.state] - order[b.state] || (b.key === suggest) - (a.key === suggest))
                .map((a) =>
                  asking?.key === a.key ? (
                    <div key={a.key} className="dr-place-ask" role="group" aria-label={`${a.label} already has a design`}>
                      <span>{a.label} already has {a.has}.</span>
                      <button type="button" className="dr-chatask-no" onClick={() => onPlace(a.key, how, false)}>Add next to it</button>
                      <button type="button" className="dr-chatask-yes" onClick={() => onPlace(a.key, how, true)}>Replace it</button>
                      <button type="button" className="dr-linkbtn" onClick={() => setAsking(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button key={a.key} type="button" className={`dr-place-row ${a.state}`} aria-disabled={a.state === "blocked" ? "true" : undefined} onClick={() => tap(a)}>
                      <span className="dr-place-name">
                        <b>
                          {a.label}
                          {a.key === suggest && a.state !== "blocked" ? <em> · open now</em> : null}
                        </b>
                        <small>{a.cm[0]} × {a.cm[1]} cm</small>
                      </span>
                      <span className={`dr-place-pill ${a.state}`}>{a.state === "free" ? "Free" : a.state === "used" ? `Has ${a.has}` : `Covered by ${a.blockers[0]}`}</span>
                    </button>
                  ),
                )}
            </div>
          ))}
        </div>
        {why && <p className="dr-place-why">{why}</p>}
      </div>
    </div>
  );
}
