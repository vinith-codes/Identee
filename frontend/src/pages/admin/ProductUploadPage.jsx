// pages/admin/ProductUploadPage.jsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createProduct, reset } from "../../redux/slices/productSlice";

import { toast } from "react-toastify";
import { THEME, SIZE_CHARTS, inputStyle, labelStyle } from "../../theme/theme";
import "react-toastify/dist/ReactToastify.css";
import categoryService from "../../services/categoryService";

// ─── helpers ────────────────────────────────────────────────────────────────
const WASH_OPTIONS = [
  "Machine wash cold",
  "Hand wash only",
  "Do not bleach",
  "Tumble dry low",
  "Iron on low heat",
  "Dry clean only",
  "Do not wring",
];

const GENDERS = ["Men", "Women", "Kids", "Unisex"];
const AGE_RANGES = ["Adult", "Teen", "Kids", "Infant"];
const PRODUCT_TYPES = ["Casual", "Formal", "Sports", "Ethnic", "Party"];

const emptyVariant = () => ({
  id: Date.now() + Math.random(),
  color: "",
  garmentStyle: "Round Neck",
  sizes: [],
  stockBySize: {},
  price: "",
  oldPrice: "",
  discount: "",
  images: [],
  previews: [],
});

const emptyForm = () => ({
  brandname: "",
  description: "",
  SKU: "",
  hsnCode: "6109",
  productType: "single",
  comboName: "",
  gender: "Men",
  category: "",
  subcategory: "",
  type: "",
  ageRange: "Adult",
  fabric: "",
  isFeatured: false,
  washCare: [],
  weight: "",
  length: "",
  width: "",
  height: "",
  street1: "",
  city: "",
  state: "",
  zip: "",
  country: "India",
  variants: [emptyVariant()],
});

const sectionHeading = {
  fontSize: 12,
  fontWeight: 700,
  color: THEME.gold,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontFamily: "'Inter', sans-serif",
  margin: "28px 0 14px",
  paddingBottom: 8,
  borderBottom: `1px solid ${THEME.border}`,
};

// ─── sub-components ──────────────────────────────────────────────────────────

function ImageDropzone({ images, previews, onChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    (newFiles) => {
      const combined = [...images, ...Array.from(newFiles)].slice(0, 5);
      const newPreviews = combined.map((f, i) =>
        i < images.length ? previews[i] : URL.createObjectURL(f),
      );
      onChange(combined, newPreviews);
    },
    [images, previews, onChange],
  );

  const removeImage = (index) => {
    const next = images.filter((_, i) => i !== index);
    const nextP = previews.filter((_, i) => i !== index);
    onChange(next, nextP);
  };

  const error = images.length > 0 && images.length < 3;
  const full = images.length === 5;

  return (
    <div>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}
      >
        {previews.map((src, i) => (
          <div key={i} style={{ position: "relative", width: 72, height: 72 }}>
            <img
              src={src}
              alt=""
              style={{
                width: 72,
                height: 72,
                objectFit: "cover",
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
              }}
            />
            <button
              type="button"
              onClick={() => removeImage(i)}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: THEME.danger,
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              ×
            </button>
            {i === 0 && (
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  left: 2,
                  fontSize: 8,
                  background: THEME.gold,
                  color: "#0B0B0C",
                  padding: "1px 4px",
                  borderRadius: 3,
                  fontWeight: 700,
                }}
              >
                MAIN
              </span>
            )}
          </div>
        ))}

        {!full && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            style={{
              width: 72,
              height: 72,
              border: `2px dashed ${dragging ? THEME.gold : error ? THEME.danger : THEME.border}`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: dragging ? THEME.gold : THEME.textMuted,
              fontSize: 10,
              gap: 3,
              transition: "border-color 0.15s",
              background: THEME.surface2,
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width={18} height={18}>
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Add</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => addFiles(e.target.files)}
      />

      <p
        style={{
          fontSize: 11,
          color: error
            ? THEME.danger
            : images.length >= 3
              ? THEME.gold
              : THEME.textMuted,
          margin: 0,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {images.length}/5 images —{" "}
        {images.length < 3 ? `need ${3 - images.length} more` : "✓ ready"}
      </p>
    </div>
  );
}

function VariantCard({
  variant,
  index,
  onChange,
  onRemove,
  canRemove,
  garmentStyleOptions,
}) {
  const update = (field, value) =>
    onChange(index, { ...variant, [field]: value });

  const changeStyle = (style) => {
    onChange(index, { ...variant, garmentStyle: style });
  };

  const [sizeDraft, setSizeDraft] = useState("");

  const addSize = () => {
    const s = sizeDraft.trim().toUpperCase();
    if (!s || variant.sizes.includes(s)) return;
    onChange(index, {
      ...variant,
      sizes: [...variant.sizes, s],
      stockBySize: { ...variant.stockBySize, [s]: 0 },
    });
    setSizeDraft("");
  };

  const removeSize = (size) => {
    const stock = { ...variant.stockBySize };
    delete stock[size];
    onChange(index, {
      ...variant,
      sizes: variant.sizes.filter((s) => s !== size),
      stockBySize: stock,
    });
  };

  return (
    <div
      style={{
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        padding: 20,
        background: THEME.surface,
        position: "relative",
        boxShadow: THEME.shadow,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: THEME.text,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Variant {index + 1}
          {variant.color && (
            <span style={{ color: THEME.goldBright, marginLeft: 6 }}>
              — {variant.color}
            </span>
          )}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            style={{
              background: THEME.dangerBg,
              border: `1px solid ${THEME.dangerBorder}`,
              borderRadius: 6,
              color: THEME.danger,
              cursor: "pointer",
              fontSize: 11,
              padding: "3px 10px",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="Color *">
          <input
            value={variant.color}
            onChange={(e) => update("color", e.target.value)}
            placeholder="e.g. Onyx Black"
            style={inputStyle}
          />
        </Field>
        <Field label="Old Price (₹) *">
          <input
            type="number"
            value={variant.oldPrice}
            onChange={(e) => update("oldPrice", e.target.value)}
            placeholder="999"
            style={inputStyle}
          />
        </Field>
        <Field label="Discount (%) *">
          <input
            type="number"
            value={variant.discount}
            onChange={(e) => {
              const disc = Number(e.target.value);
              const price = variant.oldPrice
                ? Math.round(
                    Number(variant.oldPrice) -
                      (Number(variant.oldPrice) * disc) / 100,
                  )
                : "";
              onChange(index, {
                ...variant,
                discount: e.target.value,
                price: String(price),
              });
            }}
            placeholder="20"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Field label="Sale Price (₹) — auto-calculated">
          <input
            type="number"
            value={variant.price}
            readOnly
            style={{
              ...inputStyle,
              background: "#1A1A14",
              color: THEME.goldBright,
              fontWeight: 600,
            }}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Field label="Garment Style *">
          <select
            value={variant.garmentStyle}
            onChange={(e) => changeStyle(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {garmentStyleOptions.map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.styles.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </optgroup>
            ))}
            {/* keep an old value that is no longer in any category visible */}
            {variant.garmentStyle &&
              !garmentStyleOptions.some((g) => g.styles.includes(variant.garmentStyle)) && (
                <option value={variant.garmentStyle}>
                  {variant.garmentStyle} (not in any category)
                </option>
              )}
          </select>
        </Field>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Sizes *</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input
            value={sizeDraft}
            onChange={(e) => setSizeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSize();
              }
            }}
            placeholder="e.g. S, M, L, XL, Free Size"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={addSize}
            style={{
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: THEME.gold,
              color: "#0B0B0C",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>

        {variant.sizes.length > 0 && (
          <div
            style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}
          >
            {variant.sizes.map((s) => (
              <span
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px 4px 12px",
                  borderRadius: 999,
                  border: `1px solid ${THEME.gold}`,
                  background: THEME.goldBg,
                  color: THEME.goldBright,
                  fontSize: 12,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSize(s)}
                  style={{
                    border: "none",
                    background: "none",
                    color: THEME.goldBright,
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {variant.sizes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Stock per Size *</label>
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}
          >
            {variant.sizes.map((s) => (
              <div
                key={s}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: THEME.text,
                    fontFamily: "'Inter',sans-serif",
                  }}
                >
                  {s}:
                </span>
                <input
                  type="number"
                  min={0}
                  value={variant.stockBySize[s] || ""}
                  onChange={(e) =>
                    onChange(index, {
                      ...variant,
                      stockBySize: {
                        ...variant.stockBySize,
                        [s]: Number(e.target.value),
                      },
                    })
                  }
                  placeholder="0"
                  style={{ ...inputStyle, width: 60, padding: "4px 8px" }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>
          Product Images{" "}
          <span style={{ color: THEME.textMuted, fontWeight: 400 }}>
            (min 3, max 5)
          </span>
        </label>
        <ImageDropzone
          images={variant.images}
          previews={variant.previews}
          onChange={(imgs, prevs) =>
            onChange(index, { ...variant, images: imgs, previews: prevs })
          }
        />
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <div style={{ marginTop: 5 }}>{children}</div>
  </div>
);

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function ProductUploadPage() {
  const dispatch = useDispatch();
  const { isLoading, isError, isSuccess, message } = useSelector(
    (state) => state.product,
  );
  // Garment Style options come from Admin → Categories (grouped by category),
  // so every uploaded product lands in a storefront category.
  const [styleGroups, setStyleGroups] = useState([]);
  const garmentStyleOptions = styleGroups;
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    categoryService
      .adminGetCategories()
      .then((cats) =>
        setStyleGroups(
          cats
            .filter((c) => c.styles.length)
            .map((c) => ({ category: c.name, styles: c.styles })),
        ),
      )
      .catch(() => setStyleGroups([]));
  }, []);

  useEffect(() => {
    if (isSuccess) {
      setForm(emptyForm());
      setFormErrors({});
      toast.success("Product uploaded successfully");
      dispatch(reset());
    }
    if (isError) {
      toast.error(message || "Something went wrong");
      dispatch(reset());
    }
  }, [isSuccess, isError, message, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(reset());
    };
  }, [dispatch]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const updateVariant = (idx, updated) => {
    setForm((f) => {
      const variants = [...f.variants];
      variants[idx] = updated;
      return { ...f, variants };
    });
  };

  const addVariant = () =>
    setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }));

  const removeVariant = (idx) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.filter((_, i) => i !== idx),
    }));

  const toggleWashCare = (item) =>
    set(
      "washCare",
      form.washCare.includes(item)
        ? form.washCare.filter((w) => w !== item)
        : [...form.washCare, item],
    );

  const validate = () => {
    const errs = {};
    if (!form.brandname.trim()) errs.brandname = "Required";
    if (!form.SKU.trim()) errs.SKU = "Required";
    if (!form.description.trim()) errs.description = "Required";
    if (!form.category.trim()) errs.category = "Required";
    if (!form.subcategory.trim()) errs.subcategory = "Required";
    if (!form.type.trim()) errs.type = "Required";
    if (!form.fabric.trim()) errs.fabric = "Required";

    form.variants.forEach((v, i) => {
      if (!v.color.trim()) errs[`v${i}_color`] = "Required";
      if (!v.oldPrice) errs[`v${i}_oldPrice`] = "Required";
      if (!v.discount) errs[`v${i}_discount`] = "Required";
      if (v.sizes.length === 0)
        errs[`v${i}_sizes`] = "Select at least one size";
      if (v.images.length < 3)
        errs[`v${i}_images`] = "Upload at least 3 images";
    });

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const data = new FormData();
    data.append("brandname", form.brandname);
    data.append("description", form.description);
    data.append("SKU", form.SKU);
    data.append("hsnCode", form.hsnCode);
    data.append("productType", form.productType);
    data.append("comboName", form.comboName);
    data.append("isFeatured", form.isFeatured ? "true" : "false");
    data.append("washCare", JSON.stringify(form.washCare));

    const shipping = {
      weight: Number(form.weight),
      dimensions: {
        length: Number(form.length),
        width: Number(form.width),
        height: Number(form.height),
      },
      originAddress: {
        street1: form.street1,
        city: form.city,
        state: form.state,
        zip: Number(form.zip),
        country: form.country,
      },
    };
    data.append("shippingDetails", JSON.stringify(shipping));

    const variantsPayload = form.variants.map((v) => ({
      price: v.price,
      oldPrice: v.oldPrice,
      discount: v.discount,
      imagesCount: v.images.length,
      productdetails: {
        gender: form.gender,
        category: form.category,
        subcategory: form.subcategory,
        type: form.type,
        ageRange: form.ageRange,
        color: v.color,
        garmentStyle: v.garmentStyle,
        fabric: form.fabric,
        sizes: v.sizes,
        stockBySize: v.sizes.map((s) => ({
          size: s,
          stock: v.stockBySize[s] || 0,
        })),
      },
    }));
    data.append("products", JSON.stringify(variantsPayload));

    form.variants.forEach((v) => {
      v.images.forEach((img) => data.append("images", img));
    });

    dispatch(createProduct(data));
  };

  const err = (key) =>
    formErrors[key] ? (
      <p
        style={{
          color: THEME.danger,
          fontSize: 11,
          margin: "3px 0 0",
          fontFamily: "'Inter',sans-serif",
        }}
      >
        {formErrors[key]}
      </p>
    ) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
        fontFamily: "'Inter', sans-serif",
        padding: "32px 40px",
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <p style={{ ...labelStyle, margin: 0, color: THEME.gold }}>
          Admin · Catalogue
        </p>
        <h1
          style={{
            margin: "4px 0 0",
            fontSize: 26,
            fontWeight: 600,
            color: THEME.text,
            letterSpacing: "0.01em",
            fontFamily: "'Cormorant Garamond', serif",
          }}
        >
          Upload Product
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: THEME.textMuted }}>
          Fill in product details and add colour variants with images.
        </p>
      </div>

      {isError && (
        <div
          style={{
            background: THEME.dangerBg,
            border: `1px solid ${THEME.dangerBorder}`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: THEME.danger,
          }}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <p style={sectionHeading}>Basic Information</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Field label="Brand Name *">
            <input
              value={form.brandname}
              onChange={(e) => set("brandname", e.target.value)}
              placeholder="e.g. IDENTEE"
              style={inputStyle}
            />
            {err("brandname")}
          </Field>
          <Field label="Base SKU *">
            <input
              value={form.SKU}
              onChange={(e) => set("SKU", e.target.value.toUpperCase())}
              placeholder="e.g. IDT001"
              style={inputStyle}
            />
            {err("SKU")}
          </Field>
          <Field label="HSN Code">
            <input
              value={form.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value)}
              placeholder="6109"
              style={inputStyle}
            />
          </Field>
          <Field label="Product Type">
            <select
              value={form.productType}
              onChange={(e) => set("productType", e.target.value)}
              style={inputStyle}
            >
              <option value="single">Single</option>
              <option value="combo">Combo</option>
            </select>
          </Field>
        </div>

        {form.productType === "combo" && (
          <div style={{ marginBottom: 16 }}>
            <Field label="Combo Name *">
              <input
                value={form.comboName}
                onChange={(e) => set("comboName", e.target.value)}
                placeholder="Pack of 3 T-Shirts"
                style={inputStyle}
              />
            </Field>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <Field label="Description *">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the product..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            {err("description")}
          </Field>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <input
            id="featured"
            type="checkbox"
            checked={form.isFeatured}
            onChange={(e) => set("isFeatured", e.target.checked)}
            style={{ accentColor: THEME.gold, width: 14, height: 14 }}
          />
          <label
            htmlFor="featured"
            style={{
              ...labelStyle,
              textTransform: "none",
              fontSize: 13,
              color: THEME.text,
            }}
          >
            Mark as Featured
          </label>
        </div>

        <p style={sectionHeading}>Product Details</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Field label="Gender *">
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              style={inputStyle}
            >
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Category *">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select…</option>
              {styleGroups.map((g) => (
                <option key={g.category} value={g.category}>
                  {g.category}
                </option>
              ))}
            </select>
            {err("category")}
          </Field>
          <Field label="Subcategory *">
            <input
              value={form.subcategory}
              onChange={(e) => set("subcategory", e.target.value)}
              placeholder="e.g. T-Shirts"
              style={inputStyle}
            />
            {err("subcategory")}
          </Field>
          <Field label="Type *">
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select…</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {err("type")}
          </Field>
          <Field label="Age Range *">
            <select
              value={form.ageRange}
              onChange={(e) => set("ageRange", e.target.value)}
              style={inputStyle}
            >
              {AGE_RANGES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="Fabric *">
            <input
              value={form.fabric}
              onChange={(e) => set("fabric", e.target.value)}
              placeholder="e.g. 100% Cotton"
              style={inputStyle}
            />
            {err("fabric")}
          </Field>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Wash Care</label>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {WASH_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => toggleWashCare(w)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${form.washCare.includes(w) ? THEME.gold : THEME.border}`,
                  background: form.washCare.includes(w)
                    ? THEME.goldBg
                    : THEME.surface,
                  color: form.washCare.includes(w)
                    ? THEME.goldBright
                    : THEME.textMuted,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <p style={sectionHeading}>Shipping Details</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Field label="Weight (kg)">
            <input
              type="number"
              value={form.weight}
              onChange={(e) => set("weight", e.target.value)}
              placeholder="0.3"
              style={inputStyle}
            />
          </Field>
          <Field label="Length (cm)">
            <input
              type="number"
              value={form.length}
              onChange={(e) => set("length", e.target.value)}
              placeholder="30"
              style={inputStyle}
            />
          </Field>
          <Field label="Width (cm)">
            <input
              type="number"
              value={form.width}
              onChange={(e) => set("width", e.target.value)}
              placeholder="25"
              style={inputStyle}
            />
          </Field>
          <Field label="Height (cm)">
            <input
              type="number"
              value={form.height}
              onChange={(e) => set("height", e.target.value)}
              placeholder="5"
              style={inputStyle}
            />
          </Field>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Field label="Street Address">
            <input
              value={form.street1}
              onChange={(e) => set("street1", e.target.value)}
              placeholder="Warehouse, 12 MG Road"
              style={inputStyle}
            />
          </Field>
          <Field label="City">
            <input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Chennai"
              style={inputStyle}
            />
          </Field>
          <Field label="State">
            <input
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="Tamil Nadu"
              style={inputStyle}
            />
          </Field>
          <Field label="ZIP">
            <input
              type="number"
              value={form.zip}
              onChange={(e) => set("zip", e.target.value)}
              placeholder="600001"
              style={inputStyle}
            />
          </Field>
        </div>

        <p style={sectionHeading}>Colour Variants</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {form.variants.map((v, i) => (
            <VariantCard
              key={v.id}
              variant={v}
              index={i}
              onChange={updateVariant}
              onRemove={removeVariant}
              canRemove={form.variants.length > 1}
              garmentStyleOptions={garmentStyleOptions}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addVariant}
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: `1px dashed ${THEME.gold}`,
            borderRadius: 8,
            color: THEME.goldBright,
            cursor: "pointer",
            padding: "9px 16px",
            fontSize: 13,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            width: "100%",
            justifyContent: "center",
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14}>
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Add Another Colour Variant
        </button>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setForm(emptyForm())}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              background: THEME.surface,
              color: THEME.textMuted,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: "9px 28px",
              borderRadius: 8,
              border: "none",
              background: isLoading
                ? "#8A6F2E"
                : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
              color: "#0B0B0C",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isLoading ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: `2px solid #0B0B0C55`,
                    borderTop: `2px solid #0B0B0C`,
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    display: "inline-block",
                  }}
                />
                Uploading…
              </>
            ) : (
              "Create Product"
            )}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.gold} !important;
          box-shadow: 0 0 0 3px ${THEME.goldBg};
        }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.5; filter: invert(1); }
        select option { background: ${THEME.surface2}; color: ${THEME.text}; }
      `}</style>
    </div>
  );
}
