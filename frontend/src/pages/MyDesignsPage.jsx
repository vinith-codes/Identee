// pages/MyDesignsPage.jsx  —  /my-designs (login)
//
// Every design the customer saved in the 3D Design Room: picture of the
// tee, name, garment / colour / size, and Open · Duplicate · Delete.
// Ordered designs are locked (opening one edits a copy).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import customizationService from "../services/customizationService";
import DesignPreview from "../components/DesignPreview";
import { THEME } from "../theme/theme";

const when = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function MyDesignsPage() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [working, setWorking] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    customizationService
      .listMyDesigns()
      .then((d) => alive && setDesigns(d))
      .catch((err) => alive && setError(err.response?.data?.message || "Couldn't load your designs."));
    return () => {
      alive = false;
    };
  }, [reload]);

  const open = (d) => navigate(`/customize/${d.garmentType}?design=${d._id}`);
  const duplicate = async (d) => {
    setWorking(d._id);
    try {
      const copy = await customizationService.duplicateDesign(d._id);
      setReload((n) => n + 1);
      navigate(`/customize/${copy.garmentType}?design=${copy._id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't copy that design.");
    } finally {
      setWorking("");
    }
  };
  const remove = async (d) => {
    setWorking(d._id);
    try {
      await customizationService.deleteDesign(d._id);
      setConfirmDelete(null);
      setDesigns((list) => list.filter((x) => x._id !== d._id));
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't delete that design.");
    } finally {
      setWorking("");
    }
  };

  return (
    <div style={{ background: THEME.bg, minHeight: "70vh" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 20px 64px", fontFamily: THEME.fontBody }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", fontWeight: 800, color: THEME.gold }}>Your account</p>
            <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(26px, 3.4vw, 36px)", fontWeight: 800, color: THEME.text }}>My designs</h1>
            <p style={{ margin: 0, color: THEME.textMuted }}>Designs you saved in the design room. Open one to keep editing or to order it.</p>
          </div>
          <Link to="/customizable" style={{ background: THEME.ink, color: "#fff", borderRadius: 999, padding: "11px 18px", fontWeight: 700, textDecoration: "none" }}>
            + New design
          </Link>
        </div>

        {error && <p style={{ color: THEME.danger, fontWeight: 600 }}>{error}</p>}
        {!designs && !error && <p style={{ color: THEME.textMuted }}>Loading your designs…</p>}
        {designs && designs.length === 0 && (
          <div style={{ border: `1px dashed ${THEME.borderLight}`, borderRadius: 16, padding: 32, textAlign: "center", color: THEME.textMuted }}>
            No saved designs yet. In the design room, press <b>Save</b> to keep a design here.
          </div>
        )}

        {designs && designs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 }}>
            {designs.map((d) => (
              <article key={d._id} style={{ background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <button type="button" onClick={() => setPreview(d._id)} aria-label={`Preview ${d.name}`} style={{ border: 0, padding: 0, background: "#EFE7D7", cursor: "pointer", position: "relative" }}>
                  {d.mockups?.front ? (
                    <img src={d.mockups.front} alt={d.name} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", color: THEME.textMuted, fontSize: 13 }}>No picture</div>
                  )}
                  {d.orderedAt && (
                    <span style={{ position: "absolute", top: 10, left: 10, background: THEME.ink, color: "#F0D585", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", padding: "4px 9px", borderRadius: 999 }}>
                      ORDERED
                    </span>
                  )}
                </button>
                <div style={{ padding: 14, display: "grid", gap: 4, flex: 1 }}>
                  <b style={{ fontSize: 15, color: THEME.text }}>{d.name || "Untitled design"}</b>
                  <span style={{ fontSize: 12.5, color: THEME.textMuted, textTransform: "capitalize" }}>
                    {d.garmentType.replace(/-/g, " ")} · {d.color.replace(/-/g, " ")} · {d.size || "—"} · {d.areaCount} print area{d.areaCount === 1 ? "" : "s"}
                  </span>
                  <span style={{ fontSize: 12, color: THEME.textFaint }}>Saved {when(d.updatedAt)}</span>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => open(d)} style={btn(true)}>{d.orderedAt ? "Edit a copy" : "Open"}</button>
                    <button type="button" onClick={() => duplicate(d)} disabled={working === d._id} style={btn()}>Duplicate</button>
                    {confirmDelete === d._id ? (
                      <>
                        <button type="button" onClick={() => remove(d)} disabled={working === d._id} style={{ ...btn(), color: THEME.danger, borderColor: THEME.danger }}>Yes, delete</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} style={btn()}>Keep</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(d._id)} style={{ ...btn(), color: THEME.danger }}>Delete</button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {preview && <DesignPreview designId={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

const btn = (dark) => ({
  border: `1px solid ${dark ? THEME.ink : THEME.border}`,
  background: dark ? THEME.ink : "#fff",
  color: dark ? "#fff" : THEME.text,
  borderRadius: 999,
  padding: "7px 13px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
});
