// "Create your team/group IDENTEE": after the tee is picked, the customer picks a layout — one of the team layouts
// (studio/designTemplates.js, team: true) or "Create your own" (a blank tee: any text, logo or picture; any text can
// be made each person's name or number). Then the design room asks for the colour and size (?team=<key> | own).
import { useEffect, useRef, useState } from "react";

// what each layout puts where — for the little front / back drawings (each person's own words in gold)
const LAYOUTS = [
  { key: "team", title: "Team jersey", text: "Team name on the chest; team name, player name and number on the back.", front: [{ t: "TEAM", x: 64, y: 40, s: 5 }], back: [{ t: "TEAM NAME", x: 50, y: 34, s: 6 }, { t: "PLAYER", x: 50, y: 46, s: 7, p: 1 }, { t: "07", x: 50, y: 74, s: 24, p: 1 }] },
  { key: "team-back", title: "Name & number", text: "Each person's name and a big number on the back. The front is yours to fill.", front: [], back: [{ t: "PLAYER", x: 50, y: 38, s: 7, p: 1 }, { t: "10", x: 50, y: 70, s: 26, p: 1 }] },
  { key: "team-office", title: "Office & company", text: "Company name on the chest; each person's name across the top of the back.", front: [{ t: "COMPANY", x: 64, y: 40, s: 4.5 }], back: [{ t: "YOUR NAME", x: 50, y: 34, s: 6.5, p: 1 }] },
  { key: "team-event", title: "Event & group", text: "The event or group name big on the front with the year; each person's name on the back.", front: [{ t: "EVENT NAME", x: 50, y: 48, s: 7 }, { t: String(new Date().getFullYear()), x: 50, y: 70, s: 15 }], back: [{ t: "YOUR NAME", x: 50, y: 34, s: 6.5, p: 1 }] },
];

const TEE = "M30 8 L12 18 L4 40 L18 46 L22 36 L22 104 L78 104 L78 36 L82 46 L96 40 L88 18 L70 8 C 64 16, 36 16, 30 8 Z";

function Tee({ lines, label }) {
  return (
    <figure className="tlp-tee">
      <svg viewBox="0 0 100 110" aria-hidden="true">
        <path d={TEE} fill="#15130F" />
        {lines.map((l) => (
          <text key={l.t + l.y} x={l.x} y={l.y} textAnchor="middle" fill={l.p ? "#E8B94D" : "#FFFFFF"} style={{ font: `800 ${l.s}px Inter, Arial, sans-serif`, letterSpacing: "0.04em" }}>
            {l.t}
          </text>
        ))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const css = `
  .tlp-back { position: fixed; inset: 0; z-index: 200; background: rgba(21,19,15,.55); display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
  .tlp-back *, .tlp-back *::before, .tlp-back *::after { box-sizing: border-box; }
  .tlp { width: min(980px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; overflow-x: hidden; background: #fff; border-radius: 22px; padding: 26px 26px 22px; color: #15130F; font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
  .tlp-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
  .tlp-step { margin: 0; font: 800 11px/1 Inter, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #9C7A2E; }
  .tlp h2 { margin: 8px 0 4px; font: 800 clamp(22px, 3vw, 28px)/1.15 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
  .tlp-top p { margin: 0; color: #6B6559; font-size: 14px; line-height: 1.5; }
  .tlp-x { flex-shrink: 0; width: 38px; height: 38px; border-radius: 50%; border: 1px solid #E2DED3; background: #fff; font-size: 18px; cursor: pointer; }
  .tlp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .tlp-card { display: grid; gap: 10px; text-align: left; padding: 14px; border: 1.5px solid #E2DED3; border-radius: 16px; background: #fff; cursor: pointer; color: inherit; font: inherit; transition: border-color .2s, box-shadow .2s; }
  .tlp-card:hover { border-color: #C9A24B; }
  .tlp-card[aria-pressed="true"] { border-color: #15130F; box-shadow: 0 0 0 2px #15130F inset; }
  .tlp-card:focus-visible { outline: 2px solid #B8912F; outline-offset: 2px; }
  .tlp-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #F1F0EC; border-radius: 12px; padding: 10px 10px 6px; }
  .tlp-tee { margin: 0; display: grid; justify-items: center; gap: 2px; }
  .tlp-tee svg { width: 100%; max-width: 110px; height: auto; }
  .tlp-tee figcaption { font-size: 11px; color: #6B6559; font-weight: 600; }
  .tlp-card b { font: 800 16px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
  .tlp-card small { color: #5E584D; font-size: 13px; line-height: 1.45; }
  .tlp-own .tlp-pair { place-items: center; min-height: 128px; background: #fff; border: 2px dashed #C9A24B; }
  .tlp-own .plus { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: #15130F; color: #F0D585; font: 800 26px/1 Inter, sans-serif; }
  /* stays in reach at the bottom of the box while the layouts scroll (a long list on phones) */
  .tlp-foot { position: sticky; bottom: -22px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: 18px; padding: 14px 0 6px; border-top: 1px solid #EAE3CF; background: #fff; }
  .tlp-key { font-size: 12.5px; color: #6B6559; }
  .tlp-key i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; background: #E8B94D; margin-right: 6px; vertical-align: -1px; }
  .tlp-go { border: 0; border-radius: 999px; min-height: 46px; padding: 0 24px; background: #15130F; color: #fff; font: 700 14px Inter, sans-serif; cursor: pointer; }
  .tlp-go:disabled { opacity: .45; cursor: default; }
  @media (max-width: 560px) { .tlp { padding: 20px 16px 16px; border-radius: 18px; } .tlp-foot { bottom: -16px; gap: 8px; } .tlp-grid { grid-template-columns: minmax(0, 1fr); } .tlp-go { flex: 1 1 100%; } }
`;

/**
 * @param garment   the tee picked ({ label })
 * @param onChoose  (layoutKey | "own") => void
 * @param onClose   () => void
 */
export default function TeamLayoutPicker({ garment, onChoose, onClose }) {
  const [pick, setPick] = useState(null);
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="tlp-back" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{css}</style>
      <div className="tlp" role="dialog" aria-modal="true" aria-labelledby="tlp-title">
        <div className="tlp-top">
          <div>
            <p className="tlp-step">Step 2 of 3 · Layout</p>
            <h2 id="tlp-title">Pick a layout for your {garment?.label || "tee"}</h2>
            <p>You can change every word, font and colour, and add your logo, in the design room. Next: colour and size.</p>
          </div>
          <button type="button" className="tlp-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="tlp-grid">
          {LAYOUTS.map((l, i) => (
            <button key={l.key} ref={i === 0 ? first : undefined} type="button" className="tlp-card" aria-pressed={pick === l.key} onClick={() => setPick(l.key)}>
              <span className="tlp-pair">
                <Tee lines={l.front} label="Front" />
                <Tee lines={l.back} label="Back" />
              </span>
              <b>{l.title}</b>
              <small>{l.text}</small>
            </button>
          ))}
          <button type="button" className="tlp-card tlp-own" aria-pressed={pick === "own"} onClick={() => setPick("own")}>
            <span className="tlp-pair"><span className="plus" aria-hidden="true">+</span></span>
            <b>Create your own</b>
            <small>Something else in mind? Start with a blank tee: add your own words, logo or picture, and make any text each person's name or number.</small>
          </button>
        </div>

        <div className="tlp-foot">
          <span className="tlp-key"><i aria-hidden="true" />Gold = each person's own name or number</span>
          <button type="button" className="tlp-go" disabled={!pick} onClick={() => onChoose(pick)}>
            {pick ? "Next: colour and size →" : "Pick a layout"}
          </button>
        </div>
      </div>
    </div>
  );
}
