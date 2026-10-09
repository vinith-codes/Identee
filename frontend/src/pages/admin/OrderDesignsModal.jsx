// Admin → Orders → "Designs & print files"
// Shows the custom designs in one order (previews, colour, sizes × qty,
// print areas with their real size) and downloads the 300-DPI print files
// as a ZIP for the print team (made in this browser — studio/printFiles.js).
import { useEffect, useState } from "react";
import customizationService from "../../services/customizationService";
import { THEME, labelStyle } from "../../theme/theme";

const SIDES = ["front", "back", "left", "right"];

export default function OrderDesignsModal({ orderId, onClose }) {
  const [pack, setPack] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // { done, total, label }
  const [result, setResult] = useState(null); // { fileName, warnings }

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
            {d.layoutVersion !== 2 ? (
              <p style={{ color: THEME.danger, fontSize: 13 }}>Saved in an older format — no print files can be made for it.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: THEME.textMuted }}>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>Print area</th>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>Sizes</th>
                      <th style={{ padding: "4px 14px 4px 0", fontWeight: 600 }}>Print size</th>
                      <th style={{ padding: "4px 0", fontWeight: 600 }}>File at 300 DPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.areas.flatMap((a) =>
                      a.files.map((f) => (
                        <tr key={`${a.key}-${f.group}`} style={{ borderTop: `1px solid ${THEME.border}` }}>
                          <td style={{ padding: "5px 14px 5px 0", fontWeight: 600 }}>{a.label}</td>
                          <td style={{ padding: "5px 14px 5px 0" }}>{f.sizes.join(", ")}</td>
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
