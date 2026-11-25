// Admin → Shop your IDENTEE → Styles (25 Nov 2026)
//
// The owner: "every time when we add new style we want to develop it. We should make it different but not complex".
// One card per garment: used for shop tees or not, the name the shop shows, who it is for, its place among the styles,
// its category, the colours on sale and the sides the tee page shows (server/utils/shopStyles.js). A new style (a Polo)
// is set up in Create your IDENTEE as before, then switched on here — no code.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import studioService from "../../../services/studioService";
import "../shopManage.css";
import "./shopEasy.css";

const apiError = (err) => err?.response?.data?.message || err?.message || "That didn't work. Please try again.";
const FIELDS = ["on", "style", "wearer", "order", "category", "colours", "sides", "fitText"];
const pick = (s) => Object.fromEntries(FIELDS.map((k) => [k, k === "colours" ? [...(s[k] || [])] : s[k]]));
const same = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));
// a card starts again from what is saved after each save (its key changes with the saved settings)
const cardKey = (s) => `${s.key}:${JSON.stringify(pick(s))}`;

export default function ShopStylesPage() {
  const [data, setData] = useState(null); // { styles, categories }
  const [error, setError] = useState("");
  const [showOff, setShowOff] = useState(false);

  useEffect(() => {
    studioService
      .shopStyles()
      .then(setData)
      .catch((err) => setError(apiError(err)));
  }, []);

  if (error && !data) return <p className="sm-error">{error}</p>;
  if (!data) return <p className="sm-note">Loading the styles…</p>;
  const on = data.styles.filter((s) => s.on);
  const off = data.styles.filter((s) => !s.on);
  const saved = (row) => setData((d) => ({ ...d, styles: d.styles.map((s) => (s.key === row.key ? row : s)) }));

  return (
    <div className="sm-page">
      <header className="sm-head">
        <p className="sm-kicker">Shop your IDENTEE</p>
        <h1>Styles</h1>
        <p className="sm-lead">
          The kinds of tee the shop sells — Oversized, Round Neck, and any new one. A style that is <b>on</b> gets its own tab in the shop, a
          choice on each tee&apos;s page, and a tick in <Link to="/admin/shop-add">Add a tee</Link>. Changes show on the website within a minute.
        </p>
      </header>

      <section className="sm-card se-how" aria-labelledby="se-how">
        <h2 id="se-how">Adding a new style (for example a Polo)</h2>
        <ol>
          <li>
            Set it up in <Link to="/admin/customizable">Create your IDENTEE</Link> as usual: the White garment&apos;s <b>front</b> and <b>back</b> photo on a
            hanger, its colours, sizes, size chart, print areas and price. Make it live there.
          </li>
          <li>Find it below, switch <b>Use for shop tees</b> on, check its name, colours and category, and press <b>Save</b>.</li>
          <li>
            Put tees on it: <Link to="/admin/shop-add">Add a tee</Link>, <Link to="/admin/shop-add-many">Add many tees</Link>, or <b>+ Add to a style</b> on a
            tee in <Link to="/admin/shop-manage">Manage the shop</Link>.
          </li>
        </ol>
      </section>

      <div className="se-styles">
        {on.map((s) => (
          <StyleCard key={cardKey(s)} style={s} categories={data.categories} onSaved={saved} />
        ))}
      </div>

      <section className="sm-card">
        <div className="sm-row">
          <div>
            <h2>Not used for shop tees ({off.length})</h2>
            <p className="sm-note">Every other garment from Create your IDENTEE. Open one to switch it on.</p>
          </div>
          <span className="sm-gap" />
          <button type="button" className="sm-btn" onClick={() => setShowOff((v) => !v)} aria-expanded={showOff}>
            {showOff ? "Hide them" : "Show them"}
          </button>
        </div>
        {showOff && (
          <div className="se-styles se-styles-off">
            {off.map((s) => (
              <StyleCard key={cardKey(s)} style={s} categories={data.categories} onSaved={saved} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StyleCard({ style, categories, onSaved }) {
  const [form, setForm] = useState(() => pick(style));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const changed = !same(form, style);
  const id = `se-${style.key}`;
  const toggleColour = (slug) => set("colours", form.colours.includes(slug) ? form.colours.filter((c) => c !== slug) : [...form.colours, slug]);

  // what still stops this style from working well in the shop
  const problems = [];
  if (!style.active) problems.push("It is a draft in Create your IDENTEE — make it live there first.");
  if (!style.hasFront || !style.hasBack) problems.push("It needs a front and a back print area (Create your IDENTEE → its print areas).");
  if (!style.photo.front || !style.photo.back) problems.push("No White hanger photo for the " + [!style.photo.front && "front", !style.photo.back && "back"].filter(Boolean).join(" and ") + " — the shop pictures will use the 3D tee instead.");

  const save = async () => {
    setSaving(true);
    try {
      const { style: row } = await studioService.saveShopStyle(style.key, { ...form, order: Number(form.order) });
      onSaved(row);
      toast.success(`${row.label}: saved.`);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`sm-card se-card${form.on ? " is-on" : ""}`} aria-labelledby={id}>
      <div className="se-card-top">
        <div>
          <h2 id={id}>{style.label}</h2>
          <p className="sm-note se-meta">
            {style.tees} tee{style.tees === 1 ? "" : "s"} in the shop · ₹{style.price}
            {style.oldPrice > style.price ? ` (was ₹${style.oldPrice})` : ""} · {style.sizes.length ? `${style.sizes[0]}–${style.sizes[style.sizes.length - 1]}` : "no sizes"}
            {!style.saved && " · built-in settings"}
          </p>
        </div>
        <label className="se-switch">
          <input type="checkbox" checked={form.on} onChange={(e) => set("on", e.target.checked)} disabled={!style.active && !form.on} />
          <span>Use for shop tees</span>
        </label>
      </div>

      {problems.length > 0 && (
        <ul className="se-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="se-grid">
        <label className="sm-field">
          Name in the shop
          <input value={form.style} maxLength={40} onChange={(e) => set("style", e.target.value)} placeholder="Polo" />
        </label>
        <label className="sm-field">
          Who it&apos;s for
          <select value={form.wearer} onChange={(e) => set("wearer", e.target.value)}>
            <option value="Unisex">Unisex (men and women)</option>
            <option value="Men">Men</option>
            <option value="Women">Women</option>
          </select>
        </label>
        <label className="sm-field">
          Place among the styles
          <input type="number" min={1} max={99} value={form.order} onChange={(e) => set("order", e.target.value)} />
        </label>
        <label className="sm-field">
          Shop category
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {!categories.some((c) => c.slug === form.category) && <option value={form.category}>{form.category || "Choose…"}</option>}
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sm-field">
          The tee page shows
          <select value={form.sides} onChange={(e) => set("sides", e.target.value)}>
            <option value="front-back">Front and back only</option>
            <option value="all">Front, back and both sides</option>
          </select>
        </label>
        <label className="sm-field">
          Fit words (in the description)
          <input value={form.fitText} maxLength={60} onChange={(e) => set("fitText", e.target.value)} placeholder="Regular fit" />
        </label>
      </div>

      <fieldset className="se-colours">
        <legend>
          Colours sold in the shop <small>({form.colours.length} of {style.colourList.length} — tap to tick or untick)</small>
        </legend>
        <div className="se-swatches">
          {style.colourList.map((c) => {
            const ticked = form.colours.includes(c.slug);
            return (
              <button key={c.slug} type="button" className={`se-swatch${ticked ? " is-on" : ""}`} aria-pressed={ticked} onClick={() => toggleColour(c.slug)}>
                <i style={{ background: c.hex }} aria-hidden="true" />
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="sm-row se-save">
        <p className="sm-note">
          {form.on ? "Taking a colour off hides it on this style's tees in the shop (they keep it, and it comes back if you tick it again)." : "Off: no tab in the shop and no tick in Add a tee. Tees already made stay as they are — take them out in Manage the shop."}
        </p>
        <span className="sm-gap" />
        {changed && (
          <button type="button" className="sm-btn" onClick={() => setForm(pick(style))} disabled={saving}>
            Undo
          </button>
        )}
        <button type="button" className="sm-btn sm-btn-dark" onClick={save} disabled={saving || !changed}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
