// Wizard step 5: all 15 print areas from the print guide.
// Click an area to see it on the garment photo; turn on the ones customers
// can use. Areas without a size in the guide need a size (cm) first.
// The blue dashed box is the print zone for that side — drag it (or its
// corner) to line it up with the photo; it's saved for every colour.
// The two red lines (front view) are the photo ruler: shoulder top and hem.
// With the size chart they give the real cm scale for every size, so the
// preview — here and in the customizer — is true to size.
import { useMemo, useRef, useState } from "react";
import garmentImageService from "../../../services/garmentImageService";
import { imageUrl } from "../../../utils/imageUrl";
import { resolvePrintBoxes, rulerPerCm } from "../../../utils/printLayout";
import { AW } from "./wizardStyles";
import SaveRow from "./SaveRow";

const VIEW_GROUPS = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left sleeve"],
  ["right", "Right sleeve"],
];
const SIZE_GROUPS = [
  ["small", ["XS", "S"], -4],
  ["standard", ["M", "L", "XL"], 0],
  ["large", ["2XL", "3XL"], 4],
];
const ALL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const groupOf = (size) => SIZE_GROUPS.find((g) => g[1].includes(size))?.[0] || "standard";
const stepOf = (g) => SIZE_GROUPS.find((x) => x[0] === g)[2];
// [w, h] at M–XL -> cm per size range (print-guide rule: ±4 cm)
const groupCm = (w, h) =>
  Object.fromEntries(SIZE_GROUPS.map(([g, , step]) => [g, [Math.max(2, w + step), Math.max(2, h + step)]]));
// Starting ruler for the generated IDENTEE photos (800×1000 canvas: shoulder
// top y=236, hem y=876 — server/scripts/garment-images/oversized_calibration.json).
const DEFAULT_RULER = { topPct: 23.6, hemPct: 87.6 };
const DEFAULT_ZONE = {
  front: { x: 36, y: 27, width: 28, height: 25.6 },
  back: { x: 31, y: 24, width: 38, height: 33.6 },
  left: { x: 44, y: 30, width: 12, height: 10.7 },
  right: { x: 44, y: 30, width: 12, height: 10.7 },
};
const isUnset = (a) =>
  !a || (Math.round(a.x) === 22 && Math.round(a.y) === 27 && Math.round(a.width) === 56 && Math.round(a.height) === 58);
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const sized = (a) => Number(a.width) >= 2 && Number(a.height) >= 2;

export default function PrintAreasStep({ garment, catalog, images, save, saving, next }) {
  const [draft, setDraft] = useState(() =>
    catalog.map((a) => ({
      key: a.key,
      offered: a.offered,
      width: a.cm ? a.cm.standard[0] : "",
      height: a.cm ? a.cm.standard[1] : "",
    })),
  );
  const [selected, setSelected] = useState("centre-front");
  const sizes = garment.sizes?.length ? garment.sizes : ALL_SIZES;
  const [previewSize, setPreviewSize] = useState(sizes.includes("M") ? "M" : sizes[0]);
  const group = groupOf(previewSize);
  const savedRuler = garment.photoRuler?.topPct != null ? garment.photoRuler : null;
  const [rulerDraft, setRulerDraft] = useState(null); // unsaved ruler being dragged
  const ruler = rulerDraft || savedRuler || DEFAULT_RULER;
  const chartRow = garment.sizeChart?.find((r) => r.size === previewSize);
  const perCm = rulerPerCm(ruler, chartRow?.length);
  const [zones, setZones] = useState({}); // side -> zone being edited (unsaved)
  const [zoneMsg, setZoneMsg] = useState("");
  const [zoneSaving, setZoneSaving] = useState(false);
  const [savedZones, setSavedZones] = useState({}); // side -> zone saved in this visit

  const info = (key) => catalog.find((a) => a.key === key);
  const row = (key) => draft.find((d) => d.key === key);
  const sel = info(selected);
  const selRow = row(selected);
  const view = sel.side;

  const setRow = (key, patch) => setDraft((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // The colour doc whose photo we show: first colour with a photo for this view.
  const colourDoc = useMemo(() => {
    const docs = images.filter((d) => d.garmentType === garment.key);
    for (const c of garment.colors) {
      const d = docs.find((x) => x.colorSlug === c.slug);
      if (d?.[view]?.imageUrl) return d;
    }
    return null;
  }, [images, garment, view]);

  const savedZone = savedZones[view] || colourDoc?.[view]?.printArea;
  const zone = zones[view] || (isUnset(savedZone) ? DEFAULT_ZONE[view] : savedZone);

  // Positions in the customizer's shape, from the current (unsaved) draft.
  const positions = draft
    .filter((d) => (d.offered || d.key === selected) && sized(d))
    .map((d) => {
      const a = info(d.key);
      return { key: a.key, label: a.label, side: a.side, main: a.main, place: a.place, cm: groupCm(Number(d.width), Number(d.height)) };
    });
  const scales = Object.fromEntries(
    catalog.filter((a) => a.main).map((a) => {
      const d = row(a.key);
      return [a.side, sized(d) ? [Number(d.width), Number(d.height)] : a.guideCm];
    }),
  );
  const previewDoc = { [view]: { printArea: zone } };
  const boxes = resolvePrintBoxes(positions.filter((p) => p.side === view), previewDoc, scales, { group, perCm });

  /* ---- drag the zone ---- */
  const drag = useRef(null);
  // data-drag="move" on the zone, "resize" on its corner handle,
  // "ruler-top" / "ruler-hem" on the ruler lines
  const onPointerDown = (e) => {
    const mode = e.target.dataset.drag;
    if (!mode) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = mode.startsWith("ruler") ? ruler : zone;
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start, rect: e.currentTarget.getBoundingClientRect() };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dy = ((e.clientY - d.sy) / d.rect.height) * 100;
    const s = d.start;
    if (d.mode === "ruler-top") {
      setRulerDraft({ ...s, topPct: clamp(s.topPct + dy, 0, s.hemPct - 20) });
      return;
    }
    if (d.mode === "ruler-hem") {
      setRulerDraft({ ...s, hemPct: clamp(s.hemPct + dy, s.topPct + 20, 100) });
      return;
    }
    const next =
      d.mode === "move"
        ? { ...s, x: clamp(s.x + dx, 0, 100 - s.width), y: clamp(s.y + dy, 0, 100 - s.height) }
        : { ...s, width: clamp(s.width + dx, 4, 100 - s.x), height: clamp(s.height + dy, 4, 100 - s.y) };
    setZones((z) => ({ ...z, [view]: next }));
    setZoneMsg("");
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const saveZone = async () => {
    setZoneSaving(true);
    try {
      const r = await garmentImageService.updatePrintAreaAllColours(garment.key, view, zones[view]);
      setSavedZones((z) => ({ ...z, [view]: r.printArea }));
      setZones((z) => {
        const copy = { ...z };
        delete copy[view];
        return copy;
      });
      setZoneMsg(`Saved for ${r.updated} colour${r.updated === 1 ? "" : "s"}`);
    } catch (err) {
      setZoneMsg(err.response?.data?.message || "Could not save the print zone.");
    } finally {
      setZoneSaving(false);
    }
  };

  const saveRuler = async () => {
    const ok = await save({ photoRuler: ruler }, "Photo ruler saved — previews are now true to size");
    if (ok) setRulerDraft(null);
  };

  const offeredCount = draft.filter((d) => d.offered).length;
  const cmText = (d, g) => {
    if (!sized(d)) return "size not set";
    const step = stepOf(g);
    return `${Math.max(2, Number(d.width) + step)} × ${Math.max(2, Number(d.height) + step)} cm`;
  };

  const submit = async () => {
    const ok = await save(
      {
        printAreas: draft.map((d) => ({
          key: d.key,
          offered: d.offered,
          width: d.width === "" ? null : Number(d.width),
          height: d.height === "" ? null : Number(d.height),
        })),
      },
      "Print areas saved",
    );
    if (ok) next();
  };

  return (
    <div>
      <h2 style={AW.h2}>5. Print areas</h2>
      <p style={AW.lead}>
        All 15 places from your print guide. Click an area to see it on the garment; turn on the ones customers can use.{" "}
        <b>{offeredCount} offered.</b>
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "14px 0 4px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#5C5547" }}>Preview size</span>
        {sizes.map((sz) => (
          <button key={sz} type="button" className={`aw-chip${previewSize === sz ? " on" : ""}`} onClick={() => setPreviewSize(sz)}>
            {sz}
          </button>
        ))}
      </div>
      <p className="aw-help" style={{ marginTop: 2 }}>
        {chartRow?.length
          ? `${previewSize}: length ${chartRow.length}″ — boxes are drawn to scale for this size${savedRuler ? "" : " (once the photo ruler is saved)"}.`
          : "Fill in the size chart (step 2) to see true-to-size boxes."}
      </p>

      <div className="aw-areas" style={{ marginTop: 12 }}>
        {/* area list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {VIEW_GROUPS.map(([side, title]) => (
            <div key={side}>
              <span className="aw-lbl">{title}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {catalog
                  .filter((a) => a.side === side)
                  .map((a) => {
                    const d = row(a.key);
                    const state = d.offered ? "on" : sized(d) ? "off" : "nosize";
                    return (
                      <button key={a.key} type="button" className={`aw-area${selected === a.key ? " sel" : ""}`} onClick={() => setSelected(a.key)}>
                        <span>
                          {a.label}
                          <span style={{ display: "block", fontSize: 11.5, color: "#6B6559", fontWeight: 500 }}>{cmText(d, group)}</span>
                        </span>
                        <span className={`state ${state}`}>{state === "on" ? "Offered" : state === "off" ? "Off" : "Needs size"}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* preview + detail */}
        <div style={{ position: "sticky", top: 80 }}>
          <div
            style={{ position: "relative", aspectRatio: "4 / 5", background: "#F3EEE2", borderRadius: 14, overflow: "hidden", touchAction: "none", userSelect: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {colourDoc ? (
              <img src={imageUrl(colourDoc[view].imageUrl, 700)} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#A39C8C", fontSize: 13 }}>
                No {view} photo yet — add one in step 4
              </span>
            )}

            {/* print zone for this side (drag to line up) */}
            <div
              data-drag="move"
              title="Drag to move the print zone"
              style={{
                position: "absolute",
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                border: "2px dashed #3D7BFF",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.75)", // visible on dark garments too
                background: "rgba(61,123,255,0.08)",
                cursor: "move",
              }}
            >
              <span
                data-drag="resize"
                title="Drag to resize"
                style={{ position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: "50%", background: "#2E5AAC", border: "2px solid #fff", cursor: "nwse-resize" }}
              />
            </div>

            {/* print boxes */}
            {Object.entries(boxes).map(([k, b]) => {
              const isSel = k === selected;
              const offered = row(k).offered;
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: `${b.left}%`,
                    top: `${b.top}%`,
                    width: `${b.width}%`,
                    height: `${b.height}%`,
                    border: isSel ? "2px solid #C9A24B" : "1px solid rgba(20,17,16,0.45)",
                    background: isSel ? "rgba(201,162,75,0.28)" : offered ? "rgba(255,255,255,0.25)" : "transparent",
                    borderStyle: offered || isSel ? "solid" : "dotted",
                    pointerEvents: "none",
                    boxSizing: "border-box",
                  }}
                />
              );
            })}

            {/* photo ruler: shoulder top + hem, measured on the front photo */}
            {view === "front" &&
              [
                ["ruler-top", ruler.topPct, "Shoulder top"],
                ["ruler-hem", ruler.hemPct, "Hem"],
              ].map(([mode, pct, label]) => (
                <div
                  key={mode}
                  data-drag={mode}
                  title={`Drag to the ${label.toLowerCase()} line`}
                  style={{ position: "absolute", left: 0, right: 0, top: `calc(${pct}% - 8px)`, height: 16, cursor: "ns-resize" }}
                >
                  <div style={{ position: "absolute", left: 0, right: 0, top: 7, borderTop: "2px dashed #D9412B", pointerEvents: "none" }} />
                  <span
                    style={{ position: "absolute", left: 6, top: mode === "ruler-top" ? -14 : 12, fontSize: 10.5, fontWeight: 800, color: "#fff", background: "#D9412B", padding: "1px 6px", borderRadius: 4, pointerEvents: "none" }}
                  >
                    {label}
                  </span>
                </div>
              ))}
          </div>

          {view === "front" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              {(rulerDraft || !savedRuler) && (
                <button type="button" className="aw-btn light" onClick={saveRuler} disabled={saving}>
                  Save photo ruler
                </button>
              )}
              <span className="aw-help" style={{ margin: 0 }}>
                {savedRuler && !rulerDraft
                  ? "Red lines = photo ruler (saved). Previews are true to size."
                  : "Red lines = photo ruler: drag them to the top of the shoulder and the bottom hem, then save. This makes every size's preview true to scale."}
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            {zones[view] && (
              <button type="button" className="aw-btn light" onClick={saveZone} disabled={zoneSaving || !colourDoc}>
                {zoneSaving ? "Saving…" : "Save print zone for all colours"}
              </button>
            )}
            <span className="aw-help" style={{ margin: 0 }}>
              {zoneMsg || "Blue box = print zone for this side. Drag it, or its corner, to line it up."}
            </span>
          </div>

          <div className="aw-card" style={{ padding: 16, marginTop: 12, background: "#FBF8F1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span>
                <b style={{ fontSize: 15 }}>{sel.label}</b>
                <span style={{ display: "block", fontSize: 12.5, color: "#6B6559" }}>
                  {sel.guideCm ? `Print guide: ${sel.guideCm[0]} × ${sel.guideCm[1]} cm (M–XL)` : "No size in the print guide yet"}
                </span>
              </span>
              <button
                type="button"
                className={`aw-chip${selRow.offered ? " on" : ""}`}
                disabled={!sized(selRow)}
                onClick={() => setRow(selected, { offered: !selRow.offered })}
                title={sized(selRow) ? "" : "Enter a size first"}
              >
                {selRow.offered ? "Offered ✓" : "Offer this area"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label>
                <span className="aw-lbl">Width (cm)</span>
                <input className="aw-inp small" style={{ width: 90 }} type="number" min="2" max="80" value={selRow.width} onChange={(e) => setRow(selected, { width: e.target.value })} />
              </label>
              <label>
                <span className="aw-lbl">Height (cm)</span>
                <input className="aw-inp small" style={{ width: 90 }} type="number" min="2" max="80" value={selRow.height} onChange={(e) => setRow(selected, { height: e.target.value })} />
              </label>
              <span className="aw-help" style={{ flex: "1 1 180px", margin: 0 }}>
                Size for M–XL. XS–S is 4 cm smaller and 2XL–3XL 4 cm larger (print guide rule).
              </span>
            </div>
            {!sel.main && (
              <p className="aw-help">Position is approximate until the print team confirms where each print starts.</p>
            )}
          </div>
        </div>
      </div>

      <SaveRow saving={saving} onSave={submit} disabled={offeredCount === 0} />
    </div>
  );
}
