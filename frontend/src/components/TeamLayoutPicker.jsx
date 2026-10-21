// "Create your team/group IDENTEE": after the tee is picked, the customer picks a layout — one of the team layouts
// (studio/designTemplates.js, team: true) or "Create your own" (a blank tee: any text, logo or picture; any text can
// be made each person's name or number). Then the design room asks for the colour and size (?team=<key> | own).
// Each layout is drawn on the real tee photos (front and back), inside the photos' print areas.
import { useEffect, useRef, useState } from "react";
import { imageUrl } from "../utils/imageUrl";
import { useLockBodyScroll } from "../utils/lockScroll";

const YEAR = String(new Date().getFullYear());
// where each line sits, in % of the print area on the photo (ax, ay = its middle), s = letter size in % of the area's
// width; p = each person's own words (gold)
const LAYOUTS = [
  {
    key: "team", title: "Team jersey", tag: "Most popular", list: ["Name", "Number", "Size"],
    text: "Team name on the chest; team name, player name and number on the back.",
    front: [{ t: "TEAM", ax: 82, ay: 8, s: 9 }],
    back: [{ t: "TEAM NAME", ax: 50, ay: 7, s: 11 }, { t: "PLAYER", ax: 50, ay: 25, s: 14, p: 1 }, { t: "07", ax: 50, ay: 64, s: 50, p: 1 }],
  },
  {
    key: "team-back", title: "Name & number", list: ["Name", "Number", "Size"],
    text: "Each person's name and a big number on the back. The front is yours to fill.",
    front: [],
    back: [{ t: "PLAYER", ax: 50, ay: 16, s: 14, p: 1 }, { t: "10", ax: 50, ay: 60, s: 56, p: 1 }],
  },
  {
    key: "team-office", title: "Office & company", list: ["Name", "Size"],
    text: "Company name on the chest; each person's name across the top of the back.",
    front: [{ t: "COMPANY", ax: 80, ay: 8, s: 8 }],
    back: [{ t: "YOUR NAME", ax: 50, ay: 6, s: 12, p: 1 }],
  },
  {
    key: "team-event", title: "Event & group", list: ["Name", "Size"],
    text: "The event or group name big on the front with the year; each person's name on the back.",
    front: [{ t: "EVENT NAME", ax: 50, ay: 30, s: 14 }, { t: YEAR, ax: 50, ay: 62, s: 34 }],
    back: [{ t: "YOUR NAME", ax: 50, ay: 6, s: 12, p: 1 }],
  },
];

// one side of the tee: the photo, and the layout's words placed in its print area
function Side({ photo, area, lines, label, light }) {
  const a = area || { x: 32, y: 30, width: 36, height: 34 };
  return (
    <figure className="tlp-side">
      <span className="tlp-photo">
        <span className="tlp-zoom">
        {photo ? <img src={imageUrl(photo, 520)} alt="" loading="lazy" /> : <span className="tlp-nophoto" />}
        {lines.map((l) => (
          <span
            key={l.t + l.ay}
            className={`tlp-word${l.p ? " own" : ""}${light ? " on-light" : ""}`}
            style={{ left: `${a.x + (a.width * l.ax) / 100}%`, top: `${a.y + (a.height * l.ay) / 100}%`, fontSize: `${(a.width * l.s) / 100}cqw` }}
          >
            {l.t}
          </span>
        ))}
        </span>
      </span>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const css = `
  .tlp-back { position: fixed; inset: 0; z-index: 200; background: rgba(21,19,15,.6); display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
  .tlp-back *, .tlp-back *::before, .tlp-back *::after { box-sizing: border-box; }
  .tlp { width: min(1040px, 100%); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; background: #fff; border-radius: 24px; padding: 28px 28px 22px; color: #15130F; font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
  .tlp-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 20px; }
  .tlp-steps { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 11px/1 Inter, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #9A9184; }
  .tlp-steps b { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #EFEAE0; color: #6B6559; font-size: 10.5px; letter-spacing: 0; }
  .tlp-steps .now { color: #15130F; } .tlp-steps .now b { background: #15130F; color: #F0D585; }
  .tlp-steps .done b { background: #C9A24B; color: #15130F; }
  .tlp-steps i { width: 18px; height: 1px; background: #DDD5C4; }
  .tlp h2 { margin: 12px 0 4px; font: 800 clamp(22px, 3vw, 30px)/1.12 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -.01em; }
  .tlp-top p { margin: 0; color: #6B6559; font-size: 14px; line-height: 1.5; }
  .tlp-x { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; border: 1px solid #E2DED3; background: #fff; font-size: 20px; cursor: pointer; }
  .tlp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; }
  .tlp-card { position: relative; display: grid; gap: 10px; align-content: start; text-align: left; padding: 12px 12px 16px; border: 1.5px solid #E7E1D3; border-radius: 20px; background: #fff; cursor: pointer; color: inherit; font: inherit; transition: border-color .2s, box-shadow .25s, transform .25s; }
  .tlp-card:hover { border-color: #D9C58E; transform: translateY(-3px); box-shadow: 0 18px 34px -22px rgba(21,19,15,.4); }
  .tlp-card[aria-pressed="true"] { border-color: #C9A24B; box-shadow: 0 0 0 3px rgba(201,162,75,.35), 0 18px 34px -22px rgba(21,19,15,.4); }
  .tlp-card:focus-visible { outline: 2px solid #B8912F; outline-offset: 3px; }
  .tlp-tag { position: absolute; top: 20px; left: 20px; z-index: 2; background: #15130F; color: #F0D585; border-radius: 999px; padding: 5px 10px; font: 800 10px/1 Inter, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .tlp-tick { position: absolute; top: 18px; right: 18px; z-index: 2; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #fff; background: rgba(255,255,255,.7); color: transparent; font: 900 14px/1 Inter, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.15); transition: background .2s; }
  .tlp-card[aria-pressed="true"] .tlp-tick { background: #C9A24B; color: #15130F; }
  .tlp-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #F1F0EC; border-radius: 14px; padding: 8px 6px 6px; }
  .tlp-side { margin: 0; display: grid; gap: 2px; }
  .tlp-photo { position: relative; display: block; aspect-ratio: 4 / 5; container-type: inline-size; overflow: hidden; }
  /* the photos have room around the tee: zoomed in so the prints read (words zoom with it) */
  .tlp-zoom { position: absolute; inset: 0; transform: scale(1.3); transform-origin: 50% 50%; }
  .tlp-photo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .tlp-nophoto { position: absolute; inset: 12% 14%; border-radius: 12px; background: #2A2620; }
  .tlp-word { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-weight: 900; font-family: "Bricolage Grotesque", "Arial Black", Arial, sans-serif; line-height: 1; letter-spacing: .02em; color: #fff; }
  .tlp-word.own { color: #E8B94D; }
  .tlp-word.on-light { color: #15130F; } .tlp-word.on-light.own { color: #B8912F; }
  .tlp-side figcaption { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #8A847A; }
  .tlp-card b { font: 800 17px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; padding-inline: 4px; }
  .tlp-card small { color: #5E584D; font-size: 13px; line-height: 1.45; padding-inline: 4px; }
  .tlp-list { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-inline: 4px; font-size: 12px; color: #6B6559; }
  .tlp-list span { padding: 4px 9px; border-radius: 999px; background: #FBF5E6; border: 1px solid #EAD9A8; color: #6A4F12; font-weight: 700; }
  .tlp-own .tlp-pair { background: #fff; border: 2px dashed #C9A24B; }
  .tlp-own .tlp-photo::after { content: "+"; position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); display: grid; place-items: center; width: 22cqw; height: 22cqw; border-radius: 50%; background: #15130F; color: #F0D585; font: 800 14cqw/1 Inter, sans-serif; }
  .tlp-foot { position: sticky; bottom: -22px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; padding: 14px 0 6px; border-top: 1px solid #EAE3CF; background: #fff; }
  .tlp-key { font-size: 12.5px; color: #6B6559; }
  .tlp-key i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; background: #E8B94D; margin-right: 6px; vertical-align: -1px; }
  .tlp-go { border: 0; border-radius: 999px; min-height: 48px; padding: 0 26px; background: #15130F; color: #fff; font: 700 14.5px Inter, sans-serif; cursor: pointer; transition: background .2s; }
  .tlp-go:not(:disabled):hover { background: #2A2620; }
  .tlp-go:disabled { opacity: .45; cursor: default; }
  @media (max-width: 560px) {
    .tlp { padding: 20px 14px 16px; border-radius: 18px; }
    .tlp-foot { bottom: -16px; gap: 8px; }
    .tlp-grid { grid-template-columns: minmax(0, 1fr); }
    .tlp-go { flex: 1 1 100%; }
    .tlp-steps i { width: 10px; }
  }
`;

/**
 * @param garment   the tee picked ({ label })
 * @param photos    the tee's photos to draw on: { front: { imageUrl, printArea }, back: { … }, light } (a dark colour looks
 *                  most like a jersey; light = a light tee, the words are drawn dark)
 * @param onChoose  (layoutKey | "own") => void
 * @param onClose   () => void
 */
export default function TeamLayoutPicker({ garment, photos, onChoose, onClose }) {
  useLockBodyScroll(); // the page behind stays still while this is open
  const [pick, setPick] = useState(null);
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const front = photos?.front;
  const back = photos?.back;

  return (
    <div className="tlp-back" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{css}</style>
      <div className="tlp" role="dialog" aria-modal="true" aria-labelledby="tlp-title">
        <div className="tlp-top">
          <div>
            <p className="tlp-steps" aria-label="Step 2 of 3">
              <span className="done"><b>✓</b> Tee</span><i aria-hidden="true" />
              <span className="now"><b>2</b> Layout</span><i aria-hidden="true" />
              <span><b>3</b> Colour &amp; size</span>
            </p>
            <h2 id="tlp-title">How should your {garment?.label || "tee"} look?</h2>
            <p>Pick a layout. Every word, font and colour can be changed in the design room, and you can add your logo.</p>
          </div>
          <button type="button" className="tlp-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="tlp-grid">
          {LAYOUTS.map((l, i) => (
            <button key={l.key} ref={i === 0 ? first : undefined} type="button" className="tlp-card" aria-pressed={pick === l.key} onClick={() => setPick(l.key)}>
              {l.tag && <span className="tlp-tag">{l.tag}</span>}
              <span className="tlp-tick" aria-hidden="true">✓</span>
              <span className="tlp-pair">
                <Side photo={front?.imageUrl} area={front?.printArea} lines={l.front} label="Front" light={photos?.light} />
                <Side photo={back?.imageUrl} area={back?.printArea} lines={l.back} label="Back" light={photos?.light} />
              </span>
              <b>{l.title}</b>
              <small>{l.text}</small>
              <span className="tlp-list">You'll list: {l.list.map((x) => <span key={x}>{x}</span>)}</span>
            </button>
          ))}
          <button type="button" className="tlp-card tlp-own" aria-pressed={pick === "own"} onClick={() => setPick("own")}>
            <span className="tlp-tick" aria-hidden="true">✓</span>
            <span className="tlp-pair">
              <Side photo={front?.imageUrl} area={front?.printArea} lines={[]} label="Front" />
              <Side photo={back?.imageUrl} area={back?.printArea} lines={[]} label="Back" />
            </span>
            <b>Create your own</b>
            <small>Something else in mind? Start with a blank tee: your own words, logo or picture. Make any text each person's name or number.</small>
            <span className="tlp-list">You'll list: <span>Whatever you choose</span></span>
          </button>
        </div>

        <div className="tlp-foot">
          <span className="tlp-key"><i aria-hidden="true" />Gold = each person's own name or number</span>
          <button type="button" className="tlp-go" disabled={!pick} onClick={() => onChoose(pick)}>
            {pick ? "Next: colour & size →" : "Pick a layout"}
          </button>
        </div>
      </div>
    </div>
  );
}
