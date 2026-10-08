import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchArtCategories } from "../../redux/slices/artCategorySlice";
import {
  fetchAllArtDesignsAdmin,
  createArtDesign,
  deleteArtDesign,
} from "../../redux/slices/artDesignSlice";
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

export default function ArtDesignsPage() {
  const dispatch = useDispatch();
  const { items: categories } = useSelector((s) => s.artCategory);
  const { adminItems: designs, isUploading } = useSelector((s) => s.artDesign);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    dispatch(fetchArtCategories());
    dispatch(fetchAllArtDesignsAdmin());
  }, [dispatch]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) setCategoryId(categories[0]._id);
  }, [categories, categoryId]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim() || !categoryId || price === "" || !file) return;
    dispatch(createArtDesign({ name: name.trim(), category: categoryId, price, imageFile: file }));
    setName("");
    setPrice("");
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, padding: "32px 40px", fontFamily: "'Inter', sans-serif" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold }}>Admin</p>
      <h1 style={{ margin: "4px 0 24px", fontSize: 26, fontWeight: 600, fontFamily: "'Cormorant Garamond', serif" }}>Art Designs</h1>

      {categories.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
          No categories yet — add one from Admin → Art Categories first.
        </p>
      )}

      {categories.length > 0 && (
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 12, marginBottom: 28, alignItems: "center", flexWrap: "wrap" }}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 13 }}>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Design name (e.g. Iron Man Mask)"
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 13, minWidth: 220 }}
          />
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price (₹)"
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 13, width: 110 }}
          />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.ink, fontSize: 12, cursor: "pointer" }}>
            {preview ? "Change Image" : "Choose Image"}
          </button>
          {preview && <img src={preview} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />}
          <button type="submit" disabled={isUploading} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: C.gold, color: "#0B0B0C", fontWeight: 700, fontSize: 12, cursor: isUploading ? "wait" : "pointer" }}>
            {isUploading ? "Uploading…" : "Add Design"}
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
        {designs.map((d) => (
          <div key={d._id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: "center" }}>
            <img src={imgUrl(d.imageUrl)} alt={d.name} style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: 8, marginBottom: 10, background: "#fff" }} />
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600 }}>{d.name}</p>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: C.muted }}>{d.category?.name}</p>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.gold }}>₹{d.price}</p>
            <button
              onClick={() => dispatch(deleteArtDesign(d._id))}
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