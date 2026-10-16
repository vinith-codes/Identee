// Admin → Orders → "Designs & print files"
// Shows the custom designs in one order (previews, colour, sizes × qty,
// print areas with their real size) and downloads the 300-DPI print files
// as a ZIP for the print team (made in this browser — studio/printFiles.js).
import { useEffect, useRef, useState } from "react";
import customizationService from "../../services/customizationService";
import aiService from "../../services/aiService";
import { imageUrl } from "../../utils/imageUrl";
import { THEME, labelStyle } from "../../theme/theme";

const SIDES = ["front", "back", "left", "right"];
const GOOD_DPI = 250; // close enough to 300 that enlarging adds nothing worth paying for
const LOW_DPI = 150; // below this a picture may print blurry
const full = (src) => (/^https?:\/\//.test(src) ? src : imageUrl(src));

// The customer's original and the enlarged copy side by side, to check before printing that nothing
// was changed. Both move together: zoom with the buttons or the mouse wheel, drag to look around.
function ComparePictures({ original, enlarged, tee, onClose }) {
  const [view, setView] = useState({ z: 1, x: 0, y: 0 }); // zoom, and how far the picture is moved (% of the pane)
  const [px, setPx] = useState({}); // which -> pixel width of the file
  const drag = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const limit = (v, z) => {
    const m = ((z - 1) / z) * 50; // how far it can move before an edge shows
    return Math.max(-m, Math.min(m, v));
  };
  const zoomTo = (z) => setView((v) => ({ z, x: limit(v.x, z), y: limit(v.y, z) }));
  const panes = [
    ["original", "The customer’s original", original],
    ["enlarged", "The enlarged copy (this one is printed)", enlarged],
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare the original with the enlarged copy"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(20,17,16,.82)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: THEME.surface, borderRadius: 14, width: "min(1180px, 100%)", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>Compare before printing</b>
          <span style={{ fontSize: 12.5, color: THEME.textMuted }}>Zoom in and drag — both pictures move together.</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => zoomTo(z)}
                aria-pressed={view.z === z}
                style={{ border: `1px solid ${view.z === z ? THEME.ink : THEME.border}`, background: view.z === z ? THEME.ink : "#fff", color: view.z === z ? "#fff" : THEME.text, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
              >
                {z === 1 ? "Whole" : `${z}×`}
              </button>
            ))}
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: THEME.textMuted, marginLeft: 6 }}>
              ×
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2, background: THEME.border, minHeight: 0, overflow: "auto" }}>
          {panes.map(([key, label, src]) => (
            <div key={key} style={{ background: THEME.surface, minWidth: 0 }}>
              <div style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{label}</span>
                <span style={{ color: THEME.textMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{px[key] ? `${px[key].toLocaleString("en-IN")} px wide` : ""}</span>
              </div>
              <div
                onWheel={(e) => zoomTo(Math.max(1, Math.min(8, view.z * (e.deltaY < 0 ? 1.25 : 0.8))))}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, w: e.currentTarget.clientWidth, h: e.currentTarget.clientHeight };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  setView((v) => ({ z: v.z, x: limit(d.x + ((e.clientX - d.sx) / d.w / v.z) * 100, v.z), y: limit(d.y + ((e.clientY - d.sy) / d.h / v.z) * 100, v.z) }));
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onDoubleClick={() => zoomTo(view.z > 1 ? 1 : 4)}
                style={{ height: "min(62vh, 560px)", overflow: "hidden", background: tee || THEME.surface2, cursor: view.z > 1 ? "grab" : "zoom-in", touchAction: "none", userSelect: "none" }}
              >
                <img
                  src={src}
                  alt={label}
                  draggable={false}
                  onLoad={(e) => {
                    const w = e.currentTarget.naturalWidth;
                    setPx((p) => ({ ...p, [key]: w }));
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${view.z}) translate(${view.x}%, ${view.y}%)`, transformOrigin: "center", imageRendering: view.z >= 4 ? "pixelated" : "auto", pointerEvents: "none" }}
                />
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, padding: "10px 16px", fontSize: 12.5, color: THEME.textMuted, borderTop: `1px solid ${THEME.border}` }}>
          Look at faces, small lettering and thin lines. If anything changed, close this and press “Print the original instead”. Shown on the tee’s colour.
        </p>
      </div>
    </div>
  );
}

// The pictures in one ordered design, each with how sharp it will print (dots per inch at its real print
// size) and a button to have a large copy made for printing. One row per picture.
function PrintPictures({ design, price, onChanged }) {
  const [sizes, setSizes] = useState({}); // src -> pixel width of the file
  const [busy, setBusy] = useState(null); // index being enlarged
  const [compare, setCompare] = useState(null); // index of the picture being compared with its original
  const [error, setError] = useState("");
  const rows = design.elements.map((el, index) => ({ el, index })).filter(({ el }) => el.type === "image" && el.src);
  if (!rows.length) return null;

  const enlarge = async (index) => {
    setError("");
    setBusy(index);
    try {
      const res = await aiService.printPicture({ designId: design._id, index });
      onChanged(index, res.printSrc);
    } catch (err) {
      setError(err.response?.data?.message || "The picture could not be enlarged. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const printOriginal = async (index) => {
    setError("");
    try {
      await aiService.dropPrintPicture({ designId: design._id, index });
      onChanged(index, null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not switch back to the original.");
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ ...labelStyle, margin: "0 0 6px" }}>Pictures · how sharp they will print</p>
      {rows.map(({ el, index }) => {
        const area = design.areas.find((a) => a.key === el.position);
        // the largest size this area is printed at in this order
        const cmWide = Math.max(0, ...(area?.files || []).map((f) => f.cm[0]));
        const printCm = ((el.width || 0) / 100) * cmWide;
        const shown = el.printSrc || el.src;
        const px = sizes[shown];
        const dpi = px && printCm ? Math.round(px / (printCm / 2.54)) : null;
        const tone = dpi == null ? THEME.textMuted : dpi >= GOOD_DPI ? "#24522F" : dpi >= LOW_DPI ? "#7A5B12" : THEME.danger;
        const word = dpi == null ? "measuring…" : dpi >= GOOD_DPI ? "sharp" : dpi >= LOW_DPI ? "acceptable" : "low, may print soft";
        return (
          <div key={index} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
            <a href={full(shown)} target="_blank" rel="noreferrer" title="Open the picture that will be printed">
              <img
                src={full(shown)}
                alt=""
                loading="lazy"
                onLoad={(e) => {
                  const w = e.currentTarget.naturalWidth;
                  setSizes((s) => (s[shown] === w ? s : { ...s, [shown]: w }));
                }}
                style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, background: design.colour.hex || THEME.surface2, border: `1px solid ${THEME.border}` }}
              />
            </a>
            <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13 }}>
              <b>{area?.label || el.position}</b>
              <span style={{ color: THEME.textMuted }}> · {printCm ? `${printCm.toFixed(1)} cm wide` : "size unknown"}</span>
              <div style={{ color: tone, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {dpi != null ? `${dpi} DPI — ${word}` : word}
                {el.printSrc && <span style={{ color: "#24522F" }}> · enlarged ✓</span>}
              </div>
              {el.printSrc && (
                <button type="button" onClick={() => setCompare(index)} style={{ marginTop: 4, background: THEME.goldBg, border: `1px solid ${THEME.goldBorder}`, borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, color: THEME.goldDeep, cursor: "pointer" }}>
                  Compare with the original
                </button>
              )}
            </div>
            {busy === index ? (
              <span style={{ fontSize: 13, color: THEME.textMuted }}>Enlarging… about half a minute</span>
            ) : el.printSrc ? (
              <button type="button" onClick={() => printOriginal(index)} disabled={busy != null} style={{ background: "none", border: `1px solid ${THEME.border}`, borderRadius: 9, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: THEME.text }}>
                Print the original instead
              </button>
            ) : (
              dpi != null &&
              dpi < GOOD_DPI && (
                <button type="button" onClick={() => enlarge(index)} disabled={busy != null} style={{ background: THEME.ink, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy != null ? "not-allowed" : "pointer", opacity: busy != null ? 0.5 : 1 }}>
                  Enlarge for print{price ? ` · about ₹${price}` : ""}
                </button>
              )
            )}
          </div>
        );
      })}
      {error && <p style={{ margin: "6px 0 0", color: THEME.danger, fontSize: 13, fontWeight: 600 }}>{error}</p>}
      {compare != null && design.elements[compare]?.printSrc && (
        <ComparePictures original={full(design.elements[compare].src)} enlarged={full(design.elements[compare].printSrc)} tee={design.colour.hex} onClose={() => setCompare(null)} />
      )}
      <p style={{ margin: "6px 0 0", fontSize: 12, color: THEME.textMuted }}>
        300 DPI is ideal; 150 or more is usually fine on fabric. Enlarging has the picture redrawn about four times larger by the AI — always compare it with the original before printing.
      </p>
    </div>
  );
}

export default function OrderDesignsModal({ orderId, onClose }) {
  const [pack, setPack] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // { done, total, label }
  const [result, setResult] = useState(null); // { fileName, warnings }
  const [printPrice, setPrintPrice] = useState(null); // what one "Enlarge for print" costs, about 3 normal AI pictures
  useEffect(() => {
    let alive = true;
    aiService
      .getAdmin()
      .then((a) => alive && a?.configured && setPrintPrice(Math.round((a.settings?.pricePerImageInr || 0) * 3) || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // a picture was enlarged (or switched back): show it, and the next download uses it
  const pictureChanged = (designId, index, printSrc) =>
    setPack((p) => ({
      ...p,
      designs: p.designs.map((d) => (d._id === designId ? { ...d, elements: d.elements.map((e, n) => (n === index ? { ...e, printSrc: printSrc || undefined } : e)) } : d)),
    }));

  useEffect(() => {
    let alive = true;
    customizationService
      .getOrderPrintPack(orderId)
      .then((p) => alive && setPack(p))
      .catch((err) => alive && setError(err.response?.data?.message || "Couldn't load this order's designs."));
    return () => {
      alive = false;
    };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !progress && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, progress]);

  const download = async () => {
    setError("");
    setResult(null);
    setProgress({ done: 0, total: 1, label: "Starting…" });
    try {
      const { buildPrintPack } = await import("../../studio/printFiles");
      const { blob, fileName, warnings } = await buildPrintPack(pack, (done, total, label) => setProgress({ done, total, label }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setResult({ fileName, warnings });
    } catch (err) {
      setError(err.message || "Couldn't make the print files.");
    } finally {
      setProgress(null);
    }
  };

  const designs = pack?.designs.filter((d) => !d.missing) || [];
  const fileCount = designs.reduce((n, d) => n + d.areas.reduce((m, a) => m + a.files.length, 0), 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Designs and print files"
      onClick={() => !progress && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(20,17,16,.55)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: THEME.surface, color: THEME.text, borderRadius: 14, width: "min(920px, 100%)", maxHeight: "90vh", overflow: "auto", padding: "22px 24px", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <p style={{ ...labelStyle, margin: 0, color: THEME.gold }}>Custom designs · print files</p>
            <h2 style={{ margin: "4px 0 2px", fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif", fontSize: 24 }}>
              Order {pack?.order.number || "…"}
            </h2>
            {pack && <p style={{ margin: 0, fontSize: 13, color: THEME.textMuted }}>{pack.order.customer}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={!!progress} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: THEME.textMuted }}>
            ×
          </button>
        </div>

        {!pack && !error && <p style={{ color: THEME.textMuted }}>Loading the designs…</p>}

        {designs.map((d, i) => (
          <section key={d._id} style={{ borderTop: `1px solid ${THEME.border}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SIDES.filter((s) => d.mockups?.[s]).map((s) => (
                <a key={s} href={d.mockups[s]} target="_blank" rel="noreferrer" title={`Open the ${s} preview`}>
                  <img src={d.mockups[s]} alt={`${s} preview`} style={{ width: 96, height: 120, objectFit: "cover", borderRadius: 8, background: THEME.surface2, border: `1px solid ${THEME.border}` }} />
                </a>
              ))}
            </div>
            <h3 style={{ margin: "10px 0 2px", fontSize: 16 }}>
              {i + 1}. {d.name || "Custom design"}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: THEME.textMuted }}>
              {d.garment.label} · colour{" "}
              {d.colour.hex && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: d.colour.hex, border: `1px solid ${THEME.border}`, verticalAlign: "middle" }} />}{" "}
              {d.colour.name} · sizes <b style={{ color: THEME.text }}>{d.lines.map((l) => `${l.size} × ${l.qty}`).join(", ")}</b>
            </p>
            {d.players?.length > 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                <b>Team order · {d.players.length} tees</b>, each with its own name and number.{" "}
                {!d.playersMatch && <span style={{ color: THEME.danger, fontWeight: 600 }}>The player list does not match the sizes ordered. Check with the customer.</span>}
              </p>
            )}
            {d.layoutVersion !== 2 ? (
              <p style={{ color: THEME.danger, fontSize: 13 }}>Saved in an older format — no print files can be made for it.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: THEME.textMuted }}>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>Print area</th>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>{d.players?.length ? "Player / sizes" : "Sizes"}</th>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>Print size</th>
                      <th style={{ padding: "4px 0", fontWeight: 600 }}>File at 300 DPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.areas.flatMap((a) =>
                      a.files.map((f) => (
                        <tr key={`${a.key}-${f.group}`} style={{ borderTop: `1px solid ${THEME.border}` }}>
                          <td style={{ padding: "5px 14px 5px 0", fontWeight: 600 }}>{a.label}</td>
                          <td style={{ padding: "5px 14px 5px 0" }}>
                            {f.player ? `${f.player.n}. ${[f.player.number, f.player.name].filter(Boolean).join(" ")} · ` : ""}
                            {f.sizes.join(", ")}
                          </td>
                          <td style={{ padding: "5px 14px 5px 0", fontVariantNumeric: "tabular-nums" }}>
                            {f.cm[0]} × {f.cm[1]} cm
                          </td>
                          <td style={{ padding: "5px 0", fontVariantNumeric: "tabular-nums", color: THEME.textMuted }}>
                            {Math.round((f.cm[0] / 2.54) * 300)} × {Math.round((f.cm[1] / 2.54) * 300)} px
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {d.layoutVersion === 2 && <PrintPictures design={d} price={printPrice} onChanged={(index, src) => pictureChanged(d._id, index, src)} />}
          </section>
        ))}
        {pack?.designs.some((d) => d.missing) && <p style={{ color: THEME.danger, fontSize: 13 }}>A design in this order no longer exists.</p>}
        {pack && !designs.length && <p style={{ color: THEME.textMuted }}>This order has no custom designs.</p>}

        {error && <p style={{ color: THEME.danger, fontWeight: 600, fontSize: 13 }}>{error}</p>}
        {result && (
          <div role="status" style={{ background: THEME.surface2, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
            <b>Downloaded {result.fileName}</b> — open ORDER-SHEET.txt inside for the sizes, where each print area sits on the tee and where the artwork is inside it. Each area also has a guide picture with a cm ruler.
            {result.warnings.map((w) => (
              <p key={w} style={{ margin: "6px 0 0", color: THEME.danger }}>⚠ {w}</p>
            ))}
          </div>
        )}

        {designs.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
            {progress && (
              <span style={{ fontSize: 12.5, color: THEME.textMuted }} aria-live="polite">
                {progress.label} ({progress.done}/{progress.total})
              </span>
            )}
            <button
              type="button"
              onClick={download}
              disabled={!!progress || !fileCount}
              style={{ background: THEME.gold, color: "#141110", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: progress ? "wait" : "pointer", opacity: progress || !fileCount ? 0.6 : 1 }}
            >
              {progress ? "Making print files…" : `Download print files (${fileCount} PNG${fileCount === 1 ? "" : "s"}, ZIP)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
