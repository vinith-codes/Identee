// pages/admin/CustomizableListPage.jsx
//
// Admin → Customizable: every garment customers can design on, with its
// status (Live / Draft) and set-up progress. "Set up" opens the wizard.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import garmentTypeService from "../../services/garmentTypeService";
import { imageUrl } from "../../utils/imageUrl";
import { AW } from "./garmentSetup/wizardStyles";

export default function CustomizableListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [fit, setFit] = useState("oversized");
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState({}); // photos that failed to load (old local uploads)

  useEffect(() => {
    garmentTypeService
      .adminListGarments()
      .then(setItems)
      .catch((err) => setError(err.response?.data?.message || "Could not load garments."));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const g = await garmentTypeService.createDraftGarment(
        name.trim(),
        fit === "oversized" ? "Oversized" : "Round Neck",
        fit,
      );
      navigate(`/admin/customizable/${g.key}`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create the garment.");
      setBusy(false);
    }
  };

  return (
    <div style={AW.page}>
      <style>{AW.css}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={AW.h1}>Customizable garments</h1>
          <p style={AW.lead}>Garments customers can put their own design on. Set each one up step by step.</p>
        </div>
        {!adding && (
          <button type="button" className="aw-btn dark" onClick={() => setAdding(true)}>
            + Add garment
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={create} className="aw-card" style={{ padding: 20, marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 220px" }}>
            <span className="aw-lbl">Garment name</span>
            <input className="aw-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oversized Tee" autoFocus />
          </label>
          <label style={{ flex: "0 1 200px" }}>
            <span className="aw-lbl">Fit</span>
            <select className="aw-inp" value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="oversized">Oversized</option>
              <option value="regular">Regular fit</option>
            </select>
          </label>
          <button type="submit" className="aw-btn dark" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create and set up"}
          </button>
          <button type="button" className="aw-btn light" onClick={() => setAdding(false)}>
            Cancel
          </button>
          <p className="aw-help" style={{ flexBasis: "100%", margin: 0 }}>
            New garments start as a <b>draft</b> — customers don't see them until you publish.
          </p>
        </form>
      )}

      {error && <p style={{ color: "#A3341F", marginTop: 16 }}>{error}</p>}
      {!items && !error && <p style={{ color: "#6B6559", marginTop: 20 }}>Loading…</p>}

      {items && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 20 }}>
          {items.map((g) => {
            const photosDone = g.photoTotal > 0 && g.photoCount >= g.photoTotal;
            return (
              <Link key={g._id} to={`/admin/customizable/${g.key}`} className="aw-card aw-garment">
                <div style={{ aspectRatio: "4 / 3", background: "#F3EEE2", borderRadius: "16px 16px 0 0", overflow: "hidden", display: "grid", placeItems: "center" }}>
                  {g.cover && !broken[g._id] ? (
                    <img
                      src={imageUrl(g.cover, 480)}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      onError={() => setBroken((b) => ({ ...b, [g._id]: true }))}
                    />
                  ) : (
                    <span style={{ color: "#A39C8C", fontSize: 13 }}>{g.cover ? "Photo missing" : "No photo yet"}</span>
                  )}
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <b style={{ fontSize: 16 }}>{g.label}</b>
                    <span className={`aw-tag ${g.isActive ? "live" : "draft"}`}>{g.isActive ? "Live" : "Draft"}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6B6559" }}>
                    {g.colors?.length || 0} colours · {g.photoCount}/{g.photoTotal} photos
                    {photosDone ? " ✓" : ""} · {g.basePrice > 0 ? `₹${g.basePrice}` : "no price yet"}
                  </p>
                  <span className="aw-link" style={{ display: "inline-block", marginTop: 10 }}>
                    {g.isActive ? "Edit set-up →" : "Continue set-up →"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="aw-help" style={{ marginTop: 28 }}>
        Older pages (still work): <Link to="/admin/garment-types">Garment types</Link> ·{" "}
        <Link to="/admin/garment-photos">Garment photos</Link>
      </p>
    </div>
  );
}
