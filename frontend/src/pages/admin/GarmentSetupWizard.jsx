// pages/admin/GarmentSetupWizard.jsx
//
// Admin → Customizable → "Set up: <garment>" — the 6-step wizard from the
// admin prototype: Basics · Sizes · Colours · Photos · Print areas · Publish.
// Steps 1–3 and 5 save when you press "Save and continue"; photos save as
// soon as they're uploaded. The garment stays a draft (hidden from
// customers) until it's published in step 6.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import garmentTypeService from "../../services/garmentTypeService";
import garmentImageService from "../../services/garmentImageService";
import {
  ALL_SIZES,
  SHEET_COLOURS,
  SHEET_DESCRIPTION,
  SHEET_FABRICS,
  sheetSizeChart,
} from "../../utils/productSheet";
import { AW } from "./garmentSetup/wizardStyles";
import PhotosStep from "./garmentSetup/PhotosStep";
import PrintAreasStep from "./garmentSetup/PrintAreasStep";
import SaveRow from "./garmentSetup/SaveRow";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const VIEWS = ["front", "back", "left", "right"];

const STEP_TITLES = ["Basics", "Sizes", "Colours", "Photos", "Print areas", "Publish"];

// Older garments may lack the wizard's fields — fill in empty defaults.
// Until Basics is first saved (no fabrics yet), guess the fit from the
// category ("Oversized" style → oversized size chart).
const withDefaults = (g) => {
  const out = { description: "", fit: "regular", fabrics: [], sizes: [], sizeChart: [], printAreas: [], colors: [], ...g };
  if (!out.fabrics.length && /oversized/i.test(out.category || "")) out.fit = "oversized";
  return out;
};

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

// What's finished, and the one-line summary under each step name.
function progress(g, images) {
  if (!g) return [];
  const docs = images.filter((d) => d.garmentType === g.key);
  const photoTotal = g.colors.length * 4;
  const photoCount = g.colors.reduce((n, c) => {
    const d = docs.find((x) => x.colorSlug === c.slug);
    return n + VIEWS.filter((v) => d?.[v]?.imageUrl).length;
  }, 0);
  const chartOk = g.sizes.length > 0 && g.sizes.every((s) => g.sizeChart.some((r) => r.size === s && r.chest && r.length));
  const offered = g.printAreas?.length ? g.printAreas.filter((p) => p.offered).length : 6;
  return [
    { done: g.fabrics.length > 0 && !!g.label, sub: g.basePrice > 0 ? `₹${g.basePrice}` : "Name, fabrics, price" },
    { done: chartOk, sub: g.sizes.length ? `${g.sizes.length} sizes` : "Not set" },
    { done: g.colors.length > 0, sub: `${g.colors.length} colours` },
    { done: photoTotal > 0 && photoCount === photoTotal, sub: `${photoCount} of ${photoTotal}` },
    { done: offered > 0, sub: `${offered} offered` },
    { done: g.isActive, sub: g.isActive ? "Live" : "Draft" },
  ].map((s, i) => ({ ...s, title: STEP_TITLES[i], photoCount, photoTotal }));
}

export default function GarmentSetupWizard() {
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get("step")) || 1, 1), 6);
  const goStep = (n) => {
    setParams({ step: String(n) }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [garment, setGarment] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [images, setImages] = useState([]);
  const [styles, setStyles] = useState([]); // [{ category, style }]
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  const reloadImages = useCallback(
    () => garmentImageService.getAllGarmentImages().then(setImages),
    [],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([
      garmentTypeService.adminGetGarment(key),
      garmentImageService.getAllGarmentImages(),
      axios.get(`${BACKEND_URL}/api/categories`).then((r) => r.data).catch(() => []),
    ])
      .then(([g, imgs, cats]) => {
        if (!alive) return;
        setGarment(withDefaults(g.garment));
        setCatalog(g.printAreaCatalog);
        setImages(imgs);
        const list = Array.isArray(cats) ? cats : cats.categories || [];
        setStyles(list.flatMap((c) => (c.styles || []).map((s) => ({ category: c.name, style: s }))));
      })
      .catch((err) => alive && setLoadError(errMsg(err, "Could not load this garment.")));
    return () => {
      alive = false;
    };
  }, [key]);

  // Save part of the garment; returns true when it worked.
  const save = async (patch, note = "Saved") => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await garmentTypeService.updateGarment(garment._id, patch);
      setGarment(withDefaults(updated));
      if (patch.printAreas) {
        const fresh = await garmentTypeService.adminGetGarment(updated.key);
        setCatalog(fresh.printAreaCatalog);
      }
      setSavedNote(note);
      setTimeout(() => setSavedNote(""), 2500);
      return true;
    } catch (err) {
      setSaveError(errMsg(err, "Could not save. Please try again."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const steps = useMemo(() => progress(garment, images), [garment, images]);
  const doneCount = steps.filter((s) => s.done).length;

  if (loadError) {
    return (
      <div style={AW.page}>
        <p style={{ color: "#A3341F" }}>{loadError}</p>
        <Link to="/admin/customizable">← Back to Customizable</Link>
      </div>
    );
  }
  if (!garment) return <div style={{ ...AW.page, color: "#6B6559" }}>Loading…</div>;

  const shared = { garment, save, saving, next: () => goStep(step + 1) };

  return (
    <div style={AW.page}>
      <style>{AW.css}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14 }}>
          <Link to="/admin/customizable" className="aw-link">← Customizable</Link>
          <span style={{ color: "#A39C8C", margin: "0 8px" }}>/</span>
          <b>Set up: {garment.label}</b>{" "}
          <span className={`aw-tag ${garment.isActive ? "live" : "draft"}`} style={{ marginLeft: 6 }}>
            {garment.isActive ? "Live" : "Draft"}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#5C5547" }}>{doneCount} of 6 done</span>
      </div>

      <div className="aw-wiz">
        <nav className="aw-steps" aria-label="Set-up steps">
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={`aw-step${step === i + 1 ? " on" : ""}`}
              onClick={() => goStep(i + 1)}
            >
              <span className={`aw-mark${s.done ? " done" : ""}`}>{s.done ? "✓" : i + 1}</span>
              <span>
                {s.title}
                <span className="aw-sub" style={{ display: "block", fontWeight: 500, fontSize: 12, color: "#8A8170" }}>
                  {s.sub}
                </span>
              </span>
            </button>
          ))}
        </nav>

        <section className="aw-card" style={{ padding: 24, minWidth: 0 }}>
          {step === 1 && <BasicsStep {...shared} styles={styles} />}
          {step === 2 && <SizesStep {...shared} />}
          {step === 3 && <ColoursStep {...shared} />}
          {step === 4 && (
            <PhotosStep {...shared} images={images} reloadImages={reloadImages} progress={steps[3]} />
          )}
          {step === 5 && <PrintAreasStep {...shared} catalog={catalog} images={images} />}
          {step === 6 && <PublishStep {...shared} steps={steps} goStep={goStep} />}

          {(saveError || savedNote) && (
            <p style={{ margin: "16px 0 0", fontSize: 13, fontWeight: 600, color: saveError ? "#A3341F" : "#2E7D4F" }}>
              {saveError || `✓ ${savedNote}`}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, paddingTop: 16, borderTop: "1px solid #EFE7D4" }}>
            <button type="button" className="aw-btn light" disabled={step === 1} onClick={() => goStep(step - 1)}>
              ← Back
            </button>
            {/* Each step renders its own "Save and continue" button */}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Step 1: Basics ---------------- */

function BasicsStep({ garment, save, saving, next, styles }) {
  const oversizedHint = garment.fit === "oversized";
  const [label, setLabel] = useState(garment.label);
  const [fit, setFit] = useState(oversizedHint ? "oversized" : garment.fit);
  const [fabrics, setFabrics] = useState(
    garment.fabrics.length ? garment.fabrics : oversizedHint ? SHEET_FABRICS : [],
  );
  const [price, setPrice] = useState(garment.basePrice || "");
  const [category, setCategory] = useState(garment.category);
  const [description, setDescription] = useState(
    garment.description || SHEET_DESCRIPTION[oversizedHint ? "oversized" : "regular"],
  );
  const fromSheet = !garment.fabrics.length && oversizedHint;

  const toggleFabric = (f) =>
    setFabrics((list) => (list.some((x) => x.key === f.key) ? list.filter((x) => x.key !== f.key) : [...list, f]));

  const styleKnown = styles.some((s) => s.style.toLowerCase() === category.toLowerCase());
  const shownIn = styles.find((s) => s.style.toLowerCase() === category.toLowerCase())?.category;

  const submit = async () => {
    const ok = await save({
      label,
      fit,
      fabrics: fabrics.map(({ key, name }) => ({ key, name })),
      basePrice: price === "" ? 0 : Number(price),
      category,
      description,
    });
    if (ok) next();
  };

  return (
    <div>
      <h2 style={AW.h2}>1. Basics</h2>
      <p style={AW.lead}>What this garment is. Customers see the name and description in the customizer.</p>

      <div className="aw-two" style={{ marginTop: 18 }}>
        <label>
          <span className="aw-lbl">Garment name</span>
          <input className="aw-inp" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          <span className="aw-lbl">Fit</span>
          <select className="aw-inp" value={fit} onChange={(e) => setFit(e.target.value)}>
            <option value="oversized">Oversized — relaxed, drop shoulder</option>
            <option value="regular">Regular fit</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 18 }}>
        <span className="aw-lbl">Fabric options</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {SHEET_FABRICS.map((f) => {
            const on = fabrics.some((x) => x.key === f.key);
            return (
              <button key={f.key} type="button" className={`aw-sw${on ? " on" : ""}`} style={{ width: "auto", maxWidth: 340 }} onClick={() => toggleFabric(f)}>
                <span style={{ fontSize: 16 }}>{on ? "☑" : "☐"}</span>
                <span>
                  {f.name}
                  <span style={{ display: "block", fontSize: 11.5, color: "#6B6559", fontWeight: 500 }}>{f.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="aw-help">
          Customers pick one when ordering.{fromSheet && " Pre-filled from your product sheet — press Save to keep it."}
        </p>
      </div>

      <div className="aw-two" style={{ marginTop: 18 }}>
        <label>
          <span className="aw-lbl">Starting price (₹)</span>
          <input className="aw-inp" type="number" min="0" inputMode="numeric" value={price} placeholder="Not decided yet" onChange={(e) => setPrice(e.target.value)} />
          <span className="aw-help" style={{ display: "block" }}>
            Price of the blank garment; print and artwork charges are added on top. You can publish only after setting it.
          </span>
        </label>
        <label>
          <span className="aw-lbl">Shown in category</span>
          <select className="aw-inp" value={styleKnown ? styles.find((s) => s.style.toLowerCase() === category.toLowerCase()).style : category} onChange={(e) => setCategory(e.target.value)}>
            {!styleKnown && <option value={category}>{category} (not in any category)</option>}
            {styles.map((s) => (
              <option key={`${s.category}-${s.style}`} value={s.style}>
                {s.category} › {s.style}
              </option>
            ))}
          </select>
          <span className="aw-help" style={{ display: "block" }}>
            {shownIn ? `Appears on the website under ${shownIn}.` : "Pick a style so it appears under a category."}
          </span>
        </label>
      </div>

      <label style={{ display: "block", marginTop: 18 }}>
        <span className="aw-lbl">Description</span>
        <textarea className="aw-inp" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ resize: "vertical" }} />
      </label>

      <SaveRow saving={saving} onSave={submit} disabled={!label.trim()} />
    </div>
  );
}

/* ---------------- Step 2: Sizes ---------------- */

function SizesStep({ garment, save, saving, next }) {
  const [sizes, setSizes] = useState(garment.sizes.length ? garment.sizes : ALL_SIZES);
  const [chart, setChart] = useState(() => {
    const sheet = sheetSizeChart(garment.fit);
    return ALL_SIZES.map((size) => garment.sizeChart.find((r) => r.size === size) || sheet.find((r) => r.size === size));
  });
  const fromSheet = !garment.sizeChart.length;

  const toggle = (s) =>
    setSizes((list) => (list.includes(s) ? list.filter((x) => x !== s) : ALL_SIZES.filter((x) => x === s || list.includes(x))));
  const edit = (size, field, value) =>
    setChart((rows) => rows.map((r) => (r.size === size ? { ...r, [field]: value === "" ? "" : Number(value) } : r)));

  const submit = async () => {
    const ok = await save({ sizes, sizeChart: chart.filter((r) => sizes.includes(r.size)) });
    if (ok) next();
  };

  return (
    <div>
      <h2 style={AW.h2}>2. Sizes</h2>
      <p style={AW.lead}>Tap a size to turn it on or off. Customers see this size chart in the customizer.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {ALL_SIZES.map((s) => (
          <button key={s} type="button" className={`aw-chip${sizes.includes(s) ? " on" : ""}`} onClick={() => toggle(s)}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="aw-lbl">{garment.fit === "oversized" ? "Oversized" : "Regular fit"} size chart (inches, laid flat)</span>
          <button type="button" className="aw-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setChart(sheetSizeChart(garment.fit))}>
            Reset to product sheet
          </button>
        </div>
        <table className="aw-table" style={{ maxWidth: 520 }}>
          <thead>
            <tr><th>Size</th><th>Chest</th><th>Shoulder</th><th>Length</th></tr>
          </thead>
          <tbody>
            {chart.filter((r) => sizes.includes(r.size)).map((r) => (
              <tr key={r.size}>
                <td><b>{r.size}</b></td>
                {["chest", "shoulder", "length"].map((f) => (
                  <td key={f}>
                    <input className="aw-inp small" type="number" min="0" step="0.5" aria-label={`${r.size} ${f}`} value={r[f] ?? ""} onChange={(e) => edit(r.size, f, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="aw-help">
          Chest = around the fullest part · Shoulder = seam to seam · Length = highest shoulder point to hem.
          {fromSheet && " Filled in from your product sheet — press Save to keep it."} The garment photos are drawn to this chart, so print sizes look true to size.
        </p>
      </div>

      <SaveRow saving={saving} onSave={submit} disabled={!sizes.length} />
    </div>
  );
}

/* ---------------- Step 3: Colours ---------------- */

function ColoursStep({ garment, save, saving, next }) {
  const [colors, setColors] = useState(garment.colors);
  const [custom, setCustom] = useState({ name: "", hex: "#888888" });
  const has = (slug) => colors.some((c) => c.slug === slug);
  const extras = colors.filter((c) => !SHEET_COLOURS.some((s) => s.slug === c.slug));

  const toggle = (c) => setColors((list) => (has(c.slug) ? list.filter((x) => x.slug !== c.slug) : [...list, c]));
  const addCustom = () => {
    const name = custom.name.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!has(slug)) setColors((list) => [...list, { name, slug, hex: custom.hex.toUpperCase() }]);
    setCustom({ name: "", hex: "#888888" });
  };

  const submit = async () => {
    const ok = await save({ colors });
    if (ok) next();
  };

  return (
    <div>
      <h2 style={AW.h2}>3. Colours</h2>
      <p style={AW.lead}>
        {colors.length} selected. Each colour needs photos in the next step. Removing a colour hides it from customers; its photos are kept.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" className="aw-btn light" onClick={() => setColors([...SHEET_COLOURS.filter((c) => !has(c.slug)), ...colors].sort((a, b) => SHEET_COLOURS.findIndex((s) => s.slug === a.slug) - SHEET_COLOURS.findIndex((s) => s.slug === b.slug)))}>
          Select all 12 from product sheet
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginTop: 14 }}>
        {[...SHEET_COLOURS, ...extras].map((c) => (
          <button key={c.slug} type="button" className={`aw-sw${has(c.slug) ? " on" : ""}`} onClick={() => toggle(c)}>
            <span className="aw-dot" style={{ background: c.hex }} />
            <span style={{ flex: 1 }}>{c.name}</span>
            <span>{has(c.slug) ? "✓" : ""}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 200px" }}>
          <span className="aw-lbl">Add another colour</span>
          <input className="aw-inp" placeholder="e.g. Olive" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
        </label>
        <label>
          <span className="aw-lbl">Colour</span>
          <input type="color" value={custom.hex} onChange={(e) => setCustom({ ...custom, hex: e.target.value })} style={{ width: 56, height: 44, border: "1px solid #D7CCB3", borderRadius: 10, padding: 2, background: "#fff" }} />
        </label>
        <button type="button" className="aw-btn light" onClick={addCustom} disabled={!custom.name.trim()}>
          Add
        </button>
      </div>

      <SaveRow saving={saving} onSave={submit} disabled={!colors.length} />
    </div>
  );
}

/* ---------------- Step 6: Publish ---------------- */

function PublishStep({ garment, save, saving, steps, goStep }) {
  const blockers = [];
  if (!steps[0].done) blockers.push({ step: 1, text: "Choose at least one fabric" });
  if (!(garment.basePrice > 0)) blockers.push({ step: 1, text: "Set the starting price" });
  if (!steps[1].done) blockers.push({ step: 2, text: "Fill in the size chart" });
  if (!steps[2].done) blockers.push({ step: 3, text: "Pick at least one colour" });
  if (!steps[3].done) blockers.push({ step: 4, text: `Upload all photos (${steps[3].photoCount} of ${steps[3].photoTotal})` });
  if (!steps[4].done) blockers.push({ step: 5, text: "Offer at least one print area" });
  const firstColour = garment.colors[0]?.slug;

  return (
    <div>
      <h2 style={AW.h2}>6. Preview & publish</h2>
      <p style={AW.lead}>Check everything, try it in the customizer, then publish.</p>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.slice(0, 5).map((s, i) => (
          <div key={s.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid #EFE7D4", borderRadius: 12 }}>
            <span className={`aw-mark${s.done ? " done" : ""}`}>{s.done ? "✓" : "!"}</span>
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>{s.title}</b>
              <span style={{ display: "block", fontSize: 12.5, color: "#6B6559" }}>{s.sub}</span>
            </span>
            <button type="button" className="aw-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => goStep(i + 1)}>
              Edit
            </button>
          </div>
        ))}
      </div>

      {blockers.length > 0 && !garment.isActive && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#FBEFD2", fontSize: 13.5 }}>
          <b>Before you can publish:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {blockers.map((b) => (
              <li key={b.text}>
                {b.text} —{" "}
                <button type="button" className="aw-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => goStep(b.step)}>
                  go to step {b.step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {garment.isActive && blockers.length > 0 && (
        <p style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#FBEFD2", fontSize: 13.5 }}>
          This garment is live but not finished: {blockers.map((b) => b.text.toLowerCase()).join("; ")}.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
        {garment.isActive ? (
          <>
            <a className="aw-btn light" href={`/customize/${garment.key}?color=${firstColour || ""}`} target="_blank" rel="noopener noreferrer">
              Open in customizer ↗
            </a>
            <button type="button" className="aw-btn light" disabled={saving} onClick={() => save({ isActive: false }, "Unpublished — hidden from customers")}>
              Unpublish
            </button>
          </>
        ) : (
          <button type="button" className="aw-btn gold" disabled={saving || blockers.length > 0} onClick={() => save({ isActive: true }, "Published — customers can now design on it")}>
            {saving ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>
      <p className="aw-help">
        {garment.isActive
          ? `Live — ${garment.label} appears under "Design your own" on the website.`
          : "Draft — customers can't see it yet. You can open it in the customizer after publishing."}
      </p>
    </div>
  );
}
