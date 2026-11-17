// studio/PlaceSheet.jsx — "Where should it go?" (23 Oct 2026): asked when a picture from My pictures is tapped.
// Every print area of the tee, grouped Front / Back / Sleeves, each marked Free, Has a design (then "Add next to
// it" or "Replace it") or Covered by another print (can't be picked, and says why). Free areas come first in each
// group; the area being edited is suggested. Centred on a laptop, a sheet from the bottom on a phone (dr-ask).
// Each row: the size for the chosen tee size and a few words on where it is ("26 × 7 cm · One line of words across
// the chest"); the rows come in list order (areaGroups.js: main spot, big prints, chest and strips, small hits).
// Last row (free placement phase 3, 15 Nov 2026): "Anywhere on the tee" — the picture waits for a tap on the tee.
import { useState } from "react";
import { imageUrl } from "../utils/imageUrl";
import { useBackClose } from "../utils/backClose";
import { pictureLabel } from "./pictureHelpers";

/**
 *   picture   { url, kind, about, style }
 *   groups    [[groupLabel, [{ key, label, where, cm: [w, h], state: "free" | "used" | "blocked", has, blockers, hint }]]]
 *   suggest   the print area to suggest (the one open now, when free)
 *   onPlace(key, replace)   put it there — replace: take off what that area has first
 *   onForget()   take the picture off My pictures
 *   anywhere   { used, max } prints in free places on the tee (null: this tee has no free places)
 *   onAnywhere()   "Anywhere on the tee": the picture goes where the tee is tapped next
 */
export default function PlaceSheet({ picture, groups, suggest, onPlace, onForget, onClose, anywhere = null, onAnywhere }) {
  const [asking, setAsking] = useState(null); // the area with a design: add next to it, or replace it?
  const [why, setWhy] = useState(""); // a covered area was tapped
  const [forget, setForget] = useState(false);
  // the browser's Back: first takes back an open question ("add next to it, or replace?" / "forget it?"), then closes
  useBackClose(true, () => {
    if (!asking && !forget) return onClose();
    setAsking(null);
    setForget(false);
    return false;
  });
  const tap = (a) => {
    setWhy("");
    if (a.state === "blocked") return setWhy(`${a.label} overlaps ${a.blockers.join(" and ")}, which already has a print. Pick a free area, or remove that print first.`);
    if (a.state === "used") return setAsking(a);
    onPlace(a.key, false);
  };
  const order = { free: 0, used: 1, blocked: 2 };
  return (
    <div className="dr-askback" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dr-ask dr-place" role="dialog" aria-modal="true" aria-labelledby="dr-place-h">
        <div className="dr-place-top">
          <span className="dr-place-img">
            <img src={imageUrl(picture.url, 200)} alt="" />
          </span>
          <span className="dr-place-what">
            <b>{pictureLabel(picture)}</b>
            <small>{picture.kind === "photo" ? "Your photo" : picture.style ? `AI picture · ${picture.style}` : "AI picture"}</small>
          </span>
          <button type="button" className="dr-chats-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <h2 id="dr-place-h">Where should it go?</h2>
        <div className="dr-place-list">
          {groups.map(([group, areas]) => (
            <div key={group} className="dr-place-group">
              <div className="dr-place-gh">{group}</div>
              {[...areas]
                .sort((a, b) => order[a.state] - order[b.state] || (b.key === suggest) - (a.key === suggest))
                .map((a) =>
                  asking?.key === a.key ? (
                    <div key={a.key} className="dr-place-ask" role="group" aria-label={`${a.label} already has a design`}>
                      <span>
                        {a.label} already has {a.has}.
                      </span>
                      <button type="button" className="dr-chatask-no" onClick={() => onPlace(a.key, false)}>
                        Add next to it
                      </button>
                      <button type="button" className="dr-chatask-yes" onClick={() => onPlace(a.key, true)}>
                        Replace it
                      </button>
                      <button type="button" className="dr-linkbtn" onClick={() => setAsking(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button key={a.key} type="button" className={`dr-place-row ${a.state}`} aria-disabled={a.state === "blocked" ? "true" : undefined} onClick={() => tap(a)}>
                      <span className="dr-place-name">
                        <b>
                          {a.label}
                          {a.key === suggest && a.state === "free" ? <em> · open now</em> : null}
                        </b>
                        <small>
                          {a.cm[0]} × {a.cm[1]} cm
                          {a.where ? ` · ${a.where}` : ""}
                        </small>
                      </span>
                      <span className={`dr-place-pill ${a.state}`}>{a.state === "free" ? (a.hint ? `Free · ${a.hint}` : "Free") : a.state === "used" ? `Has ${a.has}` : `Covered by ${a.blockers[0]}${a.blockers.length > 1 ? ` +${a.blockers.length - 1}` : ""}`}</span>
                    </button>
                  ),
                )}
            </div>
          ))}
          {anywhere && (
            <div className="dr-place-group">
              <div className="dr-place-gh">Anywhere</div>
              <button
                type="button"
                className={`dr-place-row ${anywhere.used >= anywhere.max ? "blocked" : "free"}`}
                aria-disabled={anywhere.used >= anywhere.max ? "true" : undefined}
                onClick={() => (anywhere.used >= anywhere.max ? setWhy(`This tee already has ${anywhere.max} prints in free places. Put it on a print above, or delete one of them first.`) : onAnywhere?.())}
              >
                <span className="dr-place-name">
                  <b>Anywhere on the tee</b>
                  <small>Tap the tee where you want it</small>
                </span>
                <span className={`dr-place-pill ${anywhere.used >= anywhere.max ? "blocked" : "free"}`}>{anywhere.used >= anywhere.max ? `${anywhere.used} of ${anywhere.max} used` : "Your choice"}</span>
              </button>
            </div>
          )}
        </div>
        {why && <p className="dr-place-why">{why}</p>}
        <div className="dr-place-foot">
          {forget ? (
            <span className="dr-place-forget">
              Take it off My pictures? (Designs that use it keep it.){" "}
              <button type="button" className="dr-linkbtn" onClick={onForget}>
                Yes, take it off
              </button>{" "}
              <button type="button" className="dr-linkbtn" onClick={() => setForget(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="dr-linkbtn quiet" onClick={() => setForget(true)}>
              Take it off My pictures
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
