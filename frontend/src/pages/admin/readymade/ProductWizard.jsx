// pages/admin/readymade/ProductWizard.jsx
//
// Admin → Ready-made → "Add a product" (/admin/upload-product) and
// "Edit" (/admin/products/:groupId/edit).
//
// Five steps: Basics · Colours & photos · Sizes, price & stock ·
// More details (optional) · Review & publish. Nothing is saved until the
// last step; you can move between steps freely. One product = one
// "group" on the server with one document per colour
// (server/controllers/productAdminController.js).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import productAdminService from "../../../services/productAdminService";
import { imageUrl } from "../../../utils/imageUrl";
import { ALL_SIZES, SHEET_COLOURS, SHEET_FABRICS } from "../../../utils/productSheet";
import { AW } from "../garmentSetup/wizardStyles";
import { colourHex, RM_CSS } from "./readymadeUi";

const STEPS = ["Basics", "Colours & photos", "Sizes, price & stock", "More details", "Review & publish"];
const MAX_PHOTOS = 8;
const GENDERS = ["Unisex", "Men", "Women", "Kids"];
const AGE_RANGES = ["Adult", "Teen", "Kids", "Infant"];
const TYPES = ["Casual", "Sports", "Party", "Formal", "Ethnic"];
const WASH = ["Machine wash cold", "Hand wash only", "Do not bleach", "Tumble dry low", "Iron on low heat", "Dry clean only", "Do not wring"];
const EXTRA_SIZES = ["Free Size"];
const FABRICS = [...SHEET_FABRICS.map((f) => f.name), "100% Cotton", "Cotton blend", "Polyester", "Dri-fit polyester"];

let keySeq = 0;
const newKey = () => `c${++keySeq}`;

const emptyColour = (color = "") => ({ key: newKey(), _id: null, color, images: [], price: "", oldPrice: "", stockBySize: {}, ordered: false });

const emptyForm = () => ({
  name: "",
  description: "",
  style: "",
  fabric: "",
  gender: "Unisex",
  featured: false,
  hidden: false,
  sizes: [],
  samePrice: true,
  price: "",
  oldPrice: "",
  colours: [],
  sku: "",
  hsnCode: "6109",
  ageRange: "Adult",
  type: "Casual",
  subcategory: "",
  washCare: [],
  productType: "single",
  comboName: "",
  sizeChartUrl: "",
  sizeChartFile: null,
  shipping: { weight: "", dimensions: { length: "", width: "", height: "" }, originAddress: { street1: "", city: "", state: "", zip: "", country: "" } },
});

// Server group → form
const fromGroup = (g) => {
  const sizes = [...new Set(g.colours.flatMap((c) => c.sizes))];
  const prices = new Set(g.colours.map((c) => `${c.price}/${c.oldPrice}`));
  const sh = g.shipping || {};
  return {
    ...emptyForm(),
    name: g.name,
    description: g.description,
    style: g.style,
    fabric: g.fabric,
    gender: g.gender || "Unisex",
    featured: g.featured,
    hidden: g.hidden,
    sizes,
    samePrice: prices.size <= 1,
    price: String(g.colours[0]?.price ?? ""),
    oldPrice: g.colours[0]?.oldPrice > g.colours[0]?.price ? String(g.colours[0].oldPrice) : "",
    colours: g.colours.map((c) => ({
      key: newKey(),
      _id: c._id,
      color: c.color,
      images: c.images.map((url) => ({ url })),
      price: String(c.price),
      oldPrice: c.oldPrice > c.price ? String(c.oldPrice) : "",
      stockBySize: c.stockBySize || {},
      ordered: c.ordered,
    })),
    sku: g.sku || "",
    hsnCode: g.hsnCode || "6109",
    ageRange: g.ageRange || "Adult",
    type: g.type || "Casual",
    subcategory: g.subcategory && g.subcategory !== g.style ? g.subcategory : "",
    washCare: g.washCare || [],
    productType: g.productType || "single",
    comboName: g.comboName || "",
    sizeChartUrl: g.sizeChart || "",
    shipping: {
      weight: sh.weight ?? "",
      dimensions: { length: sh.dimensions?.length ?? "", width: sh.dimensions?.width ?? "", height: sh.dimensions?.height ?? "" },
      originAddress: {
        street1: sh.originAddress?.street1 ?? "",
        city: sh.originAddress?.city ?? "",
        state: sh.originAddress?.state ?? "",
        zip: sh.originAddress?.zip ?? "",
        country: sh.originAddress?.country ?? "",
      },
    },
  };
};

const priceOf = (f, c) => (f.samePrice ? { price: f.price, oldPrice: f.oldPrice } : { price: c.price, oldPrice: c.oldPrice });
const discountPct = (price, oldPrice) => {
  const p = Number(price);
  const o = Number(oldPrice);
  return p > 0 && o > p ? Math.round(((o - p) / o) * 100) : 0;
};

// Problems per step (index 0..4) — shown in the step and on Review.
function problems(f) {
  const out = [[], [], [], [], []];
  if (!f.name.trim()) out[0].push("Give the product a name.");
  if (!f.style) out[0].push("Choose where it appears in the shop.");
  if (!f.description.trim()) out[0].push("Add a short description.");
  if (!f.fabric.trim()) out[0].push("Add the fabric.");
  if (!f.colours.length) out[1].push("Add at least one colour.");
  const names = new Set();
  f.colours.forEach((c, i) => {
    const label = c.color.trim() || `Colour ${i + 1}`;
    if (!c.color.trim()) out[1].push(`Colour ${i + 1} needs a name.`);
    else if (names.has(c.color.trim().toLowerCase())) out[1].push(`“${c.color}” is listed twice.`);
    names.add(c.color.trim().toLowerCase());
    if (!c.images.length) out[1].push(`${label}: add at least one photo.`);
    const { price, oldPrice } = priceOf(f, c);
    if (!f.samePrice && !(Number(price) >= 1)) out[2].push(`${label}: enter the selling price.`);
    if (oldPrice && Number(oldPrice) < Number(price)) out[2].push(`${f.samePrice ? "" : `${label}: `}MRP can't be lower than the selling price.`);
  });
  if (f.samePrice && !(Number(f.price) >= 1)) out[2].push("Enter the selling price.");
  if (!f.sizes.length) out[2].push("Choose at least one size.");
  if (f.productType === "combo" && !f.comboName.trim()) out[3].push("Give the combo a name (e.g. Pack of 3).");
  return out;
}

export default function ProductWizard() {
  const { groupId } = useParams();
  const editing = !!groupId;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get("step")) || 1, 1), STEPS.length);
  const goStep = (n) => {
    setParams({ step: String(n) }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(null); // upload % or null
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tried, setTried] = useState(false); // show problems after a publish attempt

  useEffect(() => {
    let alive = true;
    productAdminService
      .options()
      .then((o) => alive && setCategories(o.categories))
      .catch(() => alive && setCategories([]));
    if (editing) {
      productAdminService
        .getGroup(groupId)
        .then((g) => alive && setForm(fromGroup(g)))
        .catch((err) => alive && setLoadError(err.response?.data?.message || "Couldn't load this product."))
        .finally(() => alive && setLoading(false));
    }
    return () => {
      alive = false;
    };
  }, [editing, groupId]);

  // leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // free photo previews when leaving the page
  const previews = useRef(new Set());
  useEffect(() => {
    const set = previews.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const trackPreview = useCallback((url) => previews.current.add(url), []);

  const set = (patch) => {
    setDirty(true);
    setForm((f) => ({ ...f, ...(typeof patch === "function" ? patch(f) : patch) }));
  };
  const setColour = (key, patch) => set((f) => ({ colours: f.colours.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  const issues = useMemo(() => problems(form), [form]);
  const allIssues = issues.flat();
  const stepDone = issues.map((list, i) => list.length === 0 && (i !== 1 || form.colours.length > 0));

  const save = async (hidden) => {
    setTried(true);
    if (allIssues.length) {
      goStep(issues.findIndex((l) => l.length) + 1);
      return;
    }
    setSaveError("");
    setSaving(0);
    const fd = new FormData();
    let n = 0;
    const colours = form.colours.map((c) => {
      const { price, oldPrice } = priceOf(form, c);
      return {
        _id: c._id,
        color: c.color.trim(),
        images: c.images.map((img) => {
          if (img.url) return img.url;
          fd.append("images", img.file);
          return { file: n++ };
        }),
        sizes: form.sizes,
        stockBySize: Object.fromEntries(form.sizes.map((s) => [s, Number(c.stockBySize[s] || 0)])),
        price: Number(price),
        oldPrice: oldPrice === "" ? null : Number(oldPrice),
      };
    });
    const data = {
      name: form.name,
      description: form.description,
      style: form.style,
      fabric: form.fabric,
      gender: form.gender,
      featured: form.featured,
      hidden,
      sku: form.sku,
      hsnCode: form.hsnCode,
      ageRange: form.ageRange,
      type: form.type,
      subcategory: form.subcategory,
      washCare: form.washCare,
      productType: form.productType,
      comboName: form.comboName,
      shipping: form.shipping,
      colours,
    };
    fd.append("data", JSON.stringify(data));
    if (form.sizeChartFile) fd.append("sizeChart", form.sizeChartFile);
    const onUploadProgress = (e) => e.total && setSaving(Math.round((e.loaded / e.total) * 100));
    try {
      const res = editing
        ? await productAdminService.saveGroup(groupId, fd, onUploadProgress)
        : await productAdminService.createGroup(fd, onUploadProgress);
      setDirty(false);
      navigate(`/admin/products?saved=${res.groupId}&state=${hidden ? "hidden" : "live"}`);
    } catch (err) {
      setSaveError(err.response?.data?.message || "Couldn't save the product. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  if (loadError) {
    return (
      <div style={AW.page}>
        <p style={{ color: "#A3341F" }}>{loadError}</p>
        <Link to="/admin/products" className="aw-link">← Back to all products</Link>
      </div>
    );
  }
  if (loading) return <div style={{ ...AW.page, color: "#6B6559" }}>Loading…</div>;

  const stepProps = { form, set, setColour, issues: tried ? issues : issues.map(() => []), categories, trackPreview };

  return (
    <div style={AW.page}>
      <style>{AW.css + RM_CSS}</style>
      <Link to="/admin/products" className="aw-link">← All products</Link>
      <h1 style={{ ...AW.h1, marginTop: 10 }}>{editing ? `Edit: ${form.name || "product"}` : "Add a ready-made product"}</h1>
      <p style={AW.lead}>
        {editing
          ? "Change anything, then save on the last step. Customers see the changes straight away."
          : "Five short steps. Nothing is saved until the last step, so you can go back and forth."}
      </p>

      <div className="aw-wiz">
        <nav className="aw-steps" aria-label="Steps">
          {STEPS.map((t, i) => (
            <button key={t} type="button" className={`aw-step${step === i + 1 ? " on" : ""}`} onClick={() => goStep(i + 1)} aria-current={step === i + 1 ? "step" : undefined}>
              <span className={`aw-mark${stepDone[i] && i < 4 ? " done" : ""}`}>{stepDone[i] && i < 4 ? "✓" : i + 1}</span>
              <span>
                {t}
                {i === 3 && <span className="aw-sub" style={{ display: "block", fontSize: 11, color: "#8A8172", fontWeight: 600 }}>optional</span>}
              </span>
            </button>
          ))}
        </nav>

        <section className="aw-card" style={{ padding: "22px 24px", minWidth: 0 }}>
          {step === 1 && <BasicsStep {...stepProps} />}
          {step === 2 && <ColoursStep {...stepProps} />}
          {step === 3 && <StockStep {...stepProps} />}
          {step === 4 && <MoreStep {...stepProps} />}
          {step === 5 && (
            <ReviewStep
              {...stepProps}
              editing={editing}
              allIssues={allIssues}
              issuesByStep={issues}
              goStep={goStep}
              saving={saving}
              saveError={saveError}
              onSave={save}
            />
          )}
          {step < 5 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              <button type="button" className="aw-btn light" onClick={() => goStep(step - 1)} disabled={step === 1}>
                ← Back
              </button>
              <button type="button" className="aw-btn dark" onClick={() => goStep(step + 1)}>
                {step === 4 ? "Review →" : "Next →"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Problems({ list }) {
  if (!list?.length) return null;
  return (
    <ul className="rm-problems" role="alert">
      {list.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

/* ---------------- 1. Basics ---------------- */
function BasicsStep({ form, set, issues, categories }) {
  const active = categories.filter((c) => c.styles.length);
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={AW.h2}>1. Basics</h2>
      <Problems list={issues[0]} />
      <label>
        <span className="aw-lbl">Product name</span>
        <input className="aw-inp" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Classic Crew Tee" />
      </label>
      <label>
        <span className="aw-lbl">Where it appears in the shop</span>
        <select className="aw-inp" value={form.style} onChange={(e) => set({ style: e.target.value })}>
          <option value="">Choose a category and style…</option>
          {active.map((c) => (
            <optgroup key={c.name} label={`${c.name}${c.isActive ? "" : " (category hidden)"}`}>
              {c.styles.map((s) => (
                <option key={s} value={s}>
                  {c.name} → {s}
                </option>
              ))}
            </optgroup>
          ))}
          {form.style && !active.some((c) => c.styles.includes(form.style)) && <option value={form.style}>{form.style} (not in any category)</option>}
        </select>
        <p className="aw-help">
          The product is listed under this category on the Ready-made page.{" "}
          {active.length === 0 ? "No categories with styles yet — " : "Missing one? "}
          <Link to="/admin/categories">add it in Storefront → Categories</Link>.
        </p>
      </label>
      <label>
        <span className="aw-lbl">Description</span>
        <textarea className="aw-inp" rows={4} maxLength={3000} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What makes it special — fit, feel, print, occasion." />
      </label>
      <div className="aw-two">
        <label>
          <span className="aw-lbl">Fabric</span>
          <input className="aw-inp" list="rm-fabrics" value={form.fabric} maxLength={80} onChange={(e) => set({ fabric: e.target.value })} placeholder="e.g. 240 GSM Cotton" />
          <datalist id="rm-fabrics">
            {FABRICS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <div>
          <span className="aw-lbl">For</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {GENDERS.map((g) => (
              <button key={g} type="button" className={`aw-chip${form.gender === g ? " on" : ""}`} onClick={() => set({ gender: g })} aria-pressed={form.gender === g}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="rm-check">
        <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} />
        <span>
          <b>Feature it</b> — show it in the featured products on the home page
        </span>
      </label>
    </div>
  );
}

/* ---------------- 2. Colours & photos ---------------- */
function ColoursStep({ form, set, setColour, issues, trackPreview }) {
  const [custom, setCustom] = useState("");
  const has = (name) => form.colours.some((c) => c.color.trim().toLowerCase() === name.toLowerCase());
  const add = (name) => {
    const n = name.trim();
    if (!n || has(n)) return;
    set((f) => ({ colours: [...f.colours, emptyColour(n)] }));
  };
  const remove = (key) => set((f) => ({ colours: f.colours.filter((c) => c.key !== key) }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={AW.h2}>2. Colours &amp; photos</h2>
      <p className="aw-help" style={{ margin: 0 }}>
        Add each colour you sell, with 1–{MAX_PHOTOS} photos. The first photo is the one shown in the shop. Square or 4:5
        photos look best.
      </p>
      <Problems list={issues[1]} />
      <div>
        <span className="aw-lbl">Add a colour</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SHEET_COLOURS.map((c) => (
            <button key={c.slug} type="button" className="aw-chip rm-colourchip" disabled={has(c.name)} onClick={() => add(c.name)}>
              <span className="aw-dot" style={{ background: c.hex, width: 16, height: 16 }} /> {c.name}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(custom);
            setCustom("");
          }}
          style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 420 }}
        >
          <input className="aw-inp" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} placeholder="Another colour, e.g. Olive" aria-label="Another colour name" />
          <button type="submit" className="aw-btn light" disabled={!custom.trim() || has(custom)}>
            Add
          </button>
        </form>
      </div>

      {form.colours.map((c, i) => (
        <ColourCard key={c.key} colour={c} index={i} onChange={(patch) => setColour(c.key, patch)} onRemove={() => remove(c.key)} trackPreview={trackPreview} />
      ))}
      {!form.colours.length && <p className="rm-empty">No colours yet — pick one above.</p>}
    </div>
  );
}

function ColourCard({ colour, index, onChange, onRemove, trackPreview }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);

  const addFiles = (list) => {
    const files = [...list].filter((f) => /^image\/(jpe?g|png|webp|avif)$/.test(f.type));
    const room = MAX_PHOTOS - colour.images.length;
    const skipped = list.length - files.length;
    const big = files.filter((f) => f.size > 10 * 1024 * 1024);
    const ok = files.filter((f) => f.size <= 10 * 1024 * 1024).slice(0, Math.max(0, room));
    const msgs = [];
    if (skipped) msgs.push(`${skipped} file${skipped === 1 ? " isn't" : "s aren't"} a JPG, PNG or WebP photo`);
    if (big.length) msgs.push(`${big.length} photo${big.length === 1 ? " is" : "s are"} over 10 MB`);
    if (files.length - big.length > room) msgs.push(`only ${MAX_PHOTOS} photos per colour`);
    setNote(msgs.length ? `Skipped: ${msgs.join("; ")}.` : "");
    if (!ok.length) return;
    const added = ok.map((file) => {
      const preview = URL.createObjectURL(file);
      trackPreview(preview);
      return { file, preview };
    });
    onChange({ images: [...colour.images, ...added] });
  };
  const move = (i, d) => {
    const imgs = [...colour.images];
    [imgs[i], imgs[i + d]] = [imgs[i + d], imgs[i]];
    onChange({ images: imgs });
  };
  const drop = (i) => onChange({ images: colour.images.filter((_, j) => j !== i) });

  return (
    <article className="aw-card" style={{ padding: 16, borderColor: "#E7DFCC" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="aw-dot" style={{ background: colourHex(colour.color) }} />
        <input className="aw-inp" style={{ maxWidth: 260 }} value={colour.color} maxLength={40} onChange={(e) => onChange({ color: e.target.value })} aria-label={`Colour ${index + 1} name`} />
        <span style={{ fontSize: 12.5, color: "#6B6355" }}>
          {colour.images.length}/{MAX_PHOTOS} photos
        </span>
        <span style={{ marginLeft: "auto" }}>
          {confirm ? (
            <span className="rm-confirm">
              {colour.ordered ? "It was ordered before, so it will be hidden, not deleted." : "Remove this colour?"}{" "}
              <button type="button" className="aw-btn light" onClick={onRemove}>Remove</button>{" "}
              <button type="button" className="aw-btn light" onClick={() => setConfirm(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="rm-textbtn danger" onClick={() => setConfirm(true)}>
              Remove colour
            </button>
          )}
        </span>
      </div>

      <div
        className={`rm-photos${drag ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {colour.images.map((img, i) => (
          <figure key={img.url || img.preview} className="rm-photo">
            <img src={img.url ? imageUrl(img.url, 300) : img.preview} alt={`${colour.color || "Colour"} photo ${i + 1}`} />
            {i === 0 && <span className="rm-main">Main photo</span>}
            <figcaption>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move photo left">←</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === colour.images.length - 1} aria-label="Move photo right">→</button>
              <button type="button" onClick={() => drop(i)} aria-label="Remove photo" className="x">×</button>
            </figcaption>
          </figure>
        ))}
        {colour.images.length < MAX_PHOTOS && (
          <button type="button" className="rm-addphoto" onClick={() => input.current?.click()}>
            <b>+ Add photos</b>
            <span>or drop them here</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {note && <p className="aw-help" style={{ color: "#8A4B12" }}>{note}</p>}
    </article>
  );
}

/* ---------------- 3. Sizes, price & stock ---------------- */
function StockStep({ form, set, setColour, issues }) {
  const [fill, setFill] = useState("");
  const sizeList = [...ALL_SIZES, ...EXTRA_SIZES, ...form.sizes.filter((s) => !ALL_SIZES.includes(s) && !EXTRA_SIZES.includes(s))];
  const toggle = (s) =>
    set((f) => ({
      sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : sizeList.filter((x) => f.sizes.includes(x) || x === s),
    }));
  const pct = discountPct(form.price, form.oldPrice);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <h2 style={AW.h2}>3. Sizes, price &amp; stock</h2>
      <Problems list={issues[2]} />

      <div>
        <span className="aw-lbl">Sizes you sell</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sizeList.map((s) => (
            <button key={s} type="button" className={`aw-chip${form.sizes.includes(s) ? " on" : ""}`} onClick={() => toggle(s)} aria-pressed={form.sizes.includes(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="aw-lbl">Price</span>
        <label className="rm-check" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={form.samePrice}
            onChange={(e) => {
              const same = e.target.checked;
              // switching to per-colour prices starts every colour at the shared price
              set((f) => ({
                samePrice: same,
                colours: same ? f.colours : f.colours.map((c) => ({ ...c, price: c.price || f.price, oldPrice: c.oldPrice || f.oldPrice })),
              }));
            }}
          />
          <span>Same price for every colour</span>
        </label>
        {form.samePrice && (
          <div className="rm-prices">
            <PriceInput label="Selling price" value={form.price} onChange={(v) => set({ price: v })} />
            <PriceInput label="MRP (optional)" value={form.oldPrice} onChange={(v) => set({ oldPrice: v })} help="Shown crossed out, with the discount." />
            <div className="rm-preview" aria-live="polite">
              {Number(form.price) > 0 ? (
                <>
                  <b>₹{Number(form.price).toLocaleString("en-IN")}</b>
                  {pct > 0 && (
                    <>
                      {" "}
                      <s>₹{Number(form.oldPrice).toLocaleString("en-IN")}</s> <span className="rm-off">{pct}% off</span>
                    </>
                  )}
                  <span className="aw-help" style={{ display: "block", margin: 0 }}>How customers see it</span>
                </>
              ) : (
                <span className="aw-help" style={{ margin: 0 }}>Enter a price to see how it shows.</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <span className="aw-lbl">Stock — how many you have of each</span>
        {!form.sizes.length || !form.colours.length ? (
          <p className="rm-empty">Choose sizes above{form.colours.length ? "" : " and add colours in step 2"} to fill in stock.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <input className="aw-inp small" type="number" min="0" value={fill} onChange={(e) => setFill(e.target.value)} aria-label="Fill every size with" placeholder="0" />
              <button
                type="button"
                className="aw-btn light"
                disabled={fill === ""}
                onClick={() =>
                  set((f) => ({
                    colours: f.colours.map((c) => ({ ...c, stockBySize: Object.fromEntries(f.sizes.map((s) => [s, Math.max(0, Number(fill) || 0)])) })),
                  }))
                }
              >
                Fill every box
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="aw-table rm-stock">
                <thead>
                  <tr>
                    <th>Colour</th>
                    {form.sizes.map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                    <th>Total</th>
                    {!form.samePrice && <th>Selling ₹</th>}
                    {!form.samePrice && <th>MRP ₹</th>}
                  </tr>
                </thead>
                <tbody>
                  {form.colours.map((c) => (
                    <tr key={c.key}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="aw-dot" style={{ background: colourHex(c.color), width: 14, height: 14, display: "inline-block", verticalAlign: "middle" }} /> {c.color || "—"}
                      </td>
                      {form.sizes.map((s) => (
                        <td key={s}>
                          <input
                            className="aw-inp small"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={c.stockBySize[s] ?? ""}
                            placeholder="0"
                            aria-label={`${c.color} size ${s} stock`}
                            onChange={(e) => setColour(c.key, { stockBySize: { ...c.stockBySize, [s]: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) } })}
                          />
                        </td>
                      ))}
                      <td style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{form.sizes.reduce((n, s) => n + (Number(c.stockBySize[s]) || 0), 0)}</td>
                      {!form.samePrice && (
                        <td>
                          <input className="aw-inp small" type="number" min="1" value={c.price} onChange={(e) => setColour(c.key, { price: e.target.value })} aria-label={`${c.color} selling price`} style={{ width: 90 }} />
                        </td>
                      )}
                      {!form.samePrice && (
                        <td>
                          <input className="aw-inp small" type="number" min="0" value={c.oldPrice} onChange={(e) => setColour(c.key, { oldPrice: e.target.value })} aria-label={`${c.color} MRP`} style={{ width: 90 }} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="aw-help">A size with 0 shows as “Out of stock” to customers.</p>
          </>
        )}
      </div>
    </div>
  );
}

function PriceInput({ label, value, onChange, help }) {
  return (
    <label>
      <span className="aw-lbl">{label}</span>
      <span className="rm-money">
        <span aria-hidden="true">₹</span>
        <input className="aw-inp" type="number" min="0" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
      </span>
      {help && <span className="aw-help" style={{ display: "block" }}>{help}</span>}
    </label>
  );
}

/* ---------------- 4. More details ---------------- */
function MoreStep({ form, set, issues }) {
  const sh = form.shipping;
  const setSh = (patch) => set((f) => ({ shipping: { ...f.shipping, ...patch } }));
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={AW.h2}>4. More details <span style={{ fontSize: 13, color: "#8A8172", fontWeight: 700 }}>(optional)</span></h2>
      <p className="aw-help" style={{ margin: 0 }}>Everything here has a sensible default — skip it if you're not sure.</p>
      <Problems list={issues[3]} />
      <div className="aw-two">
        <label>
          <span className="aw-lbl">Product code (SKU)</span>
          <input className="aw-inp" value={form.sku} maxLength={20} onChange={(e) => set({ sku: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Made for you if empty" />
          <span className="aw-help" style={{ display: "block" }}>Letters and numbers. Each colour gets its own code from it.</span>
        </label>
        <label>
          <span className="aw-lbl">HSN code (for GST invoices)</span>
          <input className="aw-inp" value={form.hsnCode} maxLength={12} onChange={(e) => set({ hsnCode: e.target.value })} />
          <span className="aw-help" style={{ display: "block" }}>6109 = T-shirts, knitted.</span>
        </label>
        <Select label="Age group" value={form.ageRange} options={AGE_RANGES} onChange={(v) => set({ ageRange: v })} />
        <Select label="Occasion" value={form.type} options={TYPES} onChange={(v) => set({ type: v })} />
        <label>
          <span className="aw-lbl">Sub-category</span>
          <input className="aw-inp" value={form.subcategory} maxLength={60} onChange={(e) => set({ subcategory: e.target.value })} placeholder={form.style || "Same as the style"} />
        </label>
        <div>
          <span className="aw-lbl">Sold as</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={`aw-chip${form.productType === "single" ? " on" : ""}`} onClick={() => set({ productType: "single" })}>One piece</button>
            <button type="button" className={`aw-chip${form.productType === "combo" ? " on" : ""}`} onClick={() => set({ productType: "combo" })}>A combo pack</button>
          </div>
          {form.productType === "combo" && (
            <input className="aw-inp" style={{ marginTop: 8 }} value={form.comboName} maxLength={80} onChange={(e) => set({ comboName: e.target.value })} placeholder="e.g. Pack of 3 tees" aria-label="Combo name" />
          )}
        </div>
      </div>

      <div>
        <span className="aw-lbl">Washing care</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WASH.map((w) => (
            <button
              key={w}
              type="button"
              className={`aw-chip${form.washCare.includes(w) ? " on" : ""}`}
              aria-pressed={form.washCare.includes(w)}
              onClick={() => set((f) => ({ washCare: f.washCare.includes(w) ? f.washCare.filter((x) => x !== w) : [...f.washCare, w] }))}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <label>
        <span className="aw-lbl">Size chart (PDF or picture)</span>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => set({ sizeChartFile: e.target.files?.[0] || null })} />
        <span className="aw-help" style={{ display: "block" }}>
          {form.sizeChartFile ? `New: ${form.sizeChartFile.name}` : form.sizeChartUrl ? (
            <>
              Current: <a href={form.sizeChartUrl} target="_blank" rel="noreferrer">open</a> — choose a file to replace it.
            </>
          ) : "Shown on the product page."}
        </span>
      </label>

      <details className="rm-details">
        <summary>Parcel size &amp; pickup address (only for courier booking)</summary>
        <div className="aw-two" style={{ marginTop: 12 }}>
          <NumberField label="Weight (kg)" value={sh.weight} onChange={(v) => setSh({ weight: v })} />
          <NumberField label="Length (cm)" value={sh.dimensions.length} onChange={(v) => setSh({ dimensions: { ...sh.dimensions, length: v } })} />
          <NumberField label="Width (cm)" value={sh.dimensions.width} onChange={(v) => setSh({ dimensions: { ...sh.dimensions, width: v } })} />
          <NumberField label="Height (cm)" value={sh.dimensions.height} onChange={(v) => setSh({ dimensions: { ...sh.dimensions, height: v } })} />
          {["street1", "city", "state", "zip", "country"].map((k) => (
            <label key={k}>
              <span className="aw-lbl">{{ street1: "Street", city: "City", state: "State", zip: "PIN code", country: "Country" }[k]}</span>
              <input className="aw-inp" value={sh.originAddress[k]} onChange={(e) => setSh({ originAddress: { ...sh.originAddress, [k]: e.target.value } })} />
            </label>
          ))}
        </div>
        <p className="aw-help">Customer delivery charges come from Admin → Shipping rates, not from these.</p>
      </details>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label>
      <span className="aw-lbl">{label}</span>
      <select className="aw-inp" value={value} onChange={(e) => onChange(e.target.value)}>
        {[...new Set([value, ...options])].filter(Boolean).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function NumberField({ label, value, onChange }) {
  return (
    <label>
      <span className="aw-lbl">{label}</span>
      <input className="aw-inp" type="number" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* ---------------- 5. Review & publish ---------------- */
function ReviewStep({ form, editing, allIssues, issuesByStep, goStep, saving, saveError, onSave, categories }) {
  const [shown, setShown] = useState(0);
  const c = form.colours[shown] || form.colours[0];
  const { price, oldPrice } = c ? priceOf(form, c) : { price: form.price, oldPrice: form.oldPrice };
  const pct = discountPct(price, oldPrice);
  const cat = categories.find((x) => x.styles.includes(form.style))?.name;
  const first = c?.images[0];
  const totalStock = form.colours.reduce((n, col) => n + form.sizes.reduce((m, s) => m + (Number(col.stockBySize[s]) || 0), 0), 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={AW.h2}>5. Review &amp; publish</h2>
      {allIssues.length > 0 && (
        <div className="rm-problems" role="alert">
          <b>A few things are missing:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {issuesByStep.flatMap((list, i) =>
              list.map((p) => (
                <li key={`${i}-${p}`}>
                  {p}{" "}
                  <button type="button" className="rm-textbtn" onClick={() => goStep(i + 1)}>
                    Fix in step {i + 1}
                  </button>
                </li>
              )),
            )}
          </ul>
        </div>
      )}

      <div className="rm-review">
        <div className="rm-shopcard" aria-label="How it looks in the shop">
          <div className="rm-shopimg">{first ? <img src={first.url ? imageUrl(first.url, 500) : first.preview} alt="" /> : <span>No photo yet</span>}</div>
          <div style={{ padding: "10px 4px" }}>
            <div style={{ fontWeight: 700 }}>{form.name || "Product name"}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              <b>₹{Number(price || 0).toLocaleString("en-IN")}</b>
              {pct > 0 && (
                <>
                  {" "}
                  <s style={{ color: "#8A8172" }}>₹{Number(oldPrice).toLocaleString("en-IN")}</s> <span className="rm-off">{pct}% off</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {form.colours.map((col, i) => (
                <button key={col.key} type="button" title={col.color} aria-label={`Show ${col.color}`} onClick={() => setShown(i)} className={`rm-swatch${i === shown ? " on" : ""}`} style={{ background: colourHex(col.color) }} />
              ))}
            </div>
          </div>
          <p className="aw-help" style={{ textAlign: "center" }}>How it looks in the shop</p>
        </div>

        <dl className="rm-facts">
          <dt>Shop place</dt>
          <dd>{form.style ? `${cat || "No category"} → ${form.style}` : "—"}</dd>
          <dt>Fabric</dt>
          <dd>{form.fabric || "—"}</dd>
          <dt>For</dt>
          <dd>{form.gender}</dd>
          <dt>Colours</dt>
          <dd>{form.colours.map((x) => `${x.color} (${x.images.length} photo${x.images.length === 1 ? "" : "s"})`).join(", ") || "—"}</dd>
          <dt>Sizes</dt>
          <dd>{form.sizes.join(", ") || "—"}</dd>
          <dt>Stock</dt>
          <dd>{totalStock} pieces in all</dd>
          <dt>Price</dt>
          <dd>{form.samePrice ? `₹${form.price || 0}${pct ? ` (MRP ₹${form.oldPrice}, ${pct}% off)` : ""}` : "Different per colour"}</dd>
          {form.featured && (
            <>
              <dt>Home page</dt>
              <dd>Featured</dd>
            </>
          )}
        </dl>
      </div>

      {saveError && <p className="rm-problems" role="alert">{saveError}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
        {saving !== null && <span className="aw-help" style={{ margin: 0 }} aria-live="polite">{saving < 100 ? `Uploading photos… ${saving}%` : "Saving…"}</span>}
        <button type="button" className="aw-btn light" disabled={saving !== null} onClick={() => onSave(true)}>
          {editing ? (form.hidden ? "Save (keep hidden)" : "Save and hide from shop") : "Save as hidden (draft)"}
        </button>
        <button type="button" className="aw-btn gold" disabled={saving !== null} onClick={() => onSave(false)}>
          {editing ? (form.hidden ? "Save and show in shop" : "Save changes") : "Publish to the shop"}
        </button>
      </div>
    </div>
  );
}
