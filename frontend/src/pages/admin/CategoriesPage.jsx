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

function CategoryForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, styles: initial?.styles || [] });
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
      fd.append("isCustomizable", form.isCustomizable);
      fd.append("comingSoon", form.comingSoon);
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
        {isEdit ? `Edit "${initial.name}"` : "New category"}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. T-Shirts" style={{ ...inputStyle, marginTop: 6 }} />
          {isEdit && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: THEME.textMuted }}>
              Page address: /category/{initial.slug}
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
          Products appear here when their <strong>Garment Style</strong> matches one of these (not case-sensitive).
          The customizer's garment types match the same way.
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
          label="Tile image (home page)"
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
        <Toggle label="Customizable" hint='Shows a "Design your own" button' checked={form.isCustomizable} onChange={(v) => setForm({ ...form, isCustomizable: v })} />
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

export default function CategoriesPage() {
  const dispatch = useDispatch();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | category

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

  const move = async (index, delta) => {
    const next = [...categories];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setCategories(next);
    try {
      await categoryService.reorderCategories(next.map((c) => c._id));
      dispatch(invalidateCategories());
    } catch (err) {
      toast.error(apiError(err));
      load();
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? Products are kept — they just won't show under this category. Tip: you can hide it instead.`)) return;
    try {
      await categoryService.deleteCategory(c._id);
      toast.success("Category deleted");
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
      <p style={{ margin: "0 0 22px", color: THEME.textMuted, fontSize: 13 }}>
        These appear as tiles on the home page and in the Products menu, in this order.
      </p>

      {editing && (
        <CategoryForm
          key={editing === "new" ? "new" : editing._id}
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      {loading ? (
        <p style={{ color: THEME.textMuted }}>Loading…</p>
      ) : !categories.length ? (
        <div style={{ ...card, padding: 32, textAlign: "center", color: THEME.textMuted }}>
          No categories yet. Click <strong>+ Add category</strong> to create the first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categories.map((c, i) => (
            <div key={c._id} style={{ ...card, padding: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", opacity: c.isActive ? 1 : 0.6 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...button(), padding: "2px 8px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                <button type="button" aria-label="Move down" disabled={i === categories.length - 1} onClick={() => move(i, 1)} style={{ ...button(), padding: "2px 8px", opacity: i === categories.length - 1 ? 0.3 : 1 }}>▼</button>
              </div>
              <div style={{ width: 56, aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", background: THEME.surface2, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10, color: THEME.textFaint }}>
                {c.image?.url ? <img src={imageUrl(c.image.url, 120)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "No image"}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                  {c.name}
                  {!c.isActive && <Badge text="Hidden" />}
                  {c.comingSoon && <Badge text="Coming soon" />}
                  {c.isCustomizable && <Badge text="Customizable" gold />}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.textMuted }}>
                  {c.styles.length ? c.styles.join(" · ") : "No styles"} · {c.productCount} product{c.productCount === 1 ? "" : "s"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditing(c)} style={button()}>Edit</button>
                <button type="button" onClick={() => remove(c)} style={button("danger")}>Delete</button>
              </div>
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
