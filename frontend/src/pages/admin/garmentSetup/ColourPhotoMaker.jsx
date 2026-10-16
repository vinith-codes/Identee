// pages/admin/garmentSetup/ColourPhotoMaker.jsx
//
// Wizard step 4, "Make all colours from one white garment": the admin uploads white front / back photos (sides
// optional), checks where the shoulder and hem are, previews every colour and saves all the photos plus the photo
// ruler. Runs in the browser (colourPhotos.js) — no developer and no cost. The hand-upload table below stays.
import { useMemo, useRef, useState } from "react";
import garmentImageService from "../../../services/garmentImageService";
import { analyse, canvasFit, cutOut, measure, place, recolour, sideDrawing, toJpegFile } from "./colourPhotos";

const VIEWS = [
  ["front", "Front", true],
  ["back", "Back", true],
  ["left", "Left side", false],
  ["right", "Right side", false],
];
const MAX_MB = 12;

// size M of the chart (else the middle size): flat chest (half the round chest) and length, in inches
const chartM = (garment) => {
  const rows = (garment.sizeChart || []).filter((r) => r.chest > 0 && r.length > 0);
  const row = rows.find((r) => r.size === "M") || rows[Math.floor(rows.length / 2)];
  return row ? { size: row.size, chestFlatIn: row.chest / 2, lengthIn: row.length } : null;
};

export default function ColourPhotoMaker({ garment, images, reloadImages, save }) {
  // (kept stable, so the photo work below only runs again when something really changed)
  const chart = useMemo(() => chartM(garment), [garment]);
  const colours = useMemo(() => garment.colors || [], [garment.colors]);
  const inputRef = useRef(null);
  const [pickView, setPickView] = useState(null);
  const [cuts, setCuts] = useState({}); // view -> { canvas, url, marks, hanger }
  const [stage, setStage] = useState(""); // what is happening now
  const [error, setError] = useState("");
  const [adjust, setAdjust] = useState("front"); // the view whose lines are shown
  const [widthPct, setWidthPct] = useState(100);
  const [shadows, setShadows] = useState(60);
  const [colourSlug, setColourSlug] = useState(null);
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(null); // { done, total }
  const [sides, setSides] = useState(null); // the standard side drawing, once loaded
  const [drag, setDrag] = useState(null); // "top" | "hem" while a line is dragged

  const colour = colours.find((c) => c.slug === colourSlug) || colours[0];
  const ready = cuts.front && cuts.back && chart;

  const choose = (view) => {
    setPickView(view);
    setError("");
    inputRef.current.value = "";
    inputRef.current.click();
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pickView) return;
    if (!file.type.startsWith("image/")) return setError("Please choose a photo (JPG, PNG or WebP).");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`That photo is over ${MAX_MB} MB — please use a smaller one.`);
    const view = pickView;
    try {
      setStage(`Removing the background of the ${view} photo…`);
      const canvas = await cutOut(file, (t) => typeof t === "string" && setStage(t));
      const m = measure(canvas);
      setCuts((c) => ({ ...c, [view]: { canvas, url: canvas.toDataURL("image/png"), marks: { top: m.top, hem: m.hem }, hanger: m.hanger, h: m.h } }));
      setAdjust(view);
      if (!sides && !cuts.left && !cuts.right) sideDrawing().then(setSides).catch(() => {});
    } catch (err) {
      setError(err?.message || "That photo couldn't be prepared. Try another one.");
    } finally {
      setStage("");
    }
  };

  // the four views, sized to the chart and ready to recolour (worked out again when the photos, lines or width change)
  const parts = useMemo(() => {
    if (!ready) return null;
    const out = {};
    for (const [view] of VIEWS) {
      const c = cuts[view];
      if (c) out[view] = analyse(place(c.canvas, c.marks, chart, widthPct, view === "left" || view === "right"), { hanger: c.hanger });
      else if (sides && (view === "left" || view === "right")) out[view] = analyse(sides[view]);
    }
    return out;
  }, [ready, cuts, chart, widthPct, sides]);

  // small pictures: every colour's front, and the chosen colour's four views
  const preview = useMemo(() => {
    if (!parts) return null;
    const thumb = (canvas, w) => {
      const t = document.createElement("canvas");
      t.width = w;
      t.height = Math.round(w * 1.25);
      t.getContext("2d").drawImage(canvas, 0, 0, t.width, t.height);
      return t.toDataURL("image/jpeg", 0.8);
    };
    return {
      fronts: colours.map((c) => ({ slug: c.slug, name: c.name, url: thumb(recolour(parts.front, c.hex, shadows), 120) })),
      views: colour ? VIEWS.filter(([v]) => parts[v]).map(([v, label]) => ({ view: v, label, url: thumb(recolour(parts[v], colour.hex, shadows), 220) })) : [],
    };
  }, [parts, colours, colour, shadows]);

  const fit = chart ? canvasFit(chart.chestFlatIn, chart.lengthIn) : null;
  const docFor = (slug) => images.find((d) => d.garmentType === garment.key && d.colorSlug === slug);
  const plannedViews = parts ? VIEWS.filter(([v]) => parts[v]).map(([v]) => v) : [];
  const toMake = colours.flatMap((c) => plannedViews.filter((v) => replace || !docFor(c.slug)?.[v]?.imageUrl).map((v) => [c, v]));

  const makeAll = async () => {
    if (!toMake.length) return setError(replace ? "Nothing to make." : "Every photo is already there — tick “Replace the existing photos” to make them again.");
    setError("");
    setSaving({ done: 0, total: toMake.length });
    try {
      for (let i = 0; i < toMake.length; i++) {
        const [c, v] = toMake[i];
        const file = await toJpegFile(recolour(parts[v], c.hex, shadows), `${garment.key}-${c.slug}-${v}.jpg`);
        await garmentImageService.uploadGarmentViewPhoto(garment.key, c.slug, c.name, c.hex, v, file);
        setSaving({ done: i + 1, total: toMake.length });
      }
      // the photo ruler: where the shoulder top and the hem are, so print boxes are true to size
      await save({ photoRuler: fit.ruler }, "Photos made — previews are true to size");
      await reloadImages();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Saving stopped. Press the button again to go on — finished photos are kept.");
    } finally {
      setSaving(null);
    }
  };

  // dragging a line on the photo: the row in the cut-out under the pointer
  const box = useRef(null);
  const rowAt = (e) => {
    const r = box.current.getBoundingClientRect();
    const c = cuts[adjust];
    return Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * c.h);
  };
  const onMove = (e) => {
    if (!drag) return;
    const y = rowAt(e);
    setCuts((all) => {
      const c = all[adjust];
      const marks = drag === "top" ? { ...c.marks, top: Math.min(y, c.marks.hem - 20) } : { ...c.marks, hem: Math.max(y, c.marks.top + 20) };
      return { ...all, [adjust]: { ...c, marks } };
    });
  };

  if (!colours.length) return null;
  const cur = cuts[adjust];

  return (
    <section className="cpm" aria-label="Make all colours from one white garment">
      <style>{CSS}</style>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <div className="cpm-head">
        <b>Make all colours from one white garment</b>
        <span>Free, in your browser · about 1–2 minutes</span>
      </div>
      {!chart && <p className="cpm-warn">Add the size chart in step 2 first — the photos are sized to it.</p>}
      {error && <p className="cpm-warn" role="alert">{error}</p>}
      {stage && <p className="cpm-stage" role="status">{stage}</p>}

      <div className="cpm-step">
        <p className="cpm-h">1 · White photos <small>blank garment, plain background, nothing printed</small></p>
        <div className="cpm-views">
          {VIEWS.map(([v, label, needed]) => (
            <button key={v} type="button" className={`cpm-view${cuts[v] ? " has" : ""}`} onClick={() => choose(v)} disabled={!!stage || !!saving}>
              {cuts[v] ? <img src={cuts[v].url} alt="" /> : <span>+ {label}{needed ? "" : " (optional)"}</span>}
              {cuts[v] && <small>{label} ✓ · change</small>}
            </button>
          ))}
        </div>
        <p className="cpm-help">The background is removed here. No side photos? A standard side view is used.</p>
      </div>

      {ready && cur && (
        <div className="cpm-step cpm-fit">
          <div
            ref={box}
            className="cpm-photo"
            onPointerMove={onMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
          >
            <img src={cur.url} alt={`${adjust} photo`} draggable={false} />
            {["top", "hem"].map((k) => (
              <div
                key={k}
                className="cpm-line"
                style={{ top: `${(cur.marks[k] / cur.h) * 100}%` }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDrag(k);
                }}
                role="slider"
                aria-label={k === "top" ? "Top of the shoulder" : "Hem"}
                aria-valuenow={cur.marks[k]}
                tabIndex={0}
                onKeyDown={(e) => {
                  const d = e.key === "ArrowUp" ? -2 : e.key === "ArrowDown" ? 2 : 0;
                  if (d) setCuts((all) => ({ ...all, [adjust]: { ...all[adjust], marks: { ...all[adjust].marks, [k]: all[adjust].marks[k] + d } } }));
                }}
              >
                <span>{k === "top" ? "shoulder" : "hem"}</span>
              </div>
            ))}
          </div>
          <div className="cpm-controls">
            <p className="cpm-h">2 · Fit to the size chart <small>found automatically</small></p>
            <p className="cpm-help">
              Size {chart.size}: chest {chart.chestFlatIn}″ flat, length {chart.lengthIn}″ (step 2). The red lines must sit on the
              top of the shoulder and on the hem — drag them if they don't.
            </p>
            <div className="cpm-pick">
              {VIEWS.filter(([v]) => cuts[v]).map(([v, label]) => (
                <button key={v} type="button" className={adjust === v ? "on" : ""} onClick={() => setAdjust(v)}>{label}</button>
              ))}
            </div>
            <label className="cpm-range">
              <span>Width</span>
              <input type="range" min="80" max="120" step="1" value={widthPct} onChange={(e) => setWidthPct(Number(e.target.value))} />
              <b>{widthPct}%</b>
            </label>
            <label className="cpm-range">
              <span>Shadows</span>
              <input type="range" min="0" max="100" step="5" value={shadows} onChange={(e) => setShadows(Number(e.target.value))} />
              <b>{shadows}%</b>
            </label>
            <p className="cpm-help">Width: if the garment looks too slim or too wide. Shadows: how strong the folds look.</p>
          </div>
        </div>
      )}

      {preview && (
        <div className="cpm-step">
          <p className="cpm-h">3 · Every colour <small>tap one to see all its views</small></p>
          <div className="cpm-colours">
            {preview.fronts.map((p) => (
              <button key={p.slug} type="button" className={colour?.slug === p.slug ? "on" : ""} onClick={() => setColourSlug(p.slug)} title={p.name}>
                <img src={p.url} alt={p.name} />
                <small>{p.name}</small>
              </button>
            ))}
          </div>
          <div className="cpm-big">
            {preview.views.map((p) => (
              <figure key={p.view}>
                <img src={p.url} alt={`${colour.name} ${p.label}`} />
                <figcaption>{colour.name} · {p.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="cpm-save">
          <label>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace the existing photos
          </label>
          <span className="cpm-help">
            {saving ? `Saving ${saving.done} of ${saving.total}…` : `Makes ${toMake.length} photo${toMake.length === 1 ? "" : "s"} (${colours.length} colours × ${plannedViews.length} views${replace ? "" : ", missing ones only"}) and saves the photo ruler.`}
          </span>
          <button type="button" className="aw-btn dark" onClick={makeAll} disabled={!!saving}>
            {saving ? "Saving…" : `Make ${toMake.length} photos`}
          </button>
        </div>
      )}
    </section>
  );
}

const CSS = `
.cpm { border: 1px solid #E8DCC0; background: #FFFCF4; border-radius: 14px; padding: 16px 18px; display: grid; gap: 14px; margin-top: 16px; }
.cpm-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.cpm-head b { font-size: 15px; }
.cpm-head span, .cpm-help { font-size: 12px; color: #6B6559; margin: 0; }
.cpm-warn { margin: 0; font-size: 13px; font-weight: 600; color: #A3341F; }
.cpm-stage { margin: 0; font-size: 13px; color: #8C6A1F; font-weight: 600; }
.cpm-step { display: grid; gap: 8px; }
.cpm-h { margin: 0; font-size: 13px; font-weight: 700; }
.cpm-h small { font-weight: 500; color: #6B6559; margin-left: 6px; }
.cpm-views { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.cpm-view { aspect-ratio: 4 / 5; border: 1px dashed #CDBF9C; border-radius: 10px; background: #fff; display: grid; place-items: center; position: relative; cursor: pointer; font-size: 12px; color: #6B6559; padding: 6px; overflow: hidden; }
.cpm-view.has { border-style: solid; }
.cpm-view img { width: 100%; height: 100%; object-fit: contain; }
.cpm-view small { position: absolute; left: 6px; bottom: 6px; font-size: 11px; background: rgba(255,255,255,.9); border-radius: 6px; padding: 1px 6px; color: #3B342B; }
.cpm-fit { grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 720px) { .cpm-fit { grid-template-columns: minmax(0, 1fr); } .cpm-views { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cpm-photo { position: relative; background: repeating-conic-gradient(#F1EDE3 0% 25%, #fff 0% 50%) 0 0 / 16px 16px; border: 1px solid #E2D8C3; border-radius: 10px; touch-action: none; user-select: none; }
.cpm-photo img { display: block; width: 100%; height: auto; }
.cpm-line { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid #D85A30; cursor: ns-resize; }
.cpm-line::before { content: ""; position: absolute; left: 0; right: 0; top: -9px; height: 18px; }
.cpm-line span { position: absolute; right: 4px; top: -18px; font-size: 11px; font-weight: 700; color: #B03C1B; background: rgba(255,255,255,.9); border-radius: 4px; padding: 0 4px; }
.cpm-controls { display: grid; gap: 8px; }
.cpm-pick { display: flex; gap: 6px; flex-wrap: wrap; }
.cpm-pick button { border: 1px solid #E2D8C3; background: #fff; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.cpm-pick button.on { background: #15130F; color: #fff; border-color: #15130F; }
.cpm-range { display: grid; grid-template-columns: 70px minmax(0, 1fr) 44px; gap: 10px; align-items: center; font-size: 12px; color: #6B6559; }
.cpm-range b { color: #15130F; font-variant-numeric: tabular-nums; }
.cpm-colours { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.cpm-colours button { border: 1px solid #E2D8C3; background: #fff; border-radius: 10px; padding: 4px; cursor: pointer; display: grid; gap: 2px; }
.cpm-colours button.on { border: 2px solid #C9A24B; }
.cpm-colours img { width: 100%; border-radius: 6px; }
.cpm-colours small { font-size: 10.5px; color: #3B342B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpm-big { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.cpm-big figure { margin: 0; display: grid; gap: 4px; }
.cpm-big img { width: 100%; border-radius: 10px; border: 1px solid #E2D8C3; }
.cpm-big figcaption { font-size: 11.5px; color: #6B6559; }
.cpm-save { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border-top: 1px solid #E8DCC0; padding-top: 12px; }
.cpm-save label { display: flex; gap: 6px; align-items: center; font-size: 13px; }
`;
