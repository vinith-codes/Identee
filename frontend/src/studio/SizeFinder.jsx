// "Find my size" — two quick steps (body, then shape) and a result drawn on a figure.
// The sums are in sizeMatch.js; this is the screen. Answers stay in this browser only.
import { useEffect, useMemo, useRef, useState } from "react";
import { FEELS, SHAPES, WHO, cmToFtIn, fitNote, isKidSize, kgToLb, matchWord, rankSizes } from "./sizeMatch";
import "./sizeMatch.css";

const SAVE_KEY = "identee.sizeFinder.v1";
const readSaved = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return s && WHO[s.who] && s.heightCm > 0 && s.weightKg > 0 ? s : null;
  } catch {
    return null;
  }
};
const save = (a) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(a));
  } catch {
    /* private window: nothing kept, nothing lost */
  }
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const defaultsFor = (who) => ({ heightCm: WHO[who].height[2], weightKg: WHO[who].weight[2] });

// Men, women or both, read from a style or collection name: "Girls Round Neck", "girls-wear" → women;
// "Boys Oversized", "boys-wear" → men; anything else ("Unisex & Kids Wear", "Co-ord Set") → nobody in particular.
const audienceOf = (name) => {
  const s = String(name || "").toLowerCase();
  if (/\b(girls?|wom[ae]n|ladies|female)\b/.test(s)) return "women";
  if (/\b(boys?|m[ae]n|gents|male)\b/.test(s)) return "men";
  return null;
};

// Who the garment fits, so Find my size only asks when there is a real choice (client, 20 Oct 2026):
// the garment's own style + the other collections it is shown in (Admin → Customizable → step 1), narrowed to
// the collection the customer opened it from (?from=girls-wear) — a Girls tee never asks "Men or Women".
function whoFor(garment, collection) {
  const rows = garment?.sizeChart || [];
  const kids = rows.some((r) => isKidSize(r.size));
  const grown = rows.some((r) => !isKidSize(r.size));
  if (kids && !grown) return ["kids"];
  const named = [garment?.category, ...(garment?.alsoIn || [])].map(audienceOf);
  let people = named.includes(null) || !named.length ? ["men", "women"] : ["men", "women"].filter((w) => named.includes(w));
  const from = audienceOf(collection);
  if (from && people.includes(from)) people = [from];
  return kids ? [...people, "kids"] : people;
}
// the kids' choice named after who the garment is for: a girls' tee says "Women / Girls"
const whoLabel = (w, whos) =>
  w !== "kids" ? WHO[w].label : whos.includes("women") && !whos.includes("men") ? "Girls" : whos.includes("men") && !whos.includes("women") ? "Boys" : WHO.kids.label;

/* ---------- the figure ---------- */

// smooth outline through points (Catmull-Rom as cubic Béziers)
function smooth(pts) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

const VIEW_H = 300;
function Figure({ who, heightCm, body, tee, teeHex }) {
  const maxH = WHO[who].height[1];
  const H = clamp((heightCm / maxH) * 268, 120, 268); // taller people stand taller
  const s = H / heightCm; // px per cm
  const top = VIEW_H - 12 - H;
  const cx = 100;
  const y = (f) => top + f * H;
  const kid = who === "kids";
  const headR = heightCm * (kid ? 0.072 : 0.062) * s;
  const shoulderW = body.chestCm * (who === "women" ? 0.38 : kid ? 0.4 : 0.44) * s;
  const chestW = (body.chestCm / 2.9) * s;
  const waistW = (body.waistCm / 2.95) * s;
  const hipW = (body.hipsCm / 2.9) * s;
  const neckW = headR * 0.95;
  const neckBase = top + headR * 2 + H * 0.022;
  const shoulderY = neckBase + H * 0.03;
  const L = [
    [-neckW / 2, top + headR * 1.75],
    [-neckW / 2, neckBase],
    [-shoulderW / 2, shoulderY],
    [-Math.max(chestW, shoulderW * 0.86) / 2, y(0.27)],
    [-waistW / 2, y(0.4)],
    [-hipW / 2, y(0.52)],
    [-hipW * 0.43, y(0.66)],
    [-hipW * 0.3, y(0.79)],
    [-hipW * 0.24, y(0.97)],
    [-hipW * 0.27, y(1)],
    [-hipW * 0.06, y(1)],
    [-hipW * 0.07, y(0.79)],
    [-hipW * 0.05, y(0.58)],
  ];
  const outline = [...L, [0, y(0.545)], ...[...L].reverse().map(([x, yy]) => [-x, yy])].map(([x, yy]) => [cx + x, yy]);
  const armW = Math.max(chestW * 0.2, 7);
  const arm = (side) => {
    const sx = cx + side * (shoulderW / 2 - armW * 0.45);
    const ex = cx + side * (Math.max(chestW, waistW) / 2 + armW * 0.75);
    const hx = cx + side * (Math.max(hipW, waistW) / 2 + armW * 0.6);
    return `M${sx.toFixed(1)},${(shoulderY + armW * 0.4).toFixed(1)} Q${ex.toFixed(1)},${y(0.36).toFixed(1)} ${hx.toFixed(1)},${y(0.53).toFixed(1)}`;
  };

  // the tee, to scale: a body panel, and two sleeves that follow the arms
  let teeBody = null;
  let sleeves = null;
  if (tee) {
    const half = Math.max((tee.teeCm / 2.7) * s * 0.5, chestW / 2 + 1);
    const shHalf = Math.max(((tee.shoulderCm || tee.teeCm * 0.42) * s) / 2, neckW);
    const drop = Math.max(0, shHalf - shoulderW / 2) * 0.5; // a dropped shoulder sits lower
    const topY = neckBase - H * 0.006;
    const shY = shoulderY + drop;
    const hemY = topY + tee.lengthCm * s;
    const len = H * (tee.oversized ? 0.15 : 0.11);
    const sleeveW = Math.max(armW * (tee.oversized ? 2.3 : 1.85), 12);
    const armpitY = Math.max(shY + sleeveW * 0.75, y(0.24));
    const sleeve = (k) => {
      // along the arm, opened out a little
      const hx = cx + k * (Math.max(hipW, waistW) / 2 + armW * 0.6);
      let dx = hx - (cx + k * shoulderW / 2);
      let dy = y(0.53) - shoulderY;
      const n = Math.hypot(dx, dy);
      dx = dx / n + k * 0.22;
      dy = dy / n;
      const m = Math.hypot(dx, dy);
      const sx = cx + k * (shHalf - sleeveW * 0.32);
      const sy = shY + sleeveW * 0.38;
      return `M${sx.toFixed(1)},${sy.toFixed(1)} L${(sx + (dx / m) * len).toFixed(1)},${(sy + (dy / m) * len).toFixed(1)}`;
    };
    sleeves = { d: [sleeve(-1), sleeve(1)], w: sleeveW };
    const side = (k) => [
      [cx + k * neckW * 0.62, topY],
      [cx + k * shHalf, shY],
      [cx + k * half, armpitY],
      [cx + k * half * 1.01, hemY],
    ];
    const l = side(-1);
    const r = side(1);
    const pt = (p) => ` L${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    teeBody =
      `M${l[0][0].toFixed(1)},${l[0][1].toFixed(1)} Q${cx},${(topY + H * 0.045).toFixed(1)} ${r[0][0].toFixed(1)},${r[0][1].toFixed(1)}` +
      r.slice(1).map(pt).join("") +
      ` Q${cx},${(hemY + H * 0.012).toFixed(1)} ${l[3][0].toFixed(1)},${l[3][1].toFixed(1)}` +
      [l[2], l[1]].map(pt).join("") +
      " Z";
  }

  return (
    <svg className="szf-figure" viewBox={`0 0 200 ${VIEW_H}`} role="img" aria-label={`Figure, ${heightCm} cm tall`}>
      <defs>
        <linearGradient id="szf-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3B342B" />
          <stop offset="1" stopColor="#141110" />
        </linearGradient>
      </defs>
      <ellipse cx={cx} cy={VIEW_H - 11} rx={hipW * 0.75 + 14} ry="5" className="szf-floor" />
      {/* height bracket */}
      <g className="szf-ruler">
        <line x1="22" x2="22" y1={top} y2={VIEW_H - 12} />
        <line x1="17" x2="27" y1={top} y2={top} />
        <line x1="17" x2="27" y1={VIEW_H - 12} y2={VIEW_H - 12} />
      </g>
      <path className="szf-limb" d={arm(-1)} strokeWidth={armW} />
      <path className="szf-limb" d={arm(1)} strokeWidth={armW} />
      <path className="szf-shape" d={smooth(outline)} fill="url(#szf-body)" />
      <circle className="szf-shape" cx={cx} cy={top + headR} r={headR} fill="url(#szf-body)" />
      {teeBody && (
        <g className="szf-tee" style={{ "--tee": teeHex || "#F4E7C4" }}>
          {sleeves.d.map((d) => <path key={`o${d}`} className="szf-sleeve-edge" d={d} strokeWidth={sleeves.w + 2.6} />)}
          {sleeves.d.map((d) => <path key={`f${d}`} className="szf-sleeve" d={d} strokeWidth={sleeves.w} />)}
          <path className="szf-tee-body" d={teeBody} />
        </g>
      )}
    </svg>
  );
}

/* ---------- small parts ---------- */

function ShapeIcon({ part, v }) {
  const d =
    part === "chest"
      ? (() => {
          const w = [8, 10.5, 13.5][v + 1];
          return `M${20 - w},9 Q20,6 ${20 + w},9 L${20 + w * 0.62},33 L${20 - w * 0.62},33 Z`;
        })()
      : part === "stomach"
      ? (() => {
          const b = [0, 3.5, 8][v + 1];
          return `M15,6 L15,34 M23,6 C${23 + b * 0.3},14 ${23 + b},20 ${22 + b * 0.6},26 S21,33 21,34`;
        })()
      : (() => {
          const h = [6.5, 8.5, 11][v + 1];
          return `M12,6 C14,13 15.5,16 15.5,19 C15.5,23 ${20 - h},27 ${20 - h},34 M28,6 C26,13 24.5,16 24.5,19 C24.5,23 ${20 + h},27 ${20 + h},34`;
        })();
  return (
    <svg viewBox="0 0 40 40" className="szf-icon" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Stepper({ label, value, display, min, max, onChange, unitButtons }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="szf-measure">
      <div className="szf-measure-top">
        <span className="szf-eyebrow">{label}</span>
        {unitButtons}
      </div>
      <div className="szf-value" aria-hidden="true">{display}</div>
      <div className="szf-slide">
        <button type="button" className="szf-round" onClick={() => onChange(clamp(value - 1, min, max))} aria-label={`Less ${label.toLowerCase()}`}>−</button>
        <input type="range" min={min} max={max} step="1" value={value} onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label} aria-valuetext={display} style={{ "--p": `${pct}%` }} />
        <button type="button" className="szf-round" onClick={() => onChange(clamp(value + 1, min, max))} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

function Units({ options, value, onChange, label }) {
  return (
    <div className="szf-units" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

// counts up to the score, and the ring follows
function Ring({ score, size }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const a = from.current;
    const step = (t) => {
      const k = Math.min(1, Math.max(0, (t - start) / 700));
      const v = Math.round(a + (score - a) * (1 - (1 - k) ** 3));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = score;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const C = 2 * Math.PI * 54;
  return (
    <div className="szf-ring">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r="54" className="szf-ring-bg" />
        <circle cx="64" cy="64" r="54" className="szf-ring-on" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
      </svg>
      <div className="szf-ring-in">
        <b key={size}>{size}</b>
        <small><span>{shown}</span>% fit</small>
      </div>
    </div>
  );
}

/* ---------- the finder ---------- */

export default function SizeFinder({ garment, collection = "", teeHex, onPick, onClose, pickLabel = "Choose", resume = false, onResult }) {
  const whos = useMemo(() => whoFor(garment, collection), [garment, collection]);
  const [saved] = useState(readSaved); // last time's answers, read once
  const [a, setA] = useState(() => {
    const who = saved && whos.includes(saved.who) ? saved.who : whos[0];
    const base = saved && saved.who === who ? saved : { ...defaultsFor(who), chest: 0, stomach: 0, hips: 0, feel: 0 };
    return { unitH: "cm", unitW: "kg", chest: 0, stomach: 0, hips: 0, feel: 0, ...base, who };
  });
  // resume: the customer already saw their size during this visit to the room — back to the result; on a new
  // visit it starts at "Let's find your fit" (last time's height and weight filled in)
  const [step, setStep] = useState(resume && saved && whos.includes(saved.who) ? 2 : 0);
  useEffect(() => {
    if (step === 2) onResult?.();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState(null); // the size shown on the result (null = the best one)
  const panel = useRef(null);

  const ranked = useMemo(() => rankSizes(garment, a), [garment, a]);
  const best = ranked.best;
  const shown = ranked.sizes.find((x) => x.size === view) || best;

  const set = (patch) =>
    setA((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  const setWho = (who) => {
    setView(null);
    set({ who, ...defaultsFor(who) });
  };

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!best) return null; // no size chart for this garment
  const [hMin, hMax] = WHO[a.who].height;
  const [wMin, wMax] = WHO[a.who].weight;
  const ft = cmToFtIn(a.heightCm);
  const heightText = a.unitH === "cm" ? `${a.heightCm} cm` : `${ft.ft}′ ${ft.inch}″`;
  const weightText = a.unitW === "kg" ? `${a.weightKg} kg` : `${kgToLb(a.weightKg)} lb`;
  const teeFor = (x) => ({ teeCm: x.teeCm, lengthCm: x.lengthCm || ranked.body.idealLengthCm, shoulderCm: x.row.shoulder ? x.row.shoulder * 2.54 : null, oversized: garment?.fit === "oversized" });

  return (
    <div className="szf-wrap" role="presentation">
      <div className="szf-scrim" onClick={onClose} />
      <div className="szf-panel" role="dialog" aria-modal="true" aria-labelledby="szf-title" tabIndex={-1} ref={panel}>
        <aside className="szf-stage">
          <Figure who={a.who} heightCm={a.heightCm} body={ranked.body} tee={step === 2 ? teeFor(shown) : null} teeHex={teeHex} />
          <div className="szf-stage-tag">
            <b>{heightText}</b> · {weightText}
          </div>
          {step === 2 && (
            <div className="szf-live on-you">
              <span>On you</span>
              <b key={shown.size}>{shown.size}</b>
              <small>{shown === best ? "Your best match" : "Comparing"}</small>
            </div>
          )}
          {step < 2 && (
            <div className="szf-live" aria-live="polite">
              <span>Live estimate</span>
              <b key={best.size}>{best.size}</b>
              <small>{step === 0 ? "Refined in the next step" : "Updates as you pick"}</small>
            </div>
          )}
        </aside>

        <section className="szf-main">
          <header className="szf-head">
            <div>
              <div className="szf-eyebrow">Find your perfect size</div>
              <div className="szf-garment">{garment?.label || "Your tee"}</div>
            </div>
            <button type="button" className="szf-close" onClick={onClose} aria-label="Close">×</button>
          </header>
          <div className="szf-progress" aria-hidden="true">
            {[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}
            <span>0{step + 1} / 03</span>
          </div>

          <div className="szf-body" key={step}>
            {step === 0 && (
              <>
                <h2 id="szf-title">Let’s find your fit</h2>
                <p className="szf-sub">Two measurements are all it takes. Drag to adjust.</p>
                {whos.length > 1 && (
                  <div className="szf-who" role="radiogroup" aria-label="Sizing for">
                    {whos.map((w) => (
                      <button key={w} type="button" role="radio" aria-checked={a.who === w} className={a.who === w ? "on" : ""} onClick={() => setWho(w)}>{whoLabel(w, whos)}</button>
                    ))}
                  </div>
                )}
                <Stepper label="Height" value={a.heightCm} display={heightText} min={hMin} max={hMax} onChange={(v) => set({ heightCm: v })}
                  unitButtons={<Units label="Height unit" options={["cm", "ft"]} value={a.unitH} onChange={(u) => set({ unitH: u })} />} />
                <Stepper label="Weight" value={a.weightKg} display={weightText} min={wMin} max={wMax} onChange={(v) => set({ weightKg: v })}
                  unitButtons={<Units label="Weight unit" options={["kg", "lb"]} value={a.unitW} onChange={(u) => set({ unitW: u })} />} />
              </>
            )}

            {step === 1 && (
              <>
                <h2 id="szf-title">Your shape</h2>
                <p className="szf-sub">Clothes fit bodies, not numbers. Not sure? Leave it at average.</p>
                {SHAPES.map((sh) => (
                  <div key={sh.key} className="szf-shape-row">
                    <span className="szf-eyebrow">{sh.label}</span>
                    <div className="szf-cards" role="radiogroup" aria-label={sh.label}>
                      {sh.options.map((label, i) => {
                        const v = i - 1;
                        return (
                          <button key={label} type="button" role="radio" aria-checked={a[sh.key] === v} className={a[sh.key] === v ? "on" : ""} onClick={() => set({ [sh.key]: v })}>
                            <ShapeIcon part={sh.key} v={v} />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {step === 2 && (
              <>
                <h2 id="szf-title" className="sr-only">Your size</h2>
                <div className="szf-result-top">
                  <Ring score={shown.score} size={shown.size} />
                  <div>
                    <div className="szf-eyebrow">{shown === best ? "Best match" : `Comparing ${shown.size}`}</div>
                    <p className="szf-match">{shown === best ? matchWord(best.score) : `${best.size} is your best match (${best.score}%).`}</p>
                  </div>
                </div>

                <div className="szf-scale" role="radiogroup" aria-label="Compare sizes">
                  {ranked.sizes.map((x) => (
                    <button key={x.size} type="button" role="radio" aria-checked={x === shown} className={`${x === shown ? "on" : ""}${x === best ? " best" : ""}`} onClick={() => setView(x.size)}>
                      {x.size}
                      {x === best && <i aria-label="best">★</i>}
                    </button>
                  ))}
                </div>
                <p className="szf-hint">Tap a size to see how it would fit.</p>

                <div className="szf-tracks">
                  {shown.tracks.map((t) => (
                    <div key={t.key} className="szf-track">
                      <span className="szf-track-label">{t.label}</span>
                      <div className={`szf-line${t.neutral ? " neutral" : ""}`}>
                        <span>{t.ends[0]}</span>
                        <i style={{ left: `${50 + t.value * 42}%` }} />
                        <span>{t.ends[1]}</span>
                      </div>
                      <b className={`szf-word ${t.word === "Ideal" ? "ok" : ""}`}>{t.word}</b>
                    </div>
                  ))}
                </div>

                <div className="szf-feel">
                  <span className="szf-eyebrow">How do you like it?</span>
                  <div className="szf-units wide" role="radiogroup" aria-label="How do you like it">
                    {FEELS.map((f, i) => (
                      <button key={f} type="button" role="radio" aria-checked={a.feel === i - 1} className={a.feel === i - 1 ? "on" : ""} onClick={() => { setView(null); set({ feel: i - 1 }); }}>{f}</button>
                    ))}
                  </div>
                </div>

                <p className="szf-note">{fitNote(garment, ranked, shown)}</p>
              </>
            )}
          </div>

          <footer className="szf-foot">
            {step === 0 && (
              <button type="button" className="szf-primary" onClick={() => setStep(1)}>Next: your shape →</button>
            )}
            {step === 1 && (
              <>
                <button type="button" className="szf-ghost" onClick={() => setStep(0)}>← Back</button>
                <button type="button" className="szf-primary" onClick={() => { setView(null); setStep(2); }}>See my size →</button>
              </>
            )}
            {step === 2 && (
              <>
                <button type="button" className="szf-ghost" onClick={() => setStep(0)}>Change answers</button>
                <button type="button" className="szf-primary" onClick={() => { onPick(shown.size); onClose(); }}>{pickLabel} {shown.size}</button>
              </>
            )}
          </footer>
          <p className="szf-private">Your answers stay on this device. Sizes are an estimate from our size chart.</p>
        </section>
      </div>
    </div>
  );
}
