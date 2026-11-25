// pages/admin/shop/shopAddParts.jsx — the parts Add a tee and Add many tees share (25 Nov 2026)
import { useEffect, useRef, useState } from "react";
import { styleLabel } from "../../../studio/shopTeeBuilder";
import { readPicture, sharpness } from "./shopAddUtils";

/** One picture box: drop or pick a file, see it, change it, remove it, clear a plain background. */
export function PictureBox({ label, pic, onPick, dpi, disabled }) {
  const input = useRef(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState("");
  const [over, setOver] = useState(false);
  useEffect(() => () => pic?.preview && URL.revokeObjectURL(pic.preview), [pic]);

  const take = async (file) => {
    if (!file) return;
    setProblem("");
    try {
      onPick(await readPicture(file));
    } catch (err) {
      setProblem(err.message);
    }
  };
  const clearBackground = async () => {
    if (!pic || busy) return;
    setBusy("Clearing the background…");
    setProblem("");
    try {
      const img = new Image();
      img.src = pic.preview;
      await img.decode();
      const { removeBackground } = await import("../../../studio/removeBackground");
      const out = await removeBackground(img, (t) => setBusy(t));
      if (out.already) setProblem("This picture already has a see-through background.");
      else if (out.needsServer) setProblem("This looks like a photo, not a plain background — use a cut-out PNG for it.");
      else onPick(await readPicture(new File([out.blob], (pic.file?.name || "picture").replace(/\.\w+$/, "") + "-cut.png", { type: "image/png" })));
    } catch (err) {
      setProblem(err.message || "The background couldn’t be cleared.");
    } finally {
      setBusy("");
    }
  };
  const sharp = sharpness(dpi);

  return (
    <div className="sa-pic">
      <b className="sa-pic-label">{label}</b>
      <div
        className={`sa-drop${over ? " is-over" : ""}${pic ? " has-pic" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) take(e.dataTransfer.files?.[0]);
        }}
      >
        {pic ? (
          <img src={pic.preview} alt={label} />
        ) : (
          <button type="button" className="sa-drop-btn" onClick={() => input.current?.click()} disabled={disabled}>
            Drop a picture here
            <small>or tap to pick one</small>
          </button>
        )}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => (take(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
      {pic && (
        <>
          <p className="sm-note sa-pic-size">
            {pic.w} × {pic.h} px
          </p>
          {sharp && <p className={sharp.ok ? "sa-ok" : "sa-warn"}>{sharp.text}</p>}
          <div className="sa-pic-btns">
            <button type="button" className="sm-btn" onClick={() => input.current?.click()} disabled={disabled || Boolean(busy)}>
              Change
            </button>
            <button type="button" className="sm-btn" onClick={clearBackground} disabled={disabled || Boolean(busy)}>
              {busy || "Remove background"}
            </button>
            <button type="button" className="sm-btn sm-btn-link" onClick={() => onPick(null)} disabled={disabled || Boolean(busy)}>
              Remove
            </button>
          </div>
        </>
      )}
      {problem && <p className="sa-warn">{problem}</p>}
    </div>
  );
}

// a small drawing of each print place
const BOX = {
  "left-chest": [56, 30, 14, 12],
  "centre-front": [38, 28, 24, 18],
  "full-front": [34, 24, 32, 44],
  "full-back": [33, 22, 34, 44],
  nape: [44, 15, 12, 6],
};
function Spot({ spot, side }) {
  const b = BOX[spot];
  const neck = side === "front" ? "Q50,24 62,8" : "Q50,13 62,8";
  return (
    <svg viewBox="0 0 100 100" width="54" height="54" aria-hidden="true">
      <path d={`M30,12 L38,8 ${neck} L70,12 L92,30 L80,42 L72,36 L72,94 L28,94 L28,36 L20,42 L8,30 Z`} fill="#F4F1EA" stroke="#8B8273" strokeWidth="2" />
      {b ? <rect x={b[0]} y={b[1]} width={b[2]} height={b[3]} rx="2" fill="#C9A24B" /> : <path d="M38,50 L62,74 M62,50 L38,74" stroke="#B3412E" strokeWidth="3" />}
    </svg>
  );
}

/** The print place choices for one side, as pictures. */
export function SpotPicker({ title, side, spots, value, onChange, disabled, empty }) {
  return (
    <fieldset className="sa-spots" disabled={disabled}>
      <legend>
        {title}
        {empty && <small> — {empty}</small>}
      </legend>
      <div className="sa-spot-row">
        {spots.map((s) => (
          <label key={s.key} className={`sa-spot${value === s.key ? " is-on" : ""}`} title={s.hint}>
            <input type="radio" name={`spot-${side}`} value={s.key} checked={value === s.key} onChange={() => onChange(s.key)} />
            <Spot spot={s.key} side={side} />
            <span>{s.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The styles to make, each with its colours and price (Add a tee step 4, Add many tees step 3).
 * picks: { [garmentKey]: { on, colours: [slugs], price, oldPrice } }; setPick(key, patch).
 */
export function StylesPicker({ styles, picks, setPick, disabled }) {
  return (
    <div className="sa-styles">
      {styles.map((g) => {
        const p = picks[g.key] || { on: false, colours: [] };
        return (
          <div key={g.key} className={`sa-style${p.on ? " is-on" : ""}`}>
            <label className="sm-check sa-style-name">
              <input type="checkbox" checked={p.on} onChange={(e) => setPick(g.key, { on: e.target.checked })} disabled={disabled} />
              {styleLabel(g)}
              <small>
                ₹{g.basePrice}
                {g.comparePrice > g.basePrice ? ` (was ₹${g.comparePrice})` : ""} · {g.sizes[0]}–{g.sizes[g.sizes.length - 1]}
              </small>
            </label>
            {p.on && (
              <>
                <div className="se-swatches">
                  {g.colours
                    .filter((c) => g.shop.colours.includes(c.slug))
                    .map((c) => {
                      const on = p.colours.includes(c.slug);
                      return (
                        <button key={c.slug} type="button" className={`se-swatch${on ? " is-on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => setPick(g.key, { colours: on ? p.colours.filter((x) => x !== c.slug) : [...p.colours, c.slug] })}>
                          <i style={{ background: c.hex }} aria-hidden="true" />
                          {c.name}
                        </button>
                      );
                    })}
                </div>
                <div className="sa-price">
                  <label className="sm-field">
                    Price (₹)
                    <input type="number" min={1} value={p.price} placeholder={String(g.basePrice)} onChange={(e) => setPick(g.key, { price: e.target.value })} disabled={disabled} />
                  </label>
                  <label className="sm-field">
                    Struck &quot;was&quot; price (₹)
                    <input type="number" min={0} value={p.oldPrice} placeholder={g.comparePrice ? String(g.comparePrice) : "none"} onChange={(e) => setPick(g.key, { oldPrice: e.target.value })} disabled={disabled} />
                  </label>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
