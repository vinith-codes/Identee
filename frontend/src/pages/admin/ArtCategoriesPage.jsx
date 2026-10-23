import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchArtCategories,
  deleteArtCategory,
} from "../../redux/slices/artCategorySlice";
import { imageUrl } from "../../utils/imageUrl";


const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
  danger: "#C2503A",
};

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return imageUrl(path.replace(/^\//, ""));
}

// Admin → Art → Design groups: the groups of the free art library and their delete button. (A new group is made in
// "Add many designs", together with its designs — the separate "Add category" form here was taken out, 23 Oct 2026.)
export default function ArtCategoriesPage() {
  const dispatch = useDispatch();
  const { items, isLoading } = useSelector((s) => s.artCategory);
  const [asking, setAsking] = useState(null); // the group waiting for "Yes, delete"
  const [deleteNote, setDeleteNote] = useState({}); // group id → why it can't be deleted
  const removeGroup = async (id) => {
    setAsking(null);
    try {
      await dispatch(deleteArtCategory(id)).unwrap();
    } catch (err) {
      setDeleteNote((n) => ({ ...n, [id]: typeof err === "string" ? err : "That didn't work. Please try again." }));
    }
  };

  useEffect(() => {
    dispatch(fetchArtCategories());
  }, [dispatch]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: "32px 40px", fontFamily: "'Inter', sans-serif" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold }}>Admin</p>
      <h1 style={{ margin: "4px 0 8px", fontSize: 26, fontWeight: 600, fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif" }}>Design groups</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
        To make a new group, use{" "}
        <Link to="/admin/art-bulk-upload" style={{ color: C.gold, fontWeight: 600 }}>
          Add many designs
        </Link>{" "}
        and pick “A new category…”.
      </p>

      {isLoading && <p style={{ color: C.muted }}>Loading…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
        {items.map((c) => (
          <div key={c._id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: "center" }}>
            <img src={imgUrl(c.thumbnail)} alt={c.name} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>{c.name}</p>
            {deleteNote[c._id] && <p role="alert" style={{ margin: "0 0 8px", fontSize: 11, color: C.ink, textAlign: "left", lineHeight: 1.35 }}>{deleteNote[c._id]}</p>}
            {asking === c._id ? (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.ink }}>Delete this group for good?</span>
                <button type="button" onClick={() => removeGroup(c._id)} style={{ width: "100%", padding: "6px 0", borderRadius: 6, border: "none", background: C.danger, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Yes, delete</button>
                <button type="button" onClick={() => setAsking(null)} style={{ width: "100%", padding: "6px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", color: C.ink, fontSize: 11, cursor: "pointer" }}>Keep</button>
              </div>
            ) : (
              <button type="button"
                onClick={() => { setDeleteNote((n) => ({ ...n, [c._id]: "" })); setAsking(c._id); }}
                style={{ width: "100%", padding: "6px 0", borderRadius: 6, border: `1px solid ${C.danger}`, background: "none", color: C.danger, fontSize: 11, cursor: "pointer" }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
