import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchGarmentTypes,
  createGarmentType,
  deleteGarmentType,
  updateGarmentBasePrice,
} from "../../redux/slices/garmentTypeSlice";

const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
  danger: "#C2503A",
};

export default function GarmentTypesPage() {
  const dispatch = useDispatch();
  const { items, isLoading } = useSelector((s) => s.garmentType);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [priceDraft, setPriceDraft] = useState("");

  useEffect(() => {
    dispatch(fetchGarmentTypes());
  }, [dispatch]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!label.trim() || !category.trim()) return;
    dispatch(
      createGarmentType({
        label: label.trim(),
        category: category.trim(),
        basePrice: basePrice || 0,
      }),
    );
    setLabel("");
    setCategory("");
    setBasePrice("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
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
          color: C.gold,
        }}
      >
        Admin
      </p>
      <h1
        style={{
          margin: "4px 0 24px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        Garment Types
      </h1>

      <form
        onSubmit={handleCreate}
        style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Garment name (e.g. Hoodie, Pants)"
          style={inputStyle}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category name (match Category Banner exactly)"
          style={{ ...inputStyle, minWidth: 320 }}
        />
        <input
          type="number"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          placeholder="Base price (₹)"
          style={{ ...inputStyle, width: 140 }}
        />
        <button type="submit" style={btnStyle}>
          Add Garment Type
        </button>
      </form>

      {isLoading && <p style={{ color: C.muted }}>Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((g) => (
          <div
            key={g._id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "14px 18px",
              gap: 12,
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{g.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>
                key: {g.key} · category: {g.category} · base price: ₹
                {g.basePrice || 0}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {editingPriceId === g._id ? (
                <>
                  <input
                    type="number"
                    value={priceDraft}
                    onChange={(e) => setPriceDraft(e.target.value)}
                    placeholder="Base price"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.bg,
                      color: C.ink,
                      fontSize: 12,
                      width: 110,
                    }}
                  />
                  <button
                    onClick={() => {
                      dispatch(
                        updateGarmentBasePrice({
                          id: g._id,
                          basePrice: priceDraft || 0,
                        }),
                      );
                      setEditingPriceId(null);
                    }}
                    style={{
                      border: "none",
                      background: C.gold,
                      color: "#0B0B0C",
                      borderRadius: 6,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingPriceId(null)}
                    style={{
                      border: `1px solid ${C.border}`,
                      background: "none",
                      color: C.muted,
                      borderRadius: 6,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setEditingPriceId(g._id);
                    setPriceDraft(g.basePrice || 0);
                  }}
                  style={{
                    border: `1px solid ${C.gold}`,
                    background: "none",
                    color: C.gold,
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Edit Price
                </button>
              )}
              <button
                onClick={() => dispatch(deleteGarmentType(g._id))}
                style={{
                  border: `1px solid ${C.danger}`,
                  background: "none",
                  color: C.danger,
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.panel,
  color: C.ink,
  fontSize: 13,
  flex: 1,
  minWidth: 160,
};
const btnStyle = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: C.gold,
  color: "#0B0B0C",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};
