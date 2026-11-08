// Admin → Orders → "Designs & print files"
// Shows the custom designs in one order (previews, colour, sizes × qty,
// print areas with their real size) and downloads the print files
// as a ZIP for the print team (made in this browser — studio/printFiles.js).
// 6 Nov 2026: "Prepare for print" makes a picture print-ready the way the print team approved (enlarged on Replicate,
// vector edge, 600 DPI — server: printFileController.js), and "Send to print team" makes the ZIP (if not downloaded already) and emails it as a link.
import { useEffect, useRef, useState } from "react";
import customizationService from "../../services/customizationService";
import aiService from "../../services/aiService";
import printFileService from "../../services/printFileService";
import { imageUrl } from "../../utils/imageUrl";
import { THEME, labelStyle } from "../../theme/theme";

const SIDES = ["front", "back", "left", "right"];
const GOOD_DPI = 250; // close enough to 300 that enlarging adds nothing worth paying for
const LOW_DPI = 150; // below this a picture may print blurry
const full = (src) => (/^https?:\/\//.test(src) ? src : imageUrl(src));

// How sharp one picture prints: its file's width against the largest size its area is printed at in this order.
const pictureSharpness = (design, el, sizes) => {
  const area = design.areas.find((a) => a.key === el.position);
  const cmWide = Math.max(0, ...(area?.files || []).map((f) => f.cm[0]));
  const printCm = ((el.width || 0) / 100) * cmWide;
  const shown = el.printSrc || el.src;
  const px = sizes[shown];
  return { area, printCm, shown, dpi: px && printCm ? Math.round(px / (printCm / 2.54)) : null };
};

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

// The pictures in one ordered design, each with how sharp it will print (dots per inch at its real print size), the
// the real DPI of a print-ready picture at its print width (6 Nov 2026: was always shown as "600 DPI", but the enlarger
// stops at 4×, so a small customer picture comes to about 300)
const readyDpi = (printFile, printCm) => {
  const cm = printCm || printFile?.cm;
  return printFile?.width && cm ? Math.round(printFile.width / (cm / 2.54)) : null;
};
// what the print team is told about a print-ready picture's fine detail (counted when it was made, 8 Nov 2026)
const detailNote = (f) =>
  [
    f?.specksDropped ? `${f.specksDropped} tiny dot${f.specksDropped === 1 ? "" : "s"} taken out` : "",
    f?.specks ? `${f.specks} tiny dot${f.specks === 1 ? "" : "s"} under 0.1 mm²` : "",
    f?.thinPct >= 1 ? `${f.thinPct}% fine lines under 0.3 mm` : "",
    f?.knockout ? "tee colour left out" : "",
  ]
    .filter(Boolean)
    .join(" · ");
// the order with one picture made print-ready (or set back to plain)
const withPrintFile = (p, designId, index, printFile) => ({
  ...p,
  designs: p.designs.map((d) => (d._id === designId ? { ...d, elements: d.elements.map((e, n) => (n === index ? { ...e, printFile: printFile || undefined } : e)) } : d)),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "Prepare for print" button (the approved way: enlarged on a graphics card, vector edge, 600 DPI) and, as the old way,
// a redraw by Google's AI. One row per picture.
function PrintPictures({ design, price, sizes, pf, onChanged, onReady, locked = false, allPrep = null }) {
  const [busy, setBusy] = useState(null); // index being redrawn by Google
  const [preparing, setPreparing] = useState(null); // { index, jobId, step }
  const [compare, setCompare] = useState(null); // { index, url } — the picture being compared with its original
  const [error, setError] = useState("");
  const [grokDone, setGrokDone] = useState(null); // the picture Grok just enlarged, because Google refused
  const rows = design.elements.map((el, index) => ({ el, index })).filter(({ el }) => el.type === "image" && el.src);
  const enlarger = pf?.enlarger;
  const prepPrice = enlarger?.priceInr ? `about ₹${enlarger.priceInr}` : enlarger?.mock ? "free (test)" : "";

  // Prepare for print: start the job, then ask every few seconds how it is going
  useEffect(() => {
    if (!preparing?.jobId) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const j = await printFileService.job(preparing.jobId);
        if (!alive) return;
        if (j.status === "done") {
          clearInterval(timer);
          setPreparing(null);
          onReady(preparing.index, j.result?.printFile || null);
        } else if (j.status === "failed") {
          clearInterval(timer);
          setPreparing(null);
          setError(j.error || "The picture could not be prepared.");
        } else setPreparing((p) => (p ? { ...p, step: j.step } : p));
      } catch (err) {
        if (!alive) return;
        clearInterval(timer);
        setPreparing(null);
        setError(err.response?.data?.message || "Lost track of the picture being prepared. Try again.");
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [preparing?.jobId, preparing?.index, onReady]);

  const prepare = async (index, printCm) => {
    if (!enlarger?.configured) return setError("The enlarger is not set up on this server yet (REPLICATE_API_TOKEN in the server's .env).");
    if (!window.confirm(`Prepare this picture for print?${prepPrice ? ` It costs ${prepPrice}` : ""}: it is enlarged on the graphics-card service and given its vector edge (about 1–3 minutes). You can compare it with the original afterwards.`)) return;
    setError("");
    try {
      const { jobId } = await printFileService.prepare({ designId: design._id, index, printCm: Math.max(1, Math.round(printCm * 10) / 10) });
      setPreparing({ index, jobId, step: "Starting…" });
    } catch (err) {
      setError(err.response?.data?.message || "The picture could not be prepared. Please try again.");
    }
  };
  const printPlain = async (index) => {
    if (!window.confirm("Print the plain picture instead?\n\nThe print-ready copy stays on the server; preparing it again costs another run.")) return;
    setError("");
    try {
      await printFileService.drop({ designId: design._id, index });
      onReady(index, null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not switch back to the plain picture.");
    }
  };
  const openCompare = async (index, el) => {
    try {
      setCompare({ index, url: el.printFile?.key ? await printFileService.previewBlobUrl(el.printFile.key) : full(el.printSrc) });
    } catch (err) {
      setError(err.response?.data?.message || "The preview could not be loaded.");
    }
  };

  const enlarge = async (index) => {
    // a paid AI request: ask first
    if (!window.confirm(`Redraw this picture bigger with Google's AI?${price ? ` It costs about ₹${price}` : ""} (one AI request). The AI redraws it, so compare it with the original afterwards; you can go back to the original if it isn't right.`)) return;
    setError("");
    setBusy(index);
    try {
      const res = await aiService.printPicture({ designId: design._id, index });
      onChanged(index, res.printSrc);
      setGrokDone(res.byGrok ? { index, cost: res.costInr } : null);
    } catch (err) {
      setError(err.response?.data?.message || "The picture could not be enlarged. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const printOriginal = async (index) => {
    if (!window.confirm("Print the original instead?\n\nThe enlarged copy (already paid for) will be deleted. Enlarging again later costs another request.")) return;
    setError("");
    try {
      await aiService.dropPrintPicture({ designId: design._id, index });
      onChanged(index, null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not switch back to the original.");
    }
  };

  if (!rows.length) return null;
  const smallBtn = { background: "none", border: `1px solid ${THEME.border}`, borderRadius: 9, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: THEME.text };
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ ...labelStyle, margin: "0 0 6px" }}>Pictures · how sharp they will print</p>
      {rows.map(({ el, index }) => {
        const { area, printCm, shown, dpi } = pictureSharpness(design, el, sizes);
        const ready = Boolean(el.printFile?.key);
        // (Prepare all runs in the window above: its picture shows its step here too)
        const prep = preparing?.index === index ? preparing : allPrep?.designId === design._id && allPrep.index === index ? allPrep : null;
        const rDpi = ready ? readyDpi(el.printFile, printCm) : null;
        const detail = ready ? detailNote(el.printFile) : "";
        const tone = ready ? (rDpi && rDpi < GOOD_DPI ? "#7A5B12" : "#24522F") : dpi == null ? THEME.textMuted : dpi >= GOOD_DPI ? "#24522F" : dpi >= LOW_DPI ? "#7A5B12" : THEME.danger;
        const word = dpi == null ? "measuring…" : dpi >= GOOD_DPI ? "sharp" : dpi >= LOW_DPI ? "acceptable" : "low, may print soft";
        return (
          <div key={index} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
            <a href={full(shown)} target="_blank" rel="noreferrer" title="Open the picture">
              <img
                src={full(shown)}
                alt=""
                loading="lazy"
                style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, background: design.colour.hex || THEME.surface2, border: `1px solid ${THEME.border}` }}
              />
            </a>
            <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13 }}>
              <b>{area?.label || el.position}</b>
              <span style={{ color: THEME.textMuted }}> · {printCm ? `${printCm.toFixed(1)} cm wide` : "size unknown"}</span>
              <div style={{ color: tone, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {ready ? `✓ Print-ready · ${el.printFile.keep}× bigger · ${rDpi ? `${rDpi} DPI${rDpi < GOOD_DPI ? " (a little soft)" : ""}` : "enlarged"} · vector edge` : dpi != null ? `${dpi} DPI — ${word}` : word}
                {!ready && el.printSrc && <span style={{ color: "#24522F" }}> · redrawn bigger by Google ✓</span>}
              </div>
              {detail && <div style={{ fontSize: 12, color: THEME.textMuted }}>{detail}</div>}
              {(ready || el.printSrc) && (
                <button type="button" onClick={() => openCompare(index, el)} style={{ marginTop: 4, background: THEME.goldBg, border: `1px solid ${THEME.goldBorder}`, borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, color: THEME.goldDeep, cursor: "pointer" }}>
                  Compare with the original
                </button>
              )}
            </div>
            {prep ? (
              <span style={{ fontSize: 13, color: THEME.textMuted, flex: "1 1 200px" }} aria-live="polite">Preparing… {prep.step}</span>
            ) : ready ? (
              <button type="button" onClick={() => printPlain(index)} disabled={busy != null || locked} style={smallBtn}>
                Print the plain picture instead
              </button>
            ) : busy === index ? (
              <span style={{ fontSize: 13, color: THEME.textMuted }}>Redrawing… about half a minute</span>
            ) : (
              <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                <button type="button" onClick={() => prepare(index, printCm)} disabled={busy != null || !!preparing || !printCm || locked} title={enlarger?.configured ? "" : "The enlarger (Replicate) is not set up on this server"} style={{ background: THEME.ink, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", minHeight: 40, fontSize: 12.5, fontWeight: 700, cursor: busy != null || preparing || locked ? "not-allowed" : "pointer", opacity: busy != null || preparing || !printCm || locked ? 0.5 : 1 }}>
                  Prepare for print{prepPrice ? ` · ${prepPrice}` : ""}
                </button>
                {el.printSrc ? (
                  <button type="button" onClick={() => printOriginal(index)} disabled={busy != null || !!preparing} style={{ ...smallBtn, padding: "4px 8px", fontSize: 11.5 }}>
                    Drop Google's redraw
                  </button>
                ) : (
                  dpi != null &&
                  dpi < GOOD_DPI && (
                    <button type="button" onClick={() => enlarge(index)} disabled={busy != null || !!preparing} style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, color: THEME.textMuted, cursor: "pointer", textDecoration: "underline" }}>
                      or redraw bigger with Google's AI{price ? ` (about ₹${price})` : ""}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
      {grokDone && design.elements[grokDone.index]?.printSrc && (
        <p style={{ margin: "6px 0 0", color: "#7A5B12", fontSize: 13, fontWeight: 600 }}>
          Google refused this picture, so Grok enlarged it{grokDone.cost ? ` (₹${grokDone.cost})` : ""}. Grok redraws more than Google: compare it with the original before printing, faces most of all.
        </p>
      )}
      {error && <p style={{ margin: "6px 0 0", color: THEME.danger, fontSize: 13, fontWeight: 600 }}>{error}</p>}
      {compare != null && (
        <ComparePictures original={full(design.elements[compare.index].src)} enlarged={compare.url} tee={design.colour.hex} onClose={() => setCompare(null)} />
      )}
      <p style={{ margin: "6px 0 0", fontSize: 12, color: THEME.textMuted }}>
        <b>Prepare for print</b> is the way the print team approved: the picture is enlarged on a graphics-card service (the same enlarger that made the approved samples), its edge is cleaned and drawn as a vector, and it goes into the .ai file at up to 600 DPI (the enlarger makes a picture at most 4× bigger, so a small customer picture comes to about 300 DPI — still sharp; the row shows the real number). It keeps the picture as it is. Google's redraw is the older way: it can change details, so compare it before printing.
      </p>
    </div>
  );
}

export default function OrderDesignsModal({ orderId, onClose }) {
  const [pack, setPack] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // { done, total, label }
  const [result, setResult] = useState(null); // { fileName, warnings, blob }
  const [printPrice, setPrintPrice] = useState(null); // what one Google redraw costs, about 3 normal AI pictures
  const [pf, setPf] = useState(null); // the print-file service: enlarger set up?, its price, the print team's address
  const [sentList, setSentList] = useState([]); // ZIPs already sent for this order
  const [sending, setSending] = useState(null); // { label }
  const [sentNow, setSentNow] = useState(null); // the reply of the send just made
  const [allPrep, setAllPrep] = useState(null); // Prepare all: { n, of, designId, index, step }
  const [failedPrep, setFailedPrep] = useState({}); // "designId:index" -> why it couldn't be prepared
  const [note, setNote] = useState(""); // the admin's note for the print team
  const [noteSaved, setNoteSaved] = useState(""); // the note as saved on the server
  const [noteBusy, setNoteBusy] = useState(false);
  const packRef = useRef(null); // the order as it is now (Prepare all changes it while a send waits)
  useEffect(() => {
    packRef.current = pack;
  }, [pack]);
  useEffect(() => {
    let alive = true;
    printFileService.status().then((p) => alive && setPf(p)).catch(() => {});
    printFileService.sent(orderId).then((r) => alive && setSentList(r.sent || [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [orderId]);
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
  // a picture was made print-ready (or set back to plain): the next download draws it that way
  // (a ZIP already made has the old picture in it: the next Send makes it again)
  const pictureReady = (designId, index, printFile) => {
    setPack((p) => withPrintFile(p, designId, index, printFile));
    setResult(null);
  };

  useEffect(() => {
    let alive = true;
    customizationService
      .getOrderPrintPack(orderId)
      .then((p) => {
        if (!alive) return;
        setPack(p);
        setNote(p.order?.note || "");
        setNoteSaved(p.order?.note || "");
      })
      .catch((err) => alive && setError(err.response?.data?.message || "Couldn't load this order's designs."));
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Cancel while the ZIP is being made: the builder stops at its next step, nothing is downloaded
  const cancelRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const cancel = () => {
    cancelRef.current = true;
    setStopping(true);
    setProgress((p) => (p ? { ...p, label: "Stopping…" } : p));
  };
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !allPrep && (progress ? cancel() : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, progress, allPrep]);

  const designs = pack?.designs.filter((d) => !d.missing) || [];
  const fileCount = designs.reduce((n, d) => n + d.areas.reduce((m, a) => m + a.files.length, 0), 0);

  // every picture's file width, measured here so a picture further down the page counts too
  const [pictureSizes, setPictureSizes] = useState({}); // src -> pixel width of the file
  useEffect(() => {
    const srcs = new Set();
    for (const d of pack?.designs || []) for (const el of d.elements || []) if (el.type === "image" && el.src) srcs.add(el.printSrc || el.src);
    for (const src of srcs) {
      const img = new Image();
      img.onload = () => setPictureSizes((s) => (s[src] ? s : { ...s, [src]: img.naturalWidth }));
      img.src = full(src);
    }
  }, [pack]);

  // every picture of the order with how it prints (8 Nov 2026: the print team wants each one prepared, at 250 DPI or more)
  // (worked out from the order as it is: Send asks again after Prepare all has changed it)
  const picturesOf = (p) =>
    (p?.designs.filter((d) => !d.missing) || []).flatMap((d) =>
    (d.layoutVersion === 2 ? d.elements : [])
      .map((el, index) => ({ d, el, index }))
      .filter(({ el }) => el.type === "image" && el.src)
      .map((p) => {
        const s = pictureSharpness(p.d, p.el, pictureSizes);
        const ready = Boolean(p.el.printFile?.key);
        return { ...p, ...s, ready, real: ready ? readyDpi(p.el.printFile, s.printCm) : s.dpi };
      }),
  );
  const softOf = (list) => list.filter((p) => p.real != null && p.real < GOOD_DPI);
  const allPictures = picturesOf(pack);
  const notReady = allPictures.filter((p) => !p.ready);
  const lowPictures = softOf(allPictures);
  const prepPrice = pf?.enlarger?.priceInr || 0;

  // the soft-picture warning asked before the ZIP is made (Download and Send alike); false = the admin stopped
  const blurryOk = (verb) => {
    const low = softOf(picturesOf(packRef.current || pack));
    return (
      !low.length ||
      window.confirm(`${low.length === 1 ? "1 picture" : `${low.length} pictures`} will print soft (under ${GOOD_DPI} DPI${low.some((p) => p.real < LOW_DPI) ? `, ${low.filter((p) => p.real < LOW_DPI).length} even blurry` : ""}).\n\nPress Cancel to fix ${low.length === 1 ? "it" : "them"} first: Prepare for print, ask the customer for a bigger picture, or print it smaller.\nPress OK to ${verb} anyway.`)
    );
  };

  // Prepare all (8 Nov 2026): every picture not yet print-ready, one after the other. true when all are ready.
  const prepareAll = async ({ ask = true } = {}) => {
    const todo = notReady.filter((p) => p.printCm);
    if (!todo.length) return !notReady.length;
    if (!pf?.enlarger?.configured) {
      setError("The enlarger is not set up on this server yet (REPLICATE_API_TOKEN in the server's .env), so pictures can't be prepared.");
      return false;
    }
    const cost = prepPrice ? ` It costs about ₹${Math.round(prepPrice * todo.length * 100) / 100} (₹${prepPrice} each).` : pf.enlarger.mock ? " Free (test enlarger)." : "";
    if (ask && !window.confirm(`Prepare ${todo.length === 1 ? "1 picture" : `all ${todo.length} pictures`} for print?${cost}\n\nEach is enlarged on the graphics-card service and given its vector edge — about 1–3 minutes each. Compare them with the originals afterwards.`)) return false;
    setError("");
    let cur = packRef.current;
    const failed = {};
    for (const [k, p] of todo.entries()) {
      const id = `${p.d._id}:${p.index}`;
      const show = (step) => setAllPrep({ n: k + 1, of: todo.length, designId: p.d._id, index: p.index, step });
      show("Starting…");
      try {
        const { jobId } = await printFileService.prepare({ designId: p.d._id, index: p.index, printCm: Math.max(1, Math.round(p.printCm * 10) / 10) });
        for (;;) {
          await sleep(3000);
          const j = await printFileService.job(jobId);
          if (j.status === "done") {
            cur = withPrintFile(cur, p.d._id, p.index, j.result?.printFile || null);
            packRef.current = cur;
            setPack(cur);
            break;
          }
          if (j.status === "failed") throw new Error(j.error || "It could not be prepared.");
          show(j.step);
        }
      } catch (err) {
        failed[id] = err.response?.data?.message || err.message || "It could not be prepared.";
      }
    }
    setAllPrep(null);
    setResult(null);
    setFailedPrep((f) => ({ ...f, ...failed }));
    const nFailed = Object.keys(failed).length;
    if (nFailed) setError(`${nFailed === 1 ? "1 picture" : `${nFailed} pictures`} couldn't be prepared: ${[...new Set(Object.values(failed))].join(" · ")}`);
    return !nFailed && todo.length === notReady.length;
  };

  const saveNote = async () => {
    setNoteBusy(true);
    try {
      const r = await printFileService.saveNote(orderId, note);
      setNote(r.note);
      setNoteSaved(r.note);
      setPack((p) => ({ ...p, order: { ...p.order, note: r.note } }));
      packRef.current = { ...packRef.current, order: { ...packRef.current.order, note: r.note } };
      setResult(null); // the ZIP has the note in it: made again on the next send
    } catch (err) {
      setError(err.response?.data?.message || "The note couldn't be saved.");
    } finally {
      setNoteBusy(false);
    }
  };

  // Send again: the same ZIP, a new link (a reprint, or the print team lost the email)
  const [resending, setResending] = useState(null); // fileName
  const resend = async (f) => {
    if (!window.confirm(`Send ${f.fileName} to the print team again?\n\nThey get a new download link for ${pf?.keepDays || 14} days. Use this for a reprint or a lost email — if the design or a picture changed since, press Send to print team instead.`)) return;
    setResending(f.fileName);
    setError("");
    try {
      const r = await printFileService.resend(orderId, f.fileName);
      setSentNow(r);
      printFileService.sent(orderId).then((x) => setSentList(x.sent || [])).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.message || "It couldn't be sent again.");
    } finally {
      setResending(null);
    }
  };

  // makes the ZIP in the browser (with the progress line and its Cancel); null when stopped or failed
  const makeZip = async () => {
    setError("");
    cancelRef.current = false;
    setStopping(false);
    setProgress({ done: 0, total: 1, label: "Starting…" });
    try {
      const { buildPrintPack } = await import("../../studio/printFiles");
      return await buildPrintPack(packRef.current || pack, (done, total, label) => (cancelRef.current ? false : setProgress({ done, total, label })));
    } catch (err) {
      if (!err?.stopped) setError(err.message || "Couldn't make the print files.");
      return null;
    } finally {
      setProgress(null);
    }
  };

  const download = async () => {
    if (!blurryOk("download")) return;
    setResult(null);
    const made = await makeZip();
    if (!made) return;
    const { blob, fileName, warnings } = made;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setResult({ fileName, warnings, blob, how: "downloaded" });
    setSentNow(null);
  };

  // Send to print team (7 Nov 2026): one click from the start — makes the ZIP if Download hasn't already (it is
  // not saved on this computer), then it goes to the server in parts, which emails a download link
  // 8 Nov 2026: the print team gets prepared pictures only — Send prepares the rest first (asking the price), and sends
  // a plain picture only when it can't be prepared (the enlarger is off, or preparing it failed) and the admin says so
  const sendToTeam = async () => {
    if (note !== noteSaved && !window.confirm("The note for the print team isn't saved. Send without it?")) return;
    if (notReady.length) {
      const stuck = !pf?.enlarger?.configured || notReady.every((p) => failedPrep[`${p.d._id}:${p.index}`] || !p.printCm);
      if (stuck) {
        if (!window.confirm(`${notReady.length === 1 ? "1 picture is" : `${notReady.length} pictures are`} not prepared for print and can't be prepared${pf?.enlarger?.configured ? " (it failed)" : " (the enlarger is not set up)"}.\n\nThey would go as plain pictures: no vector edge, not enlarged. The print team asked for prepared pictures.\nPress OK to send them plain anyway.`)) return;
      } else {
        const cost = prepPrice ? ` (about ₹${Math.round(prepPrice * notReady.length * 100) / 100})` : "";
        if (!window.confirm(`${notReady.length === 1 ? "1 picture is" : `${notReady.length} pictures are`} not prepared for print yet. The print team gets prepared pictures only.\n\nPrepare ${notReady.length === 1 ? "it" : "them"} now${cost} and then send? (about 1–3 minutes a picture)`)) return;
        if (!(await prepareAll({ ask: false }))) return;
      }
    }
    if (!blurryOk("send")) return;
    const test = Boolean((packRef.current || pack)?.order?.isTest);
    if (!window.confirm(test ? `This is a TEST order: the print files are emailed to you only (the print team does not get test orders).\n\nSend them to yourself?` : `Email the print files to the print team (${pf?.teamEmail || "the print team"})?\n\nThey get a download link that works for ${pf?.keepDays || 14} days. A copy goes to you.`)) return;
    let made = result;
    if (!made?.blob) {
      made = await makeZip();
      if (!made) return;
      made = { ...made, how: "made" };
      setResult(made);
      setSentNow(null);
    }
    setError("");
    setSending({ label: "Uploading…" });
    try {
      const uploadId = await printFileService.uploadZip(orderId, made.blob, (n, t) => setSending({ label: `Uploading ${n}/${t}…` }));
      setSending({ label: "Sending the email…" });
      const r = await printFileService.send(orderId, { uploadId, fileName: made.fileName, bytes: made.blob.size });
      setSentNow(r);
      printFileService.sent(orderId).then((x) => setSentList(x.sent || [])).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.message || err.message || "The print files could not be sent.");
    } finally {
      setSending(null);
    }
  };
  const fmtWhen = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Designs and print files"
      onClick={() => !progress && !allPrep && onClose()}
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
            {pack && (
              <p style={{ margin: 0, fontSize: 13, color: THEME.textMuted }}>
                {pack.order.customer}
                {pack.order.shipBy && (
                  <>
                    {pack.order.customer ? " · " : ""}
                    <b style={{ color: THEME.text }}>ship by {new Date(`${pack.order.shipBy}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}</b>
                  </>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={progress ? cancel : onClose} disabled={!!allPrep} aria-label={progress ? "Stop making the print files" : "Close"} title={progress ? "Stop making the print files" : "Close"} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: THEME.textMuted }}>
            ×
          </button>
        </div>

        {pack?.order.isTest && (
          <p role="alert" style={{ margin: "12px 0 0", background: "#FDECEA", color: THEME.danger, fontWeight: 700, fontSize: 13, padding: "8px 12px", borderRadius: 10 }}>
            TEST ORDER — the print files say “TEST — DO NOT PRINT” on every job card, and Send emails them to you only, never to the print team.
          </p>
        )}
        {!pack && !error && <p style={{ color: THEME.textMuted }}>Loading the designs…</p>}

        {designs.map((d, i) => (
          <section key={d._id} style={{ borderTop: `1px solid ${THEME.border}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SIDES.filter((s) => d.mockups?.[s]).map((s) => (
                <a key={s} href={imageUrl(d.mockups[s])} target="_blank" rel="noreferrer" title={`Open the ${s} preview`}>
                  <img src={imageUrl(d.mockups[s], 240)} alt={`${s} preview`} style={{ width: 96, height: 120, objectFit: "cover", borderRadius: 8, background: THEME.surface2, border: `1px solid ${THEME.border}` }} />
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
            {d.layoutVersion === 2 && (
              <PrintPictures design={d} price={printPrice} sizes={pictureSizes} pf={pf} locked={!!allPrep} allPrep={allPrep} onChanged={(index, src) => pictureChanged(d._id, index, src)} onReady={(index, printFile) => pictureReady(d._id, index, printFile)} />
            )}
          </section>
        ))}
        {pack?.designs.some((d) => d.missing) && <p style={{ color: THEME.danger, fontSize: 13 }}>A design in this order no longer exists.</p>}
        {pack && !designs.length && <p style={{ color: THEME.textMuted }}>This order has no custom designs.</p>}

        {designs.length > 0 && (
          <div style={{ borderTop: `1px solid ${THEME.border}`, marginTop: 16, paddingTop: 14 }}>
            <label htmlFor="print-note" style={{ ...labelStyle, display: "block", margin: "0 0 6px" }}>
              Note for the print team
            </label>
            <textarea
              id="print-note"
              value={note}
              maxLength={1000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. the customer wants the logo 2 cm lower · print the back first · rush"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", background: "#fff", color: THEME.text }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <button type="button" onClick={saveNote} disabled={noteBusy || note === noteSaved} style={{ border: `1px solid ${THEME.border}`, background: note === noteSaved ? THEME.surface2 : THEME.ink, color: note === noteSaved ? THEME.textMuted : "#fff", borderRadius: 999, padding: "6px 14px", minHeight: 34, fontSize: 12.5, fontWeight: 700, cursor: noteBusy || note === noteSaved ? "default" : "pointer" }}>
                {noteBusy ? "Saving…" : note === noteSaved ? (noteSaved ? "Saved" : "No note") : "Save the note"}
              </button>
              <span style={{ fontSize: 12, color: THEME.textMuted }}>Goes on the order sheet and every job card.</span>
            </div>
            {pf?.options && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: THEME.textMuted }}>
                Print options: {pf.options.dropSpecks ? "dots too small for the film (under 0.1 mm²) are taken out" : "tiny dots are kept"} · {pf.options.knockout ? "black is left out on black tees, white on white (knock-out)" : "no knock-out"}. Change them in Settings → AI designs → Print files (for pictures prepared after that).
              </p>
            )}
          </div>
        )}

        {error && <p style={{ color: THEME.danger, fontWeight: 600, fontSize: 13 }}>{error}</p>}
        {result && (
          <div role="status" style={{ background: THEME.surface2, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
            <b>{result.how === "downloaded" ? "Downloaded" : "Made"} {result.fileName}</b>
            {result.how === "downloaded" ? " — open ORDER-SHEET.txt inside for the sizes, where each print area sits on the tee and where the artwork is inside it. Each print is one .ai file (vector words and the print-ready pictures), with a job card for the measurements." : " (not saved on this computer — press Download print files if you want it)."}
            {result.warnings.map((w) => (
              <p key={w} style={{ margin: "6px 0 0", color: THEME.danger }}>⚠ {w}</p>
            ))}
            {sentNow && <p role="status" style={{ margin: "8px 0 0", color: "#24522F", fontWeight: 600 }}>✓ Sent to {sentNow.sentTo}. The link works until {new Date(sentNow.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}.</p>}
          </div>
        )}
        {sentList.length > 0 && (
          <div style={{ fontSize: 12.5, color: THEME.textMuted, marginTop: 10 }}>
            <b style={{ color: THEME.text }}>Sent to the print team:</b>{" "}
            {sentList.map((f, i) => (
              <span key={`${f.sentAt}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginRight: 10 }}>
                {fmtWhen(f.sentAt)} ({(f.bytes / 1e6).toFixed(1)} MB{f.expired ? ", link expired" : ""})
                {f.canResend && i === sentList.map((x) => x.fileName).lastIndexOf(f.fileName) && (
                  <button type="button" onClick={() => resend(f)} disabled={!!resending || !!sending || !!progress} style={{ border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 999, padding: "3px 10px", minHeight: 28, fontSize: 12, fontWeight: 700, cursor: "pointer", color: THEME.text }}>
                    {resending === f.fileName ? "Sending…" : "Send again"}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {notReady.length > 0 && (
          <div role="status" style={{ background: THEME.goldBg, border: `1px solid ${THEME.goldBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 260px" }}>
              <b>{notReady.length === 1 ? "1 picture is" : `${notReady.length} pictures are`} not prepared for print.</b> The print team gets prepared pictures only (enlarged, vector edge) — Send prepares them first.
              {allPrep && (
                <span style={{ display: "block", color: THEME.textMuted, marginTop: 4 }} aria-live="polite">
                  Preparing {allPrep.n} of {allPrep.of}… {allPrep.step}
                </span>
              )}
            </span>
            <button type="button" onClick={() => prepareAll()} disabled={!!allPrep || !!progress || !!sending || !pf?.enlarger?.configured} title={pf?.enlarger?.configured ? "" : "The enlarger (Replicate) is not set up on this server"} style={{ background: THEME.ink, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", minHeight: 40, fontSize: 12.5, fontWeight: 700, cursor: allPrep ? "wait" : "pointer", opacity: allPrep || !pf?.enlarger?.configured ? 0.6 : 1 }}>
              {allPrep ? "Preparing…" : `Prepare all${prepPrice ? ` · about ₹${Math.round(prepPrice * notReady.length * 100) / 100}` : pf?.enlarger?.mock ? " · free (test)" : ""}`}
            </button>
          </div>
        )}
        {lowPictures.length > 0 && (
          <div role="alert" style={{ background: "#FDECEA", border: `1px solid ${THEME.danger}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
            <b style={{ color: THEME.danger }}>⚠ {lowPictures.length === 1 ? "1 picture" : `${lowPictures.length} pictures`} will print soft (under {GOOD_DPI} DPI)</b>
            <ul style={{ margin: "6px 0", padding: 0, listStyle: "none" }}>
              {lowPictures.map((p) => (
                <li key={`${p.d._id}-${p.index}`}>
                  {p.area?.label || p.el.position}: {p.real} DPI at {p.printCm.toFixed(1)} cm wide{p.ready ? " (already prepared — the enlarger stops at 4×)" : p.real < LOW_DPI ? " — blurry" : ""}
                </li>
              ))}
            </ul>
            <span>{lowPictures.some((p) => !p.ready) ? <>Press <b>Prepare all</b>: it enlarges each picture up to 4 times. </> : ""}If a picture is still soft, ask the customer for a bigger one, or make it smaller on the tee.</span>
          </div>
        )}

        {designs.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
            {progress && (
              <span style={{ fontSize: 12.5, color: THEME.textMuted }} aria-live="polite">
                {progress.label} ({progress.done}/{progress.total}){" "}
                <button type="button" onClick={cancel} disabled={stopping} style={{ marginLeft: 8, border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: THEME.text }}>
                  Cancel
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={sendToTeam}
              disabled={!!progress || !!sending || !fileCount || !!allPrep}
              title={result?.blob ? "Emails the ZIP already made" : "Makes the ZIP and emails it — nothing is saved on this computer"}
              style={{ background: THEME.ink, color: "#F0D585", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: progress || sending ? "wait" : "pointer", opacity: progress || sending || !fileCount ? 0.6 : 1 }}
            >
              {sending ? sending.label : allPrep ? "Preparing pictures…" : pack?.order.isTest ? "Send to me (test order)" : `Send to print team (${pf?.teamEmail || "email"})`}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!!progress || !!sending || !fileCount || !!allPrep}
              style={{ background: THEME.gold, color: "#141110", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: progress || sending ? "wait" : "pointer", opacity: progress || sending || !fileCount ? 0.6 : 1 }}
            >
              {progress ? "Making print files…" : `Download print files (${fileCount} print${fileCount === 1 ? "" : "s"}, ZIP)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
