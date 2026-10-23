// Admin → Storefront → Categories: the groups customers browse on the two shop pages.
// Simplified 23 Oct 2026 so every part says what it does: the list shows what customers see ("On website",
// "Coming soon", "Hidden", how many products), and a category is edited in four short parts —
// 1. Name, 2. What goes in it (ticked from the styles your products / garments really have), 3. Picture,
// 4. On the website? — with the rest under "More options".
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { THEME, labelStyle, inputStyle } from "../../theme/theme";
import categoryService from "../../services/categoryService";
import { invalidateCategories } from "../../redux/slices/categorySlice";
import { imageUrl } from "../../utils/imageUrl";

const EMPTY = {
  name: "",
  description: "",
  styles: [],
  isActive: true,
  isCustomizable: false,
  comingSoon: false,
  kind: "readymade",
};

// The two shops, one tab each. A category saved before the split has no kind ("not sorted yet") and is listed in
// both tabs until it is given one (Edit → Which page).
const TABS = [
  ["readymade", "Shop your IDENTEE", "Groups of finished products customers can buy as they are, like T-Shirts or Hoodies."],
  ["customizable", "Create your IDENTEE", "Groups of the garments customers design themselves in the design room, like Boys Wear or Girls Wear."],
];
const inTab = (c, tab) => !c.kind || c.kind === tab;

// what customers see: one of three
const STATUS = [
  ["on", "On website", "Customers see it and can open it."],
  ["soon", "Coming soon", "Customers see the tile, greyed out with “Coming soon”. It can't be opened yet."],
  ["hidden", "Hidden", "Not shown anywhere. Nothing is deleted. Choose “On website” to bring it back."],
];
const statusOf = (c) => (!c.isActive ? "hidden" : c.comingSoon ? "soon" : "on");
const STATUS_LOOK = {
  on: { background: "#E3F2E8", color: "#24522F", border: "#BFDFC9" },
  soon: { background: "#FBEED3", color: "#7A4E0E", border: "#F0D7A6" },
  hidden: { background: THEME.surface2, color: THEME.textMuted, border: THEME.border },
};

const card = {
  background: THEME.surface,
  border: `1px solid ${THEME.border}`,
  borderRadius: 12,
  boxShadow: THEME.shadow,
};

const button = (variant = "default") => ({
  padding: "8px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: THEME.fontBody,
  border:
    variant === "primary" ? "none" : `1px solid ${variant === "danger" ? THEME.dangerBorder : THEME.border}`,
  background:
    variant === "primary" ? `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})` : THEME.surface,
  color: variant === "danger" ? THEME.danger : THEME.text,
});

const apiError = (err) => err.response?.data?.message || err.message || "Something went wrong";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// what is in a category, in plain words
const contents = (c, tab) =>
  tab === "customizable"
    ? c.garmentCount
      ? `${plural(c.garmentCount, "garment")}: ${(c.garments || []).join(", ")}`
      : "No garments yet"
    : c.productCount
      ? `${plural(c.productCount, "product")} on the website`
      : "No products yet";

// one numbered part of the form: its title, what it is for, then the fields
function Part({ n, title, help, children }) {
  return (
    <section style={{ display: "grid", gap: 8, padding: "16px 0", borderTop: `1px solid ${THEME.border}` }}>
      <h4 style={{ margin: 0, fontSize: 15, fontFamily: THEME.fontBody }}>
        <span style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, marginRight: 8, borderRadius: "50%", background: THEME.ink, color: "#fff", fontSize: 12 }}>{n}</span>
        {title}
      </h4>
      {help && <p style={{ margin: 0, fontSize: 12.5, color: THEME.textMuted, lineHeight: 1.5 }}>{help}</p>}
      {children}
    </section>
  );
}

function ImagePicker({ label, hint, current, file, onFile, removed, onRemove, ratio }) {
  const preview = file ? URL.createObjectURL(file) : !removed && current ? imageUrl(current, 400) : "";
  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: label ? 6 : 0, flexWrap: "wrap" }}>
        <div
          style={{
            width: ratio === "wide" ? 160 : 80,
            aspectRatio: ratio === "wide" ? "16 / 5" : "4 / 5",
            borderRadius: 8,
            border: `1px dashed ${THEME.borderLight}`,
            background: THEME.surface2,
            overflow: "hidden",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            color: THEME.textFaint,
          }}
        >
          {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "No picture"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 5 * 1024 * 1024) {
                toast.error("The picture must be 5 MB or smaller");
                e.target.value = "";
                return;
              }
              onFile(f || null);
            }}
            style={{ fontSize: 12, maxWidth: "100%" }}
          />
          {(current || file) && !removed && (
            <button type="button" onClick={onRemove} style={{ ...button("danger"), padding: "4px 10px", fontSize: 12, alignSelf: "flex-start" }}>
              Remove picture
            </button>
          )}
          <span style={{ fontSize: 11, color: THEME.textMuted }}>{hint}</span>
        </div>
      </div>
    </div>
  );
}

// "2. What goes in it?": the styles that really exist, each with what has it — ticked ones fill the category
function StylePicker({ designOwn, styles, available, onChange }) {
  const [typed, setTyped] = useState("");
  const list = available || [];
  const has = (s) => styles.some((x) => x.toLowerCase() === s.toLowerCase());
  // ticked styles nothing has (typed before, or the product was removed) are still listed, so they can be unticked
  const orphans = styles.filter((s) => !list.some((a) => a.style.toLowerCase() === s.toLowerCase()));
  const toggle = (s) => onChange(has(s) ? styles.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...styles, s]);
  const addTyped = () => {
    const parts = typed.split(",").map((s) => s.trim()).filter((s) => s && !has(s));
    if (parts.length) onChange([...styles, ...parts]);
    setTyped("");
  };
  const chip = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontFamily: THEME.fontBody,
    border: `1px solid ${on ? THEME.gold : THEME.border}`, background: on ? THEME.goldBg : THEME.surface, color: THEME.text, fontWeight: on ? 700 : 500, textAlign: "left",
  });
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {available === null ? (
        <p style={{ margin: 0, fontSize: 12.5, color: THEME.textMuted }}>Loading your styles…</p>
      ) : !list.length && !orphans.length ? (
        <p style={{ margin: 0, fontSize: 12.5, color: THEME.textMuted }}>
          {designOwn ? "No designable garments yet. Add one in Create your IDENTEE first." : "No products have a Garment Style yet. Add products first, or type a style below."}
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {list.map((a) => (
            <button key={a.style} type="button" onClick={() => toggle(a.style)} aria-pressed={has(a.style)} style={chip(has(a.style))}>
              <span aria-hidden="true">{has(a.style) ? "☑" : "☐"}</span>
              <span>
                {a.style}{" "}
                <span style={{ color: THEME.textMuted, fontWeight: 500 }}>
                  {designOwn ? `(${a.garments.join(", ")})` : `(${plural(a.count, "product")})`}
                </span>
              </span>
            </button>
          ))}
          {orphans.map((s) => (
            <button key={s} type="button" onClick={() => toggle(s)} aria-pressed="true" style={{ ...chip(true), borderStyle: "dashed" }} title="Nothing has this style yet">
              <span aria-hidden="true">☑</span>
              <span>
                {s} <span style={{ color: THEME.danger, fontWeight: 500 }}>(nothing has this yet)</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: THEME.goldDeep, fontWeight: 600 }}>A style that isn't listed yet?</summary>
        <p style={{ margin: "6px 0", fontSize: 12, color: THEME.textMuted }}>
          Type it exactly as it will be written on the {designOwn ? "garment (Create your IDENTEE → step 1, “Shown in category”)" : "products (their “Garment Style”)"}. Upper or lower case doesn't matter.
        </p>
        <div style={{ display: "flex", gap: 8, maxWidth: 460, flexWrap: "wrap" }}>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTyped();
              }
            }}
            placeholder="e.g. Crop Top"
            aria-label="A style that isn't listed yet"
            style={{ ...inputStyle, flex: "1 1 180px", width: "auto", minWidth: 0 }}
          />
          <button type="button" onClick={addTyped} style={button()}>Add</button>
        </div>
      </details>
    </div>
  );
}

function CategoryForm({ initial, tab, available, onCancel, onSaved }) {
  // a new category goes in the open tab; an unsorted one starts on the open tab too (saved when the admin saves)
  const [form, setForm] = useState({ ...EMPTY, ...initial, kind: initial?.kind || tab, styles: initial?.styles || [] });
  const designOwn = form.kind === "customizable";
  const [status, setStatus] = useState(initial ? statusOf(initial) : "on");
  const [files, setFiles] = useState({ image: null, bannerImage: null });
  const [removed, setRemoved] = useState({ image: false, bannerImage: false });
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initial?._id);
  const tilePicture = files.image ? URL.createObjectURL(files.image) : !removed.image && initial?.image?.url ? imageUrl(initial.image.url, 300) : "";

  const save = async () => {
    if (form.name.trim().length < 2) {
      toast.error("Give the category a name (part 1)");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("description", form.description || "");
      fd.append("styles", JSON.stringify(form.styles));
      fd.append("isActive", status !== "hidden");
      fd.append("isCustomizable", designOwn ? false : form.isCustomizable);
      fd.append("comingSoon", status === "soon");
      fd.append("kind", form.kind);
      for (const field of ["image", "bannerImage"]) {
        if (files[field]) fd.append(field, files[field]);
        else if (removed[field]) fd.append(`remove_${field}`, "true");
      }
      if (isEdit) await categoryService.updateCategory(initial._id, fd);
      else await categoryService.createCategory(fd);
      toast.success(isEdit ? "Category saved" : "Category created");
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...card, padding: "20px 22px 22px", marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 6px", fontFamily: THEME.fontDisplay, fontSize: 22 }}>{isEdit ? `Edit “${initial.name}”` : "New category"}</h3>

      <div style={{ display: "grid", gap: 8, padding: "10px 0 16px" }}>
        <label style={labelStyle}>Which page is it on?</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setForm({ ...form, kind: key })} aria-pressed={form.kind === key} style={{ ...button(form.kind === key ? "primary" : "default"), padding: "7px 14px" }}>
              {label}
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: THEME.textMuted }}>
          {TABS.find(([key]) => key === form.kind)[2]}
          {isEdit && !initial.kind && " This category isn't sorted yet: pick one and save."}
        </p>
      </div>

      <Part n="1" title="Name" help="What customers read on the tile and at the top of the category's page.">
        <input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={designOwn ? "e.g. Girls Wear" : "e.g. T-Shirts"} aria-label="Category name" style={{ ...inputStyle, maxWidth: 420 }} />
        {isEdit && (
          <p style={{ margin: 0, fontSize: 11.5, color: THEME.textMuted }}>
            Its page on the website: {designOwn ? `/customizable?category=${initial.slug}` : `/category/${initial.slug}`}
          </p>
        )}
      </Part>

      <Part
        n="2"
        title="What goes in it?"
        help={
          designOwn
            ? "Tick the garment styles to show here. Every garment with a ticked style appears in this category, by itself. (A garment can also be added from its own set-up: Create your IDENTEE → the garment → step 1, “Also show in”.)"
            : "Tick the kinds of product to show here. Every product whose Garment Style is ticked appears in this category, by itself."
        }
      >
        <StylePicker designOwn={designOwn} styles={form.styles} available={available ? available[form.kind] || [] : null} onChange={(styles) => setForm((f) => ({ ...f, styles }))} />
      </Part>

      <Part n="3" title="Picture" help="The picture on the category's tile. Portrait (4:5), for example 800 × 1000 px. JPG, PNG or WebP, up to 5 MB.">
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <ImagePicker
            hint="Customers see it on the tile, as on the right."
            current={initial?.image?.url}
            file={files.image}
            onFile={(f) => { setFiles((x) => ({ ...x, image: f })); setRemoved((r) => ({ ...r, image: false })); }}
            removed={removed.image}
            onRemove={() => { setFiles((x) => ({ ...x, image: null })); setRemoved((r) => ({ ...r, image: true })); }}
          />
          {/* a small copy of the tile customers will see */}
          <div aria-label="How the tile looks" style={{ width: 120, flexShrink: 0 }}>
            <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 10, overflow: "hidden", background: THEME.surface2, border: `1px solid ${THEME.border}`, opacity: status === "hidden" ? 0.4 : 1 }}>
              {tilePicture && <img src={tilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: status === "soon" ? "grayscale(1)" : "none" }} />}
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 8px 8px", background: "linear-gradient(transparent, rgba(20,17,16,.75))", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                {form.name || "Name"}
                {status === "soon" && <span style={{ display: "block", fontSize: 10, fontWeight: 600, opacity: 0.85 }}>Coming soon</span>}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: THEME.textMuted, textAlign: "center" }}>{status === "hidden" ? "Hidden: not shown" : "The tile"}</p>
          </div>
        </div>
      </Part>

      <Part n="4" title="On the website?">
        <div role="radiogroup" aria-label="On the website?" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {STATUS.map(([key, label, help]) => {
            const on = status === key;
            const look = STATUS_LOOK[key];
            return (
              <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setStatus(key)}
                style={{ display: "grid", gap: 3, padding: "10px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: THEME.fontBody,
                  border: `${on ? 2 : 1}px solid ${on ? look.color : THEME.border}`, background: on ? look.background : THEME.surface }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: on ? look.color : THEME.text }}>{on ? "● " : "○ "}{label}</span>
                <span style={{ fontSize: 12, color: THEME.textMuted, lineHeight: 1.4 }}>{help}</span>
              </button>
            );
          })}
        </div>
        {status === "on" && !form.styles.length && (
          <p style={{ margin: 0, fontSize: 12.5, color: "#7A4E0E" }}>Nothing is ticked in part 2, so customers would open an empty page. Tick what goes in it, or choose “Coming soon”.</p>
        )}
      </Part>

      <details style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>More options <span style={{ fontWeight: 500, color: THEME.textMuted }}>(description, banner picture{designOwn ? "" : ", “Create your own” button"})</span></summary>
        <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
          <div>
            <label style={labelStyle}>Short description</label>
            <p style={{ margin: "2px 0 6px", fontSize: 12, color: THEME.textMuted }}>One line under the name on the category's page. Optional.</p>
            <input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Soft cotton tees for every day" style={{ ...inputStyle, maxWidth: 560 }} />
          </div>
          <ImagePicker
            label="Banner picture (top of the category's page)"
            hint="Wide (16:5), for example 1600 × 500 px. Optional: without it, the tile picture is used."
            ratio="wide"
            current={initial?.bannerImage?.url}
            file={files.bannerImage}
            onFile={(f) => { setFiles((x) => ({ ...x, bannerImage: f })); setRemoved((r) => ({ ...r, bannerImage: false })); }}
            removed={removed.bannerImage}
            onRemove={() => { setFiles((x) => ({ ...x, bannerImage: null })); setRemoved((r) => ({ ...r, bannerImage: true })); }}
          />
          {!designOwn && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={form.isCustomizable} onChange={(e) => setForm({ ...form, isCustomizable: e.target.checked })} style={{ marginTop: 3 }} />
              <span>
                <strong>“Create your own” button</strong>
                <br />
                <span style={{ color: THEME.textMuted, fontSize: 12 }}>Adds a button on this category's page that takes customers to the design room, to design their own.</span>
              </span>
            </label>
          )}
        </div>
      </details>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
        <button type="button" onClick={save} disabled={saving} style={{ ...button("primary"), opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create category"}
        </button>
      </div>
    </div>
  );
}

// Deleting, made hard to do by accident: refused while anything still uses the category (hide it instead), and the
// name must be typed. Products and garments are never deleted; the category's pictures are.
function DeletePanel({ c, onHide, onCancel, onDeleted }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inUse = (c.garmentCount || 0) + (c.productCount || 0) > 0;
  const match = typed.trim().toLowerCase() === c.name.trim().toLowerCase();
  const del = async () => {
    setBusy(true);
    try {
      await categoryService.deleteCategory(c._id, typed.trim());
      toast.success(`"${c.name}" deleted`);
      onDeleted();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ flexBasis: "100%", border: `1px solid ${THEME.dangerBorder}`, background: THEME.dangerBg || "#FDF1EF", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 10 }}>
      {inUse ? (
        <p style={{ margin: 0, fontSize: 13, color: THEME.text }}>
          <b>“{c.name}” can't be deleted while it's in use</b> —{" "}
          {[c.garmentCount ? `${c.garmentCount} designable garment${c.garmentCount === 1 ? "" : "s"} (${(c.garments || []).slice(0, 4).join(", ")})` : "", c.productCount ? `${c.productCount} ready-made product${c.productCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")}.
          Hide it to take it off the website without losing anything.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13, color: THEME.text }}>
            Deleting can't be undone, and it also deletes this category's pictures. To take it off the website for now, <b>hide</b> it instead.
            To delete, type <b>{c.name}</b>:
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.name} aria-label={`Type ${c.name} to delete it`} style={{ ...inputStyle, maxWidth: 320 }} />
        </>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {c.isActive && <button type="button" onClick={onHide} style={button("primary")}>Hide instead</button>}
        {!inUse && (
          <button type="button" onClick={del} disabled={!match || busy} style={{ ...button("danger"), opacity: match && !busy ? 1 : 0.45, cursor: match && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Deleting…" : "Delete for good"}
          </button>
        )}
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const dispatch = useDispatch();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(null); // the styles that really exist (for "What goes in it?")
  const [editing, setEditing] = useState(null); // null | "new" | category
  const [tab, setTab] = useState("readymade"); // which shop's categories are listed
  const [deleting, setDeleting] = useState(null); // the category whose delete panel is open

  const load = async () => {
    try {
      setCategories(await categoryService.adminGetCategories());
      setAvailable(await categoryService.adminGetStyles());
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    categoryService
      .adminGetCategories()
      .then((list) => !cancelled && setCategories(list))
      .catch((err) => toast.error(apiError(err)))
      .finally(() => !cancelled && setLoading(false));
    categoryService
      .adminGetStyles()
      .then((s) => !cancelled && setAvailable(s))
      .catch(() => !cancelled && setAvailable({ readymade: [], customizable: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setEditing(null);
    dispatch(invalidateCategories()); // storefront refetches
    await load();
  };

  // the categories of the open tab, in display order
  const listed = categories.filter((c) => inTab(c, tab));

  // move one up / down among its own tab's categories (the full order is saved)
  const move = async (index, delta) => {
    const a = listed[index];
    const b = listed[index + delta];
    if (!a || !b) return;
    const next = [...categories];
    const ia = next.indexOf(a);
    const ib = next.indexOf(b);
    [next[ia], next[ib]] = [next[ib], next[ia]];
    setCategories(next);
    try {
      await categoryService.reorderCategories(next.map((c) => c._id));
      dispatch(invalidateCategories());
    } catch (err) {
      toast.error(apiError(err));
      load();
    }
  };

  const hide = async (c) => {
    try {
      const fd = new FormData();
      fd.append("isActive", false);
      await categoryService.updateCategory(c._id, fd);
      toast.success(`"${c.name}" is hidden from the website (nothing was deleted)`);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div style={{ padding: "28px clamp(16px, 4vw, 28px)", fontFamily: THEME.fontBody, color: THEME.text, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontFamily: THEME.fontDisplay, fontSize: 30 }}>Categories</h1>
        {!editing && (
          <button type="button" onClick={() => setEditing("new")} style={button("primary")}>
            + Add category
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 4px", color: THEME.textMuted, fontSize: 13.5, lineHeight: 1.5, maxWidth: 720 }}>
        Categories are the groups customers browse, each with a tile on the shop page. Pick the page below.
      </p>
      <div role="tablist" aria-label="Which page" style={{ display: "flex", gap: 6, margin: "10px 0 6px", borderBottom: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => {
          const n = categories.filter((c) => inTab(c, key)).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => { setTab(key); setEditing(null); setDeleting(null); }}
              style={{ border: "none", background: "none", padding: "10px 14px", marginBottom: -1, cursor: "pointer", fontFamily: THEME.fontBody, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", color: tab === key ? THEME.text : THEME.textMuted, borderBottom: `2px solid ${tab === key ? THEME.gold : "transparent"}` }}
            >
              {label} <span style={{ fontWeight: 500, color: THEME.textMuted }}>({n})</span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: "0 0 20px", color: THEME.textMuted, fontSize: 13 }}>
        {TABS.find(([key]) => key === tab)[2]} Customers see them in this order: use ▲ ▼ to move one.
      </p>

      {editing && (
        <CategoryForm
          key={editing === "new" ? `new-${tab}` : editing._id}
          initial={editing === "new" ? null : editing}
          tab={tab}
          available={available}
          onCancel={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      {loading ? (
        <p style={{ color: THEME.textMuted }}>Loading…</p>
      ) : !listed.length ? (
        <div style={{ ...card, padding: 32, textAlign: "center", color: THEME.textMuted }}>
          No categories here yet. Click <strong>+ Add category</strong> to create the first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {listed.map((c, i) => {
            const st = statusOf(c);
            const look = STATUS_LOOK[st];
            const empty = tab === "customizable" ? !c.garmentCount : !c.productCount;
            return (
              <div key={c._id} style={{ ...card, padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button type="button" aria-label={`Move ${c.name} up`} title="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...button(), padding: "2px 8px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                  <button type="button" aria-label={`Move ${c.name} down`} title="Move down" disabled={i === listed.length - 1} onClick={() => move(i, 1)} style={{ ...button(), padding: "2px 8px", opacity: i === listed.length - 1 ? 0.3 : 1 }}>▼</button>
                </div>
                <div style={{ width: 52, aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", background: THEME.surface2, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10, color: THEME.textFaint, textAlign: "center", opacity: st === "hidden" ? 0.5 : 1 }}>
                  {c.image?.url ? <img src={imageUrl(c.image.url, 120)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "No picture"}
                </div>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {c.name}
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: look.background, color: look.color, border: `1px solid ${look.border}` }}>
                      {STATUS.find(([key]) => key === st)[1]}
                    </span>
                    {!c.kind && <Badge text="Not sorted yet: Edit to pick a page" />}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: THEME.textMuted }}>{contents(c, tab)}</p>
                  {empty && st === "on" && (
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#7A4E0E" }}>Customers open an empty page here. Edit → part 2 to add what goes in it.</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => { setEditing(c); setDeleting(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={button()}>Edit</button>
                  <button type="button" onClick={() => setDeleting(deleting?._id === c._id ? null : c)} style={button("danger")}>Delete…</button>
                </div>
                {deleting?._id === c._id && (
                  <DeletePanel key={c._id} c={c} onHide={() => hide(c)} onCancel={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ text, gold }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 999,
        background: gold ? THEME.goldBg : THEME.surface2,
        border: `1px solid ${gold ? THEME.goldBorder : THEME.border}`,
        color: gold ? THEME.goldDeep : THEME.textMuted,
      }}
    >
      {text}
    </span>
  );
}
