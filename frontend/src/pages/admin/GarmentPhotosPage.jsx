// pages/admin/GarmentPhotosPage.jsx
import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../../redux/slices/garmentTypeSlice";
import {
  fetchAllGarmentImages,
  uploadGarmentViewPhoto,
  updatePrintArea,
} from "../../redux/slices/garmentImageSlice";
import { imageUrl } from "../../utils/imageUrl";


const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
};

const VIEWS = [
  { key: "front", label: "FRONT" },
  { key: "back", label: "BACK" },
  { key: "right", label: "RIGHT" },
  { key: "left", label: "LEFT" },
];

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return imageUrl(path.replace(/^\//, ""));
}

export default function GarmentPhotosPage() {
  const dispatch = useDispatch();
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: colorImages, isUploading } = useSelector(
    (s) => s.garmentImage,
  );

  const [garmentKey, setGarmentKey] = useState("");
  const [colorSlug, setColorSlug] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");

  useEffect(() => {
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
  }, [dispatch]);

  useEffect(() => {
    if (garmentTypes.length > 0 && !garmentKey) {
      setGarmentKey(garmentTypes[0].key);
    }
  }, [garmentTypes, garmentKey]);

  // slugify color name as they type — this becomes colorSlug
  useEffect(() => {
    const slug = colorName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setColorSlug(slug);
  }, [colorName]);

  const doc = colorImages.find(
    (d) => d.garmentType === garmentKey && d.colorSlug === colorSlug,
  );

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
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        Garment Photos
      </h1>

      <div
        style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "wrap" }}
      >
        <div>
          <label style={labelStyle}>Garment Type</label>
          <select
            value={garmentKey}
            onChange={(e) => setGarmentKey(e.target.value)}
            style={selectStyle}
          >
            {garmentTypes.length === 0 && (
              <option value="">No garment types yet — add one first</option>
            )}
            {garmentTypes.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Color Name</label>
          <input
            value={colorName}
            onChange={(e) => setColorName(e.target.value)}
            placeholder="e.g. Acid Washed Black"
            style={selectStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Color Swatch</label>
          <input
            type="color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            style={{
              width: 46,
              height: 42,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 2,
              background: "none",
            }}
          />
        </div>
      </div>

      {!colorName && (
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
         
        </p>
      )}

      {garmentKey && colorName && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {VIEWS.map((v) => (
            <ViewUploadCard
              key={v.key}
              viewKey={v.key}
              label={v.label}
              imageUrl={doc?.[v.key]?.imageUrl}
              printArea={doc?.[v.key]?.printArea}
              isUploading={isUploading}
              onUpload={(file) =>
                dispatch(
                  uploadGarmentViewPhoto({
                    garmentType: garmentKey,
                    colorSlug,
                    colorName,
                    colorHex,
                    view: v.key,
                    file,
                  }),
                )
              }
              onSavePrintArea={(printArea) =>
                dispatch(
                  updatePrintArea({
                    garmentType: garmentKey,
                    colorSlug,
                    view: v.key,
                    printArea,
                  }),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewUploadCard({
  viewKey,
  label,
  imageUrl,
  printArea,
  isUploading,
  onUpload,
  onSavePrintArea,
}) {
  const fileInputRef = useRef(null);
  const boxRef = useRef(null);
  const [box, setBox] = useState(
    printArea || { x: 22, y: 27, width: 56, height: 58 },
  );
  const dragRef = useRef(null);

  useEffect(() => {
    if (printArea) setBox(printArea);
  }, [printArea]);

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

 const handleFileChange = (e) => {
  console.log("FILE SELECTED:", e.target.files); // 🆕 ADD THIS LINE
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) onUpload(file);
};

  const handleMouseDown = (mode) => (e) => {
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startBox: box,
    };
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current || !boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
      const { mode, startBox } = dragRef.current;
      if (mode === "move") {
        setBox({
          ...startBox,
          x: clamp(startBox.x + dxPct, 0, 100 - startBox.width),
          y: clamp(startBox.y + dyPct, 0, 100 - startBox.height),
        });
      } else {
        setBox({
          ...startBox,
          width: clamp(startBox.width + dxPct, 5, 100 - startBox.x),
          height: clamp(startBox.height + dyPct, 5, 100 - startBox.y),
        });
      }
    };
    const handleUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        onSavePrintArea(box);
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [box]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: C.gold,
        }}
      >
        {label}
      </p>
      <div
        ref={boxRef}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4/5",
          background: "#1F1F22",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {imageUrl ? (
          <>
            <img
              src={imgUrl(imageUrl)}
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            <div
              onMouseDown={handleMouseDown("move")}
              style={{
                position: "absolute",
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                border: `1.5px dashed ${C.gold}`,
                cursor: "move",
                boxSizing: "border-box",
              }}
            >
              <div
                onMouseDown={handleMouseDown("resize")}
                style={{
                  position: "absolute",
                  right: -6,
                  bottom: -6,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.gold,
                  border: "2px solid #0B0B0C",
                  cursor: "nwse-resize",
                }}
              />
            </div>
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.muted,
              fontSize: 12,
            }}
          >
            No photo yet
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "10px 0",
          borderRadius: 8,
          border: "none",
          background: C.gold,
          color: "#0B0B0C",
          fontWeight: 700,
          fontSize: 12,
          cursor: isUploading ? "wait" : "pointer",
        }}
      >
        {isUploading
          ? "Uploading…"
          : imageUrl
            ? "Replace Photo"
            : "Upload Photo"}
      </button>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.muted,
  marginBottom: 6,
};
const selectStyle = {
  padding: "10px 14px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.panel,
  color: C.ink,
  fontSize: 13,
  minWidth: 200,
};
