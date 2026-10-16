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
// both tabs until it is given one (Edit → Shop).
const TABS = [
  ["readymade", "Shop your IDENTEE", "The Shop your IDENTEE page: categories of finished products, by their Garment Style."],
  ["customizable", "Create your IDENTEE", "Collections on the Create your IDENTEE page: the garments customers design, by their style."],
];
const inTab = (c, tab) => !c.kind || c.kind === tab;

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

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <strong style={{ color: THEME.text }}>{label}</strong>
        <br />
        <span style={{ color: THEME.textMuted, fontSize: 12 }}>{hint}</span>
      </span>
    </label>
  );
}

function ImagePicker({ label, hint, current, file, onFile, removed, onRemove, ratio }) {
  const preview = file ? URL.createObjectURL(file) : !removed && current ? imageUrl(current, 400) : "";
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
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
          {preview ? (
            <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "No image"
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 5 * 1024 * 1024) {
                toast.error("Image must be 5 MB or smaller");
                e.target.value = "";
                return;
              }
              onFile(f || null);
            }}
            style={{ fontSize: 12 }}
          />
          {(current || file) && !removed && (
            <button type="button" onClick={onRemove} style={{ ...button("danger"), padding: "4px 10px", fontSize: 12, alignSelf: "flex-start" }}>
              Remove image
            </button>
          )}
          <span style={{ fontSize: 11, color: THEME.textMuted }}>{hint}</span>
        </div>
      </div>
    </div>
  );
}

function CategoryForm({ initial, tab, onCancel, onSaved }) {
  // a new category goes in the open tab; an unsorted one starts on the open tab too (saved when the admin saves)
  const [form, setForm] = useState({ ...EMPTY, ...initial, kind: initial?.kind || tab, styles: initial?.styles || [] });
  const designOwn = form.kind === "customizable";
  const [styleInput, setStyleInput] = useState("");
  const [files, setFiles] = useState({ image: null, bannerImage: null });
  const [removed, setRemoved] = useState({ image: false, bannerImage: false });
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initial?._id);

  const addStyle = () => {
    const parts = styleInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setForm((f) => ({
      ...f,
      styles: [...f.styles, ...parts.filter((p) => !f.styles.some((s) => s.toLowerCase() === p.toLowerCase()))],
    }));
    setStyleInput("");
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      toast.error("Enter a category name");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("description", form.description || "");
      fd.append("styles", JSON.stringify(form.styles));
      fd.append("isActive", form.isActive);
      fd.append("isCustomizable", designOwn ? false : form.isCustomizable);
      fd.append("comingSoon", form.comingSoon);
      fd.append("kind", form.kind);
      for (const field of ["image", "bannerImage"]) {
        if (files[field]) fd.append(field, files[field]);
        else if (removed[field]) fd.append(`remove_${field}`, "true");
      }
      if (isEdit) await categoryService.updateCategory(initial._id, fd);
      else await categoryService.createCategory(fd);
      toast.success(isEdit ? "Category updated" : "Category created");
      onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...card, padding: 24, marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 18px", fontFamily: THEME.fontDisplay, fontSize: 22 }}>
        {isEdit ? `Edit "${initial.name}"` : designOwn ? "New Create your IDENTEE collection" : "New Shop your IDENTEE category"}
      </h3>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Shop</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setForm({ ...form, kind: key })} aria-pressed={form.kind === key} style={{ ...button(form.kind === key ? "primary" : "default"), padding: "7px 14px" }}>
              {label}
            </button>
          ))}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: THEME.textMuted }}>
          {designOwn ? "Shown on the Create your IDENTEE page, with the garments customers can design." : "Shown on the Shop your IDENTEE page and its menu, with finished products."}
          {isEdit && !initial.kind && " This category isn't sorted yet — pick one and save."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={designOwn ? "e.g. Girls Wear" : "e.g. T-Shirts"} style={{ ...inputStyle, marginTop: 6 }} />
          {isEdit && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: THEME.textMuted }}>
              Page address: {designOwn ? `/customizable?category=${initial.slug}` : `/category/${initial.slug}`}
            </p>
          )}
        </div>
        <div>
          <label style={labelStyle}>Short description</label>
          <input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown on the category page" style={{ ...inputStyle, marginTop: 6 }} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Styles in this category</label>
        <p style={{ margin: "4px 0 8px", fontSize: 12, color: THEME.textMuted }}>
          {designOwn ? (
            <>Designable garments appear here when their style (Create your IDENTEE → step 1 "Shown in category") matches one of these.</>
          ) : (
            <>Products appear here when their <strong>Garment Style</strong> matches one of these (not case-sensitive).</>
          )}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {form.styles.map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: THEME.goldBg, border: `1px solid ${THEME.goldBorder}`, fontSize: 12, fontWeight: 600 }}>
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setForm((f) => ({ ...f, styles: f.styles.filter((x) => x !== s) }))} style={{ border: "none", background: "none", cursor: "pointer", color: THEME.textMuted, padding: 0 }}>
                ✕
              </button>
            </span>
          ))}
          {!form.styles.length && <span style={{ fontSize: 12, color: THEME.textFaint }}>No styles yet</span>}
        </div>
        <div style={{ display: "flex", gap: 8, maxWidth: 460 }}>
          <input
            value={styleInput}
            onChange={(e) => setStyleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStyle();
              }
            }}
            placeholder="e.g. Round Neck, V-Neck"
            style={inputStyle}
          />
          <button type="button" onClick={addStyle} style={button()}>Add</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 20 }}>
        <ImagePicker
          label={designOwn ? "Card picture (Create your IDENTEE page)" : "Tile image (Shop your IDENTEE page)"}
          hint="Portrait 4:5, e.g. 800×1000 px · JPG/PNG/WebP · max 5 MB"
          current={initial?.image?.url}
          file={files.image}
          onFile={(f) => { setFiles((x) => ({ ...x, image: f })); setRemoved((r) => ({ ...r, image: false })); }}
          removed={removed.image}
          onRemove={() => { setFiles((x) => ({ ...x, image: null })); setRemoved((r) => ({ ...r, image: true })); }}
        />
        <ImagePicker
          label="Banner image (category page, optional)"
          hint="Wide 16:5, e.g. 1600×500 px · falls back to the tile image"
          ratio="wide"
          current={initial?.bannerImage?.url}
          file={files.bannerImage}
          onFile={(f) => { setFiles((x) => ({ ...x, bannerImage: f })); setRemoved((r) => ({ ...r, bannerImage: false })); }}
          removed={removed.bannerImage}
          onRemove={() => { setFiles((x) => ({ ...x, bannerImage: null })); setRemoved((r) => ({ ...r, bannerImage: true })); }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 20 }}>
        <Toggle label="Visible on the website" hint="Turn off to hide without deleting" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        {!designOwn && (
          <Toggle label='"Create your own" button' hint="Shows a button to the design room on this category's page" checked={form.isCustomizable} onChange={(v) => setForm({ ...form, isCustomizable: v })} />
        )}
        <Toggle label="Coming soon" hint="Greyed-out tile, not clickable" checked={form.comingSoon} onChange={(v) => setForm({ ...form, comingSoon: v })} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
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
  const [editing, setEditing] = useState(null); // null | "new" | category
  const [tab, setTab] = useState("readymade"); // which shop's categories are listed
  const [deleting, setDeleting] = useState(null); // the category whose delete panel is open

  const load = async () => {
    try {
      setCategories(await categoryService.adminGetCategories());
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
    <div style={{ padding: 28, fontFamily: THEME.fontBody, color: THEME.text, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontFamily: THEME.fontDisplay, fontSize: 30 }}>Categories</h1>
        {!editing && (
          <button type="button" onClick={() => setEditing("new")} style={button("primary")}>
            + Add category
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Which shop" style={{ display: "flex", gap: 6, margin: "14px 0 6px", borderBottom: `1px solid ${THEME.border}` }}>
        {TABS.map(([key, label]) => {
          const n = categories.filter((c) => inTab(c, key)).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => { setTab(key); setEditing(null); setDeleting(null); }}
              style={{ border: "none", background: "none", padding: "10px 14px", marginBottom: -1, cursor: "pointer", fontFamily: THEME.fontBody, fontSize: 14, fontWeight: 700, color: tab === key ? THEME.text : THEME.textMuted, borderBottom: `2px solid ${tab === key ? THEME.gold : "transparent"}` }}
            >
              {label} <span style={{ fontWeight: 500, color: THEME.textMuted }}>({n})</span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: "0 0 22px", color: THEME.textMuted, fontSize: 13 }}>
        {TABS.find(([key]) => key === tab)[2]} Shown in this order.
      </p>

      {editing && (
        <CategoryForm
          key={editing === "new" ? `new-${tab}` : editing._id}
          initial={editing === "new" ? null : editing}
          tab={tab}
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
          {listed.map((c, i) => (
            <div key={c._id} style={{ ...card, padding: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", opacity: c.isActive ? 1 : 0.6 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...button(), padding: "2px 8px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                <button type="button" aria-label="Move down" disabled={i === listed.length - 1} onClick={() => move(i, 1)} style={{ ...button(), padding: "2px 8px", opacity: i === listed.length - 1 ? 0.3 : 1 }}>▼</button>
              </div>
              <div style={{ width: 56, aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", background: THEME.surface2, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10, color: THEME.textFaint }}>
                {c.image?.url ? <img src={imageUrl(c.image.url, 120)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "No image"}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                  {c.name}
                  {!c.isActive && <Badge text="Hidden" />}
                  {c.comingSoon && <Badge text="Coming soon" />}
                  {!c.kind && <Badge text="Not sorted yet — Edit to pick a shop" />}
                  {c.kind !== "customizable" && c.isCustomizable && <Badge text='"Create your own" button' gold />}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.textMuted }}>
                  {c.styles.length ? c.styles.join(" · ") : "No styles"} ·{" "}
                  {tab === "customizable"
                    ? `${c.garmentCount || 0} garment${c.garmentCount === 1 ? "" : "s"}${c.garments?.length ? ` (${c.garments.join(", ")})` : ""}`
                    : `${c.productCount} product${c.productCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setEditing(c); setDeleting(null); }} style={button()}>Edit</button>
                <button type="button" onClick={() => setDeleting(deleting?._id === c._id ? null : c)} style={button("danger")}>Delete…</button>
              </div>
              {deleting?._id === c._id && (
                <DeletePanel key={c._id} c={c} onHide={() => hide(c)} onCancel={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ text, gold }) {
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 999,
        verticalAlign: "middle",
        background: gold ? THEME.goldBg : THEME.surface2,
        border: `1px solid ${gold ? THEME.goldBorder : THEME.border}`,
        color: gold ? THEME.goldDeep : THEME.textMuted,
      }}
    >
      {text}
    </span>
  );
}
