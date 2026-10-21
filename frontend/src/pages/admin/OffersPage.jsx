// pages/admin/OffersPage.jsx
import { useEffect, useState } from "react";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
  goldBg: "#C9A24B14",
  danger: "#C2503A",
  dangerBg: "#C2503A14",
  success: "#4B9E6E",
  successBg: "#4B9E6E14",
};

const inputStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.panel,
  color: C.ink,
  fontSize: 13,
  fontFamily: "'Inter', sans-serif",
  width: "100%",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 6,
};

const emptyForm = () => ({
  code: "",
  offerPercentage: "",
  startDate: "",
  expiryDate: "",
  maxUsage: "",
  onePerCustomer: true, // false: a customer may use it on every order (a standing "extra 10% off" code)
  showOnSite: false, // shown next to prices on the website
});

function getToken() {
  return JSON.parse(localStorage.getItem("userInfo") || "{}")?.token;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatus(offer) {
  const now = new Date();
  const start = new Date(offer.startDate);
  const end = new Date(offer.expiryDate);
  if (now < start) return { label: "Scheduled", color: C.gold };
  if (now > end) return { label: "Expired", color: C.danger };
  if (offer.maxUsage > 0 && offer.usedCount >= offer.maxUsage)
    return { label: "Limit reached", color: C.danger };
  return { label: "Active", color: C.success };
}

export default function OffersPage() {
  const [offers, setOffers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchOffers = async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/offers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setOffers(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load coupons");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const startEdit = (offer) => {
    setEditingId(offer._id);
    setForm({
      code: offer.code,
      offerPercentage: offer.offerPercentage,
      startDate: offer.startDate?.slice(0, 10) || "",
      expiryDate: offer.expiryDate?.slice(0, 10) || "",
      maxUsage: offer.maxUsage || 0,
      onePerCustomer: offer.onePerCustomer !== false,
      showOnSite: offer.showOnSite === true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (
      !form.code.trim() ||
      !form.offerPercentage ||
      !form.startDate ||
      !form.expiryDate
    ) {
      setError("Code, discount %, start date and expiry date are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        offerPercentage: Number(form.offerPercentage),
        startDate: form.startDate,
        expiryDate: form.expiryDate,
        maxUsage: Number(form.maxUsage) || 0,
        onePerCustomer: form.onePerCustomer,
        showOnSite: form.showOnSite,
      };

      if (editingId) {
        await axios.put(`${BACKEND_URL}/api/offers/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
      } else {
        await axios.post(`${BACKEND_URL}/api/offers`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
      }

      cancelEdit();
      fetchOffers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  };

  // Switch a coupon off (or on again) instead of deleting it: customers can't use it, the site stops
  // showing it, and its usage history stays.
  const handleToggle = async (offer) => {
    setError("");
    const isActive = offer.isActive === false;
    try {
      const { data } = await axios.put(
        `${BACKEND_URL}/api/offers/${offer._id}`,
        { isActive },
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      setOffers((prev) => prev.map((o) => (o._id === offer._id ? { ...o, ...data } : o)));
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't change the coupon");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this coupon? This cannot be undone — switching it off keeps its history instead.")) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/offers/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setOffers((prev) => prev.filter((o) => o._id !== id));
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete coupon");
    }
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
        Admin · Marketing
      </p>
      <h1
        style={{
          margin: "4px 0 24px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        Coupon Codes
      </h1>

      {error && (
        <div
          style={{
            marginBottom: 20,
            maxWidth: 700,
            background: C.dangerBg,
            border: `1px solid ${C.danger}55`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: C.danger,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Create / Edit form ── */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 700,
          marginBottom: 32,
        }}
      >
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            fontWeight: 600,
            color: C.gold,
          }}
        >
          {editingId ? "Edit Coupon" : "Create New Coupon"}
        </p>

        <div
          style={{
            display: "grid",
            // two columns; one on a phone (narrower than 2 × 220px)
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Coupon Code *</label>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME20"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Discount % *</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.offerPercentage}
              onChange={(e) => set("offerPercentage", e.target.value)}
              placeholder="20"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Start Date *</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Expiry Date *</label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => set("expiryDate", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Max Usage (0 = unlimited)</label>
            <input
              type="number"
              min={0}
              value={form.maxUsage}
              onChange={(e) => set("maxUsage", e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, margin: "0 0 16px", fontSize: 13, color: C.ink }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={!form.onePerCustomer} onChange={(e) => set("onePerCustomer", !e.target.checked)} />
            A customer can use it on every order (not just once)
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.showOnSite} onChange={(e) => set("showOnSite", e.target.checked)} />
            Show it next to prices on the website (“+ Extra {form.offerPercentage || "10"}% off with code {form.code.trim().toUpperCase() || "…"}”)
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#8A6F2E" : C.gold,
              color: "#0B0B0C",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : editingId ? "Update Coupon" : "Create Coupon"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.muted,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ── List ── */}
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 14,
          fontWeight: 600,
          color: C.ink,
        }}
      >
        All Coupons ({offers.length})
      </p>

      {isLoading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
      ) : offers.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>No coupons created yet.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 900,
          }}
        >
          {offers.map((offer) => {
            const status = getStatus(offer);
            return (
              <div
                key={offer._id}
                style={{
                  display: "flex",
                  flexWrap: "wrap", // a phone: the details and buttons go onto their own lines
                  alignItems: "center",
                  gap: 16,
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                }}
              >
                <div style={{ minWidth: 110 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.gold,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {offer.code}
                  </p>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: status.color,
                      textTransform: "uppercase",
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                <div
                  style={{
                    flex: "1 1 220px",
                    minWidth: 0,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px 28px",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  <span>
                    <b style={{ color: C.ink }}>{offer.offerPercentage}%</b> off
                  </span>
                  <span>
                    {fmtDate(offer.startDate)} → {fmtDate(offer.expiryDate)}
                  </span>
                  <span>
                    Used: <b style={{ color: C.ink }}>{offer.usedCount}</b>
                    {offer.maxUsage > 0
                      ? ` / ${offer.maxUsage}`
                      : " (unlimited)"}
                  </span>
                  {offer.onePerCustomer === false && <span>Every order</span>}
                  {offer.showOnSite && <b style={{ color: C.gold }}>On the website</b>}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    onClick={() => startEdit(offer)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: "transparent",
                      color: C.ink,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggle(offer)}
                    title={offer.isActive === false ? "Customers can't use it now. Switch it on again." : "Stop customers using it, without deleting it"}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: offer.isActive === false ? C.ink : "transparent",
                      color: offer.isActive === false ? "#fff" : C.ink,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {offer.isActive === false ? "Switch on" : "Switch off"}
                  </button>
                  <button
                    onClick={() => handleDelete(offer._id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: `1px solid ${C.danger}`,
                      background: "transparent",
                      color: C.danger,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
