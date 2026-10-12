// Admin → Orders → "Designs & print files"
// Shows the custom designs in one order (previews, colour, sizes × qty,
// print areas with their real size) and downloads the 300-DPI print files
// as a ZIP for the print team (made in this browser — studio/printFiles.js).
import { useEffect, useState } from "react";
import customizationService from "../../services/customizationService";
import aiService from "../../services/aiService";
import { imageUrl } from "../../utils/imageUrl";
import { THEME, labelStyle } from "../../theme/theme";

const SIDES = ["front", "back", "left", "right"];
const GOOD_DPI = 250; // close enough to 300 that enlarging adds nothing worth paying for
const LOW_DPI = 150; // below this a picture may print blurry
const full = (src) => (/^https?:\/\//.test(src) ? src : imageUrl(src));

// The pictures in one ordered design, each with how sharp it will print (dots per inch at its real print
// size) and a button to have a large copy made for printing. One row per picture.
function PrintPictures({ design, price, onChanged }) {
  const [sizes, setSizes] = useState({}); // src -> pixel width of the file
  const [busy, setBusy] = useState(null); // index being enlarged
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
                <div style={{ fontSize: 12.5, color: THEME.textMuted }}>
                  Compare before printing:{" "}
                  <a href={full(el.src)} target="_blank" rel="noreferrer" style={{ color: THEME.goldDeep, fontWeight: 700 }}>the customer’s original</a>
                  {" · "}
                  <a href={full(el.printSrc)} target="_blank" rel="noreferrer" style={{ color: THEME.goldDeep, fontWeight: 700 }}>the enlarged copy</a>
                </div>
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
            <h2 style={{ margin: "4px 0 2px", fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>
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
            <b>Downloaded {result.fileName}</b> — open ORDER-SHEET.txt inside for the sizes and where each file goes.
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
