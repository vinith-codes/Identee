// components/DesignPreview.jsx
//
// A pop-up showing a saved design as the customer made it: mockup pictures
// of each side (front / back / left / right) from the 3D Design Room, plus
// the details (garment, colour, size, print areas). Used by My designs and
// by the order page.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import customizationService from "../services/customizationService";
import { THEME } from "../theme/theme";

const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left sleeve"],
  ["right", "Right sleeve"],
];
const AREA_NAMES = {
  "centre-front": "Centre Front", "left-chest": "Left Chest", "right-chest": "Right Chest", "full-back": "Full Back",
  "left-sleeve": "Left Sleeve", "right-sleeve": "Right Sleeve", "full-front": "Full Front", "vertical-front": "Vertical Front",
  "front-right-vertical": "Front Right Vertical", "lower-left": "Lower Left", "lower-right": "Lower Right", "top-back": "Top Back",
  "centre-back": "Centre Back", "lower-back": "Lower Back", "vertical-back": "Vertical Back",
};

/**
 * @param {string} designId  customization id
 * @param {() => void} onClose
 * @param {object} [extra]   e.g. { size, qty } from an order line
 */
export default function DesignPreview({ designId, onClose, extra }) {
  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");
  const [side, setSide] = useState("front");

  useEffect(() => {
    let alive = true;
    customizationService
      .getCustomizationById(designId)
      .then((d) => alive && setDesign(d))
      .catch(() => alive && setError("This design couldn't be loaded."));
    return () => {
      alive = false;
    };
  }, [designId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mockups = design?.mockups || {};
  const available = SIDES.filter(([k]) => mockups[k]);
  const current = mockups[side] ? side : available[0]?.[0];
  const areas = design ? [...new Set(design.elements.map((e) => e.position))] : [];

  return (
    <div role="dialog" aria-modal="true" aria-label="Design preview" onClick={onClose} style={sx.backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={sx.card}>
        <div style={sx.head}>
          <div>
            <p style={sx.eyebrow}>Your design</p>
            <h2 style={sx.title}>{design?.name || "Custom design"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={sx.close}>✕</button>
        </div>

        {error && <p style={{ color: THEME.danger }}>{error}</p>}
        {!design && !error && <p style={{ color: THEME.textMuted }}>Loading…</p>}

        {design && (
          <div style={sx.body}>
            <div style={{ minWidth: 0 }}>
              {current ? (
                <img src={mockups[current]} alt={`${design.name || "Design"} — ${current}`} style={sx.big} />
              ) : (
                <div style={{ ...sx.big, display: "grid", placeItems: "center", color: THEME.textMuted, fontSize: 13, textAlign: "center", padding: 20, boxSizing: "border-box" }}>
                  No picture for this design — it was made before pictures were saved.
                </div>
              )}
              {available.length > 1 && (
                <div style={sx.thumbs}>
                  {available.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setSide(k)} style={{ ...sx.thumb, borderColor: k === current ? THEME.ink : THEME.border }} aria-label={`Show ${label}`}>
                      <img src={mockups[k]} alt="" style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block" }} />
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <dl style={sx.facts}>
              <Fact label="Garment" value={design.garmentType.replace(/-/g, " ")} />
              <Fact label="Colour" value={design.color.replace(/-/g, " ")} />
              <Fact label="Size" value={extra?.size || design.size || "—"} />
              {extra?.qty ? <Fact label="Quantity" value={extra.qty} /> : null}
              <Fact label="Print areas" value={areas.map((a) => AREA_NAMES[a] || a).join(", ") || "—"} />
              <Fact label="Elements" value={`${design.elements.length} (${design.elements.filter((e) => e.type === "text").length} text, ${design.elements.filter((e) => e.type === "image").length} image)`} />
              {design.orderedAt && <Fact label="Status" value="Ordered — locked" />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <Link to={`/customize/${design.garmentType}?design=${design._id}`} style={sx.btn}>
                  {design.orderedAt ? "Edit as a new design" : "Open in design room"}
                </Link>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <dt style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: THEME.textMuted }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: THEME.text, textTransform: label === "Garment" || label === "Colour" ? "capitalize" : "none" }}>{value}</dd>
    </div>
  );
}

const sx = {
  backdrop: { position: "fixed", inset: 0, zIndex: 2000, background: "rgba(20,17,16,.55)", display: "grid", placeItems: "center", padding: 16 },
  card: { width: "min(860px, 100%)", maxHeight: "100%", overflowY: "auto", background: "#FBF8F1", borderRadius: 20, padding: 20, boxSizing: "border-box", fontFamily: THEME.fontBody },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", fontWeight: 800, color: THEME.goldDeep },
  title: { margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: THEME.text },
  close: { border: 0, background: "#E2D8C3", width: 34, height: 34, borderRadius: "50%", fontSize: 16, cursor: "pointer", flexShrink: 0 },
  body: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 20, alignItems: "start" },
  big: { width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 14, background: "#EFE7D7", display: "block" },
  thumbs: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 8 },
  thumb: { padding: 0, border: "2px solid", borderRadius: 10, overflow: "hidden", background: "#fff", cursor: "pointer", display: "grid", gap: 2, paddingBottom: 4 },
  facts: { margin: 0, display: "grid", gap: 12 },
  btn: { display: "inline-block", background: THEME.ink, color: "#fff", borderRadius: 999, padding: "10px 16px", fontWeight: 700, fontSize: 13, textDecoration: "none" },
};
