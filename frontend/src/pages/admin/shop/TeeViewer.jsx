// pages/admin/shop/TeeViewer.jsx — one shop tee, big (Manage the shop → Every tee → click a tee)
//
// (25 Nov 2026, the owner: "in the admin if i click it on the t-shirt make the front and back visible big so that its
// easy for me to check and remove or some functions") the tee's front and back pictures large, in each colour it is
// made in, and what can be done to it right there: take it out of the shop / put it back, take the colour on show out /
// put it back, tick it (for the list's other actions), see it on the website. ‹ › (or the arrow keys) go through the
// list as it was filtered when the window opened, so a tee taken out stays here to be put back. Esc or Back closes.
import { useEffect, useRef, useState } from "react";
import studioService from "../../../services/studioService";
import { imageUrl } from "../../../utils/imageUrl";
import { money } from "../../../utils/money";
import { collectionInfo } from "../../../utils/shopRules";
import { shopHref } from "../../../utils/siteUrls";
import { useBackClose } from "../../../utils/backClose";

const nameOf = (t) => String(t.name || "").replace(/^[^·]*·\s*/, "");
const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
];
const SLEEVES = [
  ["left", "Left sleeve"],
  ["right", "Right sleeve"],
];

export default function TeeViewer({ order, startId, tees, busy, run, ticked, onTick, onClose }) {
  const [id, setId] = useState(startId);
  const [colour, setColour] = useState("");
  const [full, setFull] = useState({}); // id → the saved design (its pictures), or { error }
  const cache = useRef(new Map());
  const tee = tees.find((t) => t._id === id) || null;
  const at = order.indexOf(id);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  useBackClose(true, onClose);

  // the saved design (its pictures in every colour); the next one is asked for too, so › is quick
  useEffect(() => {
    let alive = true;
    for (const want of [id, next].filter(Boolean)) {
      if (cache.current.has(want)) continue;
      const p = studioService
        .getDesign(want)
        .then((d) => d)
        .catch(() => ({ error: true }));
      cache.current.set(want, p);
    }
    cache.current.get(id)?.then((d) => alive && setFull((cur) => ({ ...cur, [id]: d })));
    return () => {
      alive = false;
    };
  }, [id, next]);

  useEffect(() => {
    const onKey = (e) => {
      // (Esc always closes — the test found it did nothing just after the Ticked box was clicked; the arrows leave a
      // box being typed in alone)
      if (e.key === "Escape") return onClose();
      if (e.target.closest?.("textarea, select, input:not([type=checkbox]):not([type=radio])")) return;
      if (e.key === "ArrowLeft" && prev) setId(prev);
      else if (e.key === "ArrowRight" && next) setId(next);
    };
    window.addEventListener("keydown", onKey);
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = keep;
    };
  }, [prev, next, onClose]);

  if (!tee) return null;
  const design = full[id];
  // the colour picked (kept going from tee to tee, e.g. checking every Black one), else the first still on sale
  const shownColour = tee.colours.find((c) => c.slug === colour) || tee.colours.find((c) => !c.hidden) || tee.colours[0];
  const pics = (design && !design.error && ((design.colours || []).find((c) => c.slug === shownColour?.slug)?.mockups || design.mockups)) || {};
  const sleeves = design && !design.error ? SLEEVES.filter(([side]) => pics[side] && (design.elements || []).some((el) => el.side === side)) : [];
  const onSale = tee.colours.filter((c) => !c.hidden);
  const lastColour = shownColour && !shownColour.hidden && onSale.length === 1;
  const one = [tee._id];

  return (
    <div className="sm-view-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sm-view" role="dialog" aria-modal="true" aria-labelledby="sm-view-name">
        <header className="sm-view-head">
          <div className="sm-view-title">
            <h2 id="sm-view-name">{nameOf(tee)}</h2>
            <small>
              {collectionInfo(tee.collection, tee.collectionName).name} · {tee.style || "—"} · {tee.gender} · <b>{money(tee.price)}</b>
              {tee.oldPrice > tee.price && <s>{money(tee.oldPrice)}</s>}
            </small>
          </div>
          <span className={`sm-badge${tee.inShop ? " in" : ""}`}>{tee.inShop ? "In the shop" : "Taken out"}</span>
          <button type="button" className="sm-view-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="sm-view-colours" role="group" aria-label="Colour shown">
          {tee.colours.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`sm-view-colour${c.slug === shownColour?.slug ? " on" : ""}${c.hidden ? " off" : ""}`}
              onClick={() => setColour(c.slug)}
              aria-pressed={c.slug === shownColour?.slug}
            >
              <span className={`sm-dot${c.hidden ? " off" : ""}`} style={{ background: c.hex }} />
              {c.name}
              {c.hidden && <em>taken out</em>}
            </button>
          ))}
        </div>

        <div className="sm-view-pics">
          {SIDES.map(([side, label]) => (
            <figure key={side} className="sm-view-pic">
              {design?.error ? (
                <span className="sm-view-wait">The pictures didn't load.</span>
              ) : !design ? (
                <span className="sm-view-wait">Loading…</span>
              ) : pics[side] ? (
                <a href={imageUrl(pics[side])} target="_blank" rel="noreferrer" title="Open the picture full size">
                  <img src={imageUrl(pics[side], 1000)} alt={`${label} of ${nameOf(tee)} in ${shownColour?.name}`} />
                </a>
              ) : (
                <span className="sm-view-wait">No {label.toLowerCase()} picture</span>
              )}
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
        {sleeves.length > 0 && (
          <div className="sm-view-pics sm-view-sleeves">
            {sleeves.map(([side, label]) => (
              <figure key={side} className="sm-view-pic">
                <a href={imageUrl(pics[side])} target="_blank" rel="noreferrer" title="Open the picture full size">
                  <img src={imageUrl(pics[side], 600)} alt={`${label} of ${nameOf(tee)}`} />
                </a>
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="sm-view-acts">
          {tee.inShop ? (
            <button type="button" className="sm-btn sm-btn-danger" disabled={busy} onClick={() => run("Take out", one, { action: "out" })}>
              Take this tee out
            </button>
          ) : (
            <button type="button" className="sm-btn sm-btn-dark" disabled={busy} onClick={() => run("Put back", one, { action: "back" })}>
              Put this tee back
            </button>
          )}
          {shownColour &&
            (shownColour.hidden ? (
              <button
                type="button"
                className="sm-btn"
                disabled={busy}
                onClick={() =>
                  run(`Put ${shownColour.name} back`, one, {
                    action: "colourBack",
                    colour: shownColour.slug,
                  })
                }
              >
                Sell {shownColour.name} again
              </button>
            ) : (
              <button
                type="button"
                className="sm-btn"
                disabled={busy}
                onClick={() => {
                  // (the window stays on this colour once it is out, so "Sell … again" is right there — the test found it
                  // jumped to the next colour on sale)
                  setColour(shownColour.slug);
                  run(
                    `Take ${shownColour.name} out`,
                    one,
                    { action: "colourOut", colour: shownColour.slug },
                    lastColour
                      ? `${shownColour.name} is the only colour of this tee on sale — the tee leaves the shop until a colour is put back. Go on?`
                      : null,
                  );
                }}
              >
                Take {shownColour.name} out
              </button>
            ))}
          <label className="sm-check sm-view-tick">
            <input type="checkbox" checked={ticked.has(id)} onChange={() => onTick(id)} /> Ticked
          </label>
          <span className="sm-gap" />
          {tee.inShop && tee.slug && (
            <a className="sm-see" href={shopHref(`/ready-made/design/${tee.slug}`)} target="_blank" rel="noreferrer">
              See it on the website ↗
            </a>
          )}
        </div>

        <nav className="sm-view-nav" aria-label="Other tees">
          <button type="button" className="sm-btn" disabled={!prev} onClick={() => setId(prev)}>
            ‹ Previous
          </button>
          <span>{at >= 0 ? `${at + 1} of ${order.length}` : ""}</span>
          <button type="button" className="sm-btn" disabled={!next} onClick={() => setId(next)}>
            Next ›
          </button>
        </nav>
      </div>
    </div>
  );
}
