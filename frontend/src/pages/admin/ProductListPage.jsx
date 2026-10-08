import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  getProducts,
  deleteProduct,
  updateProductVariant,
} from "../../redux/slices/productSlice";
import { toast } from "react-toastify";
import { THEME, SIZE_CHARTS, inputStyle, labelStyle } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";

// ─── Edit Modal ─────────────────────────────────────────────────────────────
function EditProductModal({ product, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [color, setColor] = useState(product.productdetails?.color || "");
  const [oldPrice, setOldPrice] = useState(product.oldPrice || "");
  const [discount, setDiscount] = useState(product.discount || "");
  const [price, setPrice] = useState(product.price || "");

  const garmentStyle = product.productdetails?.garmentStyle;
  const sizeOptions = SIZE_CHARTS[garmentStyle] || [];

  const initialStock = Object.fromEntries(
    (product.productdetails?.stockBySize || []).map((s) => [s.size, s.stock]),
  );
  const [selectedSizes, setSelectedSizes] = useState(
    product.productdetails?.sizes || Object.keys(initialStock),
  );
  const [stockBySize, setStockBySize] = useState(initialStock);

  const recalcPrice = (nextOldPrice, nextDiscount) => {
    const op = Number(nextOldPrice);
    const d = Number(nextDiscount);
    if (op > 0 && d >= 0) {
      setPrice(String(Math.round(op - (op * d) / 100)));
    }
  };

  const toggleSize = (size) => {
    setSelectedSizes((prev) => {
      const next = prev.includes(size)
        ? prev.filter((s) => s !== size)
        : [...prev, size];
      return next;
    });
    setStockBySize((prev) => {
      if (prev[size] !== undefined) {
        const next = { ...prev };
        delete next[size];
        return next;
      }
      return { ...prev, [size]: 0 };
    });
  };

  const handleSave = async () => {
    setError("");

    if (!color.trim()) return setError("Color is required");
    if (!oldPrice || !discount)
      return setError("Old price and discount are required");
    if (selectedSizes.length === 0) return setError("Select at least one size");

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("color", color.trim());
      formData.append("oldPrice", oldPrice);
      formData.append("discount", discount);
      formData.append("price", price);
      formData.append("sizes", JSON.stringify(selectedSizes));
      formData.append(
        "stockBySize",
        JSON.stringify(
          selectedSizes.map((s) => ({
            size: s,
            stock: Number(stockBySize[s] || 0),
          })),
        ),
      );

      await dispatch(
        updateProductVariant({ id: product._id, formData }),
      ).unwrap();

      toast.success("Product updated");
      onSaved();
      onClose();
    } catch (err) {
      setError(err || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: THEME.surface,
          border: `1px solid ${THEME.border}`,
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: 20,
            fontWeight: 600,
            color: THEME.text,
            fontFamily: "'Cormorant Garamond', serif",
          }}
        >
          Edit Product
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: THEME.textMuted }}>
          {product.brandname} · {product.SKU}
        </p>

        {error && (
          <div
            style={{
              background: THEME.dangerBg,
              border: `1px solid ${THEME.dangerBorder}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 14,
              fontSize: 12,
              color: THEME.danger,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Color</label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ ...inputStyle, marginTop: 5 }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Old Price (₹)</label>
              <input
                type="number"
                value={oldPrice}
                onChange={(e) => {
                  setOldPrice(e.target.value);
                  recalcPrice(e.target.value, discount);
                }}
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Discount (%)</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => {
                  setDiscount(e.target.value);
                  recalcPrice(oldPrice, e.target.value);
                }}
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Sale Price (₹)</label>
              <input
                type="number"
                value={price}
                readOnly
                style={{
                  ...inputStyle,
                  marginTop: 5,
                  background: "#1A1A14",
                  color: THEME.goldBright,
                  fontWeight: 600,
                }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Sizes</label>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              {sizeOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSize(s)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: `1px solid ${selectedSizes.includes(s) ? THEME.gold : THEME.border}`,
                    background: selectedSizes.includes(s)
                      ? THEME.goldBg
                      : THEME.surface,
                    color: selectedSizes.includes(s)
                      ? THEME.goldBright
                      : THEME.textMuted,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: selectedSizes.includes(s) ? 600 : 400,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {selectedSizes.length > 0 && (
            <div>
              <label style={labelStyle}>Stock per Size — restock here</label>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                {selectedSizes.map((s) => (
                  <div
                    key={s}
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <span style={{ fontSize: 12, color: THEME.text }}>
                      {s}:
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={stockBySize[s] ?? ""}
                      onChange={(e) =>
                        setStockBySize((prev) => ({
                          ...prev,
                          [s]: e.target.value,
                        }))
                      }
                      style={{ ...inputStyle, width: 70, padding: "4px 8px" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              background: THEME.surface,
              color: THEME.textMuted,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "9px 24px",
              borderRadius: 8,
              border: "none",
              background: saving
                ? "#8A6F2E"
                : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
              color: "#0B0B0C",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function ProductListPage() {
  const dispatch = useDispatch();
  const { products, isLoading, isError, message } = useSelector(
    (state) => state.product,
  );
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    dispatch(getProducts());
  }, [dispatch]);

  const handleDelete = (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    dispatch(deleteProduct(id))
      .unwrap()
      .then(() => toast.success("Product deleted"))
      .catch((err) => toast.error(err || "Delete failed"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.bg,
        color: THEME.text,
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: THEME.gold,
        }}
      >
        Admin · Catalogue
      </p>
      <h1
        style={{
          margin: "4px 0 16px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        Product List
      </h1>

      {isLoading && <p style={{ color: THEME.textMuted }}>Loading products…</p>}
      {isError && <p style={{ color: THEME.danger }}>{message}</p>}

      {!isLoading && Array.isArray(products) && products.length === 0 && (
        <p style={{ color: THEME.textMuted }}>
          No products yet.{" "}
          <Link to="/admin/upload-product" style={{ color: THEME.gold }}>
            Create one
          </Link>
          .
        </p>
      )}

      {Array.isArray(products) && products.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: THEME.surface2, textAlign: "left" }}>
                {[
                  "Image",
                  "Brand",
                  "SKU",
                  "Color",
                  "Price",
                  "Stock",
                  "Featured",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      color: THEME.textMuted,
                      fontWeight: 600,
                      borderBottom: `1px solid ${THEME.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const totalStock =
                  p.productdetails?.stockBySize?.reduce(
                    (sum, s) => sum + (s.stock || 0),
                    0,
                  ) ?? 0;
                return (
                  <tr
                    key={p._id}
                    style={{ borderBottom: `1px solid ${THEME.border}` }}
                  >
                    <td style={{ padding: "10px 14px" }}>
                      <img
                        src={
                          p.images?.[0]
                            ? imageUrl(p.images[0])
                            : ""
                        }
                        alt=""
                        style={{
                          width: 40,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 6,
                          background: THEME.surface2,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 14px" }}>{p.brandname}</td>
                    <td
                      style={{ padding: "10px 14px", color: THEME.textMuted }}
                    >
                      {p.SKU}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {p.productdetails?.color}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        color: THEME.goldBright,
                        fontWeight: 600,
                      }}
                    >
                      ₹{p.price}
                      {totalStock === 0 && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            color: THEME.danger,
                            background: THEME.dangerBg,
                            border: `1px solid ${THEME.dangerBorder}`,
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          OUT OF STOCK
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{totalStock}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {p.isFeatured ? "★" : "—"}
                    </td>
                    <td
                      style={{ padding: "10px 14px", display: "flex", gap: 8 }}
                    >
                      <button
                        onClick={() => setEditingProduct(p)}
                        style={{
                          background: THEME.goldBg,
                          border: `1px solid ${THEME.goldBorder}`,
                          color: THEME.goldBright,
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p._id, p.brandname)}
                        style={{
                          background: THEME.dangerBg,
                          border: `1px solid ${THEME.dangerBorder}`,
                          color: THEME.danger,
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => dispatch(getProducts())}
        />
      )}
    </div>
  );
}
