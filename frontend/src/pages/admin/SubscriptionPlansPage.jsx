import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
  goldBg: "#C9A24B14",
  danger: "#C9524B",
};

const emptyForm = {
  title: "",
  description: "",
  price: "",
  discountPercent: "",
  durationDays: "",
  offers: "",
};

export default function SubscriptionPlansPage() {
  const { user } = useSelector((state) => state.auth);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const authHeader = { headers: { Authorization: `Bearer ${user?.token}` } };

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/subscriptions`, authHeader);
      setPlans(data);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        discountPercent: Number(form.discountPercent),
        durationDays: Number(form.durationDays),
        offers: form.offers
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      };

      if (editingId) {
        await axios.put(`${BACKEND_URL}/api/subscriptions/${editingId}`, payload, authHeader);
      } else {
        await axios.post(`${BACKEND_URL}/api/subscriptions`, payload, authHeader);
      }

      resetForm();
      fetchPlans();
    } catch (err) {
      console.error("Save failed:", err);
      alert(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan) => {
    setForm({
      title: plan.title || "",
      description: plan.description || "",
      price: plan.price ?? "",
      discountPercent: plan.discountPercent ?? "",
      durationDays: plan.durationDays ?? "",
      offers: (plan.offers || []).join(", "),
    });
    setEditingId(plan._id);
  };

  const handleToggle = async (id) => {
    try {
      await axios.patch(`${BACKEND_URL}/api/subscriptions/${id}/toggle`, {}, authHeader);
      fetchPlans();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this plan?")) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/subscriptions/${id}`, authHeader);
      fetchPlans();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.ink,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    color: C.muted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: C.ink, padding: 24 }}>
      <h2 style={{ marginBottom: 20 }}>Subscription Plans</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
            width: 320,
            maxWidth: "100%",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: C.gold }}>
            {editingId ? "Edit Plan" : "New Plan"}
          </h3>

          <label style={labelStyle}>Title</label>
          <input style={inputStyle} name="title" value={form.title} onChange={handleChange} required />

          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} name="description" value={form.description} onChange={handleChange} />

          <label style={labelStyle}>Price (₹)</label>
          <input style={inputStyle} type="number" name="price" value={form.price} onChange={handleChange} required />

          <label style={labelStyle}>Discount %</label>
          <input style={inputStyle} type="number" name="discountPercent" value={form.discountPercent} onChange={handleChange} required />

          <label style={labelStyle}>Duration (days)</label>
          <input style={inputStyle} type="number" name="durationDays" value={form.durationDays} onChange={handleChange} required />

          <label style={labelStyle}>Offers (comma separated)</label>
          <input style={inputStyle} name="offers" value={form.offers} onChange={handleChange} placeholder="Free shipping, Priority support" />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: "10px",
                background: C.gold,
                color: "#0B0B0C",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  color: C.muted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* List */}
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          {loading ? (
            <p style={{ color: C.muted }}>Loading...</p>
          ) : plans.length === 0 ? (
            <p style={{ color: C.muted }}>No plans yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {plans.map((plan) => (
                <div
                  key={plan._id}
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: 15 }}>{plan.title}</h4>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: plan.isActive ? "#4B9E6E22" : "#8A877F22",
                          color: plan.isActive ? "#4B9E6E" : C.muted,
                        }}
                      >
                        {plan.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: 12, color: C.muted }}>{plan.description}</p>
                    <p style={{ margin: 0, fontSize: 12, color: C.gold }}>
                      ₹{plan.price} · {plan.discountPercent}% off · {plan.durationDays} days
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleEdit(plan)} style={btnStyle(C)}>Edit</button>
                    <button onClick={() => handleToggle(plan._id)} style={btnStyle(C)}>
                      {plan.isActive ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => handleDelete(plan._id)} style={{ ...btnStyle(C), color: C.danger, borderColor: `${C.danger}55` }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function btnStyle(C) {
  return {
    padding: "6px 12px",
    fontSize: 12,
    background: "transparent",
    color: C.ink,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    cursor: "pointer",
  };
}