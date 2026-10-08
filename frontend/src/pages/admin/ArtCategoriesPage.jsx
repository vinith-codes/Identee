import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchArtCategories,
  createArtCategory,
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

export default function ArtCategoriesPage() {
  const dispatch = useDispatch();
  const { items, isLoading } = useSelector((s) => s.artCategory);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    dispatch(fetchArtCategories());
  }, [dispatch]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim() || !file) return;
    dispatch(createArtCategory({ name: name.trim(), thumbnailFile: file }));
    setName("");
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: "32px 40px", fontFamily: "'Inter', sans-serif" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold }}>Admin</p>
      <h1 style={{ margin: "4px 0 24px", fontSize: 26, fontWeight: 600, fontFamily: "'Cormorant Garamond', serif" }}>Art Categories</h1>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 12, marginBottom: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name (e.g. Marvel, Anime)"
          style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 13, minWidth: 240 }}
        />
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 12, cursor: "pointer" }}>
            {preview ? "Change Thumbnail" : "Choose Thumbnail"}
          </button>
        </div>
        {preview && <img src={preview} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />}
        <button type="submit" style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: C.gold, color: "#0B0B0C", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          Add Category
        </button>
      </form>

      {isLoading && <p style={{ color: C.muted }}>Loading…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
        {items.map((c) => (
          <div key={c._id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: "center" }}>
            <img src={imgUrl(c.thumbnail)} alt={c.name} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>{c.name}</p>
            <button
              onClick={() => dispatch(deleteArtCategory(c._id))}
              style={{ width: "100%", padding: "6px 0", borderRadius: 6, border: `1px solid ${C.danger}`, background: "none", color: C.danger, fontSize: 11, cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}