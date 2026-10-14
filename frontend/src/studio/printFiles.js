// studio/printFiles.js
//
// Print files for the print team: one transparent PNG per used print area
// and ordered size group, at 300 DPI and the area's real size in cm
// (e.g. Centre Front, M–XL = 28 × 32 cm = 3307 × 3780 px).
//
// Drawn in the admin's browser with the same Konva code as the Design Room
// (konvaRender.js), so the file matches what the customer saw — but with
// the original uploaded pictures instead of the small screen copies.
// Sizes in one size group share a print size, so they share one file.
// Team orders: an area that carries the player's name or number gets one
// file per player (their name and number drawn in), named after the player.
import { AreaRenderer, cachedImage, imageSrcs, loadImage, playerElements } from "./konvaRender";
import { playerLabel } from "./teamOrder";
import { fontsReady } from "./fonts";

export const PRINT_DPI = 300;
export const cmToPx = (cm, dpi = PRINT_DPI) => Math.round((cm / 2.54) * dpi);
const LOW_DPI = 150; // below this a picture may print blurry

/* ---------- PNG with its DPI written in (pHYs chunk) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Inserts a pHYs chunk after IHDR so print software reads 300 DPI
// (a canvas PNG has no DPI and opens at 72 or 96).
export function setPngDpi(png, dpi = PRINT_DPI) {
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunk = new Uint8Array(21);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 8 + 25; // signature + IHDR
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

const toPng = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("The picture is too big for this browser"))), "image/png"),
  );

/** One area at 300 DPI → PNG bytes. `elements` = that area's elements only. */
export async function renderPrintFile(elements, [wCm, hCm]) {
  const r = new AreaRenderer(cmToPx(wCm), cmToPx(hCm));
  try {
    return setPngDpi(await toPng(r.render(elements, { full: true })));
  } finally {
    r.destroy();
  }
}

/* ---------- where things go ---------- */
// The artwork's outer box inside its print area, in % of the area (turned items are measured as turned).
function artworkBox(els) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of els) {
    const w = e.width || 0;
    const h = e.height || 0;
    const cx = (e.x || 0) + w / 2;
    const cy = (e.y || 0) + h / 2;
    const a = ((e.rotation || 0) * Math.PI) / 180;
    // (a turned item's % sizes are of different lengths — the area is not square — but for a guide this is close enough)
    const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
    x0 = Math.min(x0, cx - hw);
    x1 = Math.max(x1, cx + hw);
    y0 = Math.min(y0, cy - hh);
    y1 = Math.max(y1, cy + hh);
  }
  if (!Number.isFinite(x0)) return null;
  const c = (v) => Math.max(0, Math.min(100, v));
  return { x0: c(x0), y0: c(y0), x1: c(x1), y1: c(y1) };
}

// Where the ARTWORK lands on the garment for one size — what the print team measures on the tee.
//   down:   its top edge in cm below the collar (fromCollar: the area has the print team's start line), else
//           below the side's usual start line (the top of the main area) or, on a sleeve, the sleeve area's top
//   across: its centre's distance from the tee's centre line, + = the wearer's left
//           (sleeves: from the sleeve area's centre, as seen in the file)
// box = the artwork's box in % of the area.
function artworkSpot(area, size, box, [w, h]) {
  const left = (box.x0 / 100) * w;
  const top = (box.y0 / 100) * h;
  const aw = ((box.x1 - box.x0) / 100) * w;
  const ah = ((box.y1 - box.y0) / 100) * h;
  const mid = left + aw / 2;
  const sleeve = area.side === "left" || area.side === "right";
  const p = area.place || { align: "centre", topCm: 0 };
  const collar = sleeve ? null : area.collarCm?.[String(size).toUpperCase()];
  const down = collar != null ? collar + top : sleeve || area.main ? top : (p.topCm || 0) + top;
  let across;
  if (sleeve) across = mid - w / 2;
  else {
    // front: the file's right is the wearer's left; back: the opposite
    const gap = p.gapCm || 0;
    across =
      area.side === "back"
        ? (p.align === "wearer-left" ? gap + w : p.align === "wearer-right" ? -gap : w / 2) - mid
        : (p.align === "wearer-left" ? gap : p.align === "wearer-right" ? -(gap + w) : -w / 2) + mid;
  }
  const r = (n) => Math.round(n * 10) / 10;
  return { down: r(down), fromCollar: collar != null, across: r(across), sleeve, side: area.side, aw: r(aw), ah: r(ah) };
}

// "17 cm below collar" — a * marks a distance that is not from the collar (explained under the design)
const downText = (s) =>
  s.fromCollar
    ? `${fmtCm(s.down)} cm below collar`
    : `${fmtCm(Math.abs(s.down))} cm ${s.down >= 0 ? "below" : "above"} ${s.sleeve ? "sleeve" : s.side} start*`;
const acrossText = (s) =>
  Math.abs(s.across) < 0.3
    ? s.sleeve ? "centred on sleeve" : "centred"
    : s.sleeve
      ? `${fmtCm(Math.abs(s.across))} cm ${s.across > 0 ? "right" : "left"} of sleeve centre`
      : `${fmtCm(Math.abs(s.across))} cm to wearer's ${s.across > 0 ? "LEFT" : "RIGHT"}`;

// A picture for the print team that is NOT printed: the print area on the tee's colour with the artwork
// in it, a cm ruler along the top and left, the centre lines, and the artwork's box with its distances.
async function placementGuide({ canvas, wCm, hCm, box, tee, title, onTee = [] }) {
  const s = Math.min(900 / wCm, 1000 / hCm); // px per cm
  const W = Math.round(wCm * s);
  const H = Math.round(hCm * s);
  const m = { left: 78, top: 96, right: 40, bottom: 104 + onTee.length * 24 };
  const c = document.createElement("canvas");
  c.width = W + m.left + m.right;
  c.height = H + m.top + m.bottom;
  const g = c.getContext("2d");
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#141110";
  g.font = "bold 22px Arial";
  g.fillText(title, m.left, 34);
  g.font = "15px Arial";
  g.fillStyle = "#B42318";
  g.fillText("PLACEMENT GUIDE — NOT FOR PRINTING. The print file is this whole area; line up its edges, do not centre the artwork by itself.", m.left, 60, W + m.right - 8);
  // the area on the tee's colour, with the artwork
  g.fillStyle = tee || "#EEEEEE";
  g.fillRect(m.left, m.top, W, H);
  g.drawImage(canvas, m.left, m.top, W, H);
  g.strokeStyle = "#141110";
  g.lineWidth = 2;
  g.setLineDash([10, 7]);
  g.strokeRect(m.left, m.top, W, H);
  // centre lines
  g.strokeStyle = "rgba(20,17,16,.45)";
  g.lineWidth = 1;
  g.setLineDash([4, 6]);
  g.beginPath();
  g.moveTo(m.left + W / 2, m.top);
  g.lineTo(m.left + W / 2, m.top + H);
  g.moveTo(m.left, m.top + H / 2);
  g.lineTo(m.left + W, m.top + H / 2);
  g.stroke();
  g.setLineDash([]);
  // rulers: a tick every cm, a number every 5 cm
  g.strokeStyle = "#141110";
  g.fillStyle = "#141110";
  g.font = "12px Arial";
  g.textAlign = "center";
  for (let cm = 0; cm <= wCm + 0.001; cm++) {
    const x = m.left + cm * s;
    const long = cm % 5 === 0;
    g.beginPath();
    g.moveTo(x, m.top - (long ? 12 : 6));
    g.lineTo(x, m.top);
    g.stroke();
    if (long) g.fillText(String(cm), x, m.top - 16);
  }
  g.textAlign = "right";
  for (let cm = 0; cm <= hCm + 0.001; cm++) {
    const y = m.top + cm * s;
    const long = cm % 5 === 0;
    g.beginPath();
    g.moveTo(m.left - (long ? 12 : 6), y);
    g.lineTo(m.left, y);
    g.stroke();
    if (long) g.fillText(String(cm), m.left - 16, y + 4);
  }
  g.textAlign = "left";
  g.fillText("cm", m.left - 60, m.top - 16);
  // the artwork's box and its distances
  if (box) {
    const bx = m.left + (box.x0 / 100) * W;
    const by = m.top + (box.y0 / 100) * H;
    const bw = ((box.x1 - box.x0) / 100) * W;
    const bh = ((box.y1 - box.y0) / 100) * H;
    g.strokeStyle = "#D6006E";
    g.lineWidth = 2;
    g.strokeRect(bx, by, bw, bh);
    const left = (box.x0 / 100) * wCm;
    const top = (box.y0 / 100) * hCm;
    const aw = ((box.x1 - box.x0) / 100) * wCm;
    const ah = ((box.y1 - box.y0) / 100) * hCm;
    g.fillStyle = "#141110";
    g.font = "bold 16px Arial";
    const y = m.top + H + 30;
    g.fillText(`Artwork (pink box): ${fmtCm(aw)} × ${fmtCm(ah)} cm`, m.left, y);
    g.font = "15px Arial";
    g.fillText(`It starts ${fmtCm(left)} cm from the LEFT edge and ${fmtCm(top)} cm from the TOP edge of the area.`, m.left, y + 24, W + m.right - 8);
    g.fillText(`Space left on the right: ${fmtCm(wCm - left - aw)} cm · at the bottom: ${fmtCm(hCm - top - ah)} cm.`, m.left, y + 46, W + m.right - 8);
    // where that is on the tee itself
    g.font = "bold 15px Arial";
    onTee.forEach((line, n) => g.fillText(`ON THE TEE · ${line}`, m.left, y + 74 + n * 24, W + m.right - 8));
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("guide failed"))), "image/jpeg", 0.9));
}

/* ---------- names ---------- */
const safe = (s) =>
  String(s || "")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "design";
const fmtCm = (n) => String(Math.round(n * 10) / 10);

/**
 * Builds the ZIP for one order.
 * @param pack     reply of GET /api/customizations/admin/order/:orderId
 * @param onStep   (done, total, label) progress callback
 * @returns {{ blob: Blob, fileName: string, warnings: string[] }}
 */
export async function buildPrintPack(pack, onStep = () => {}) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const root = zip.folder(`IDENTEE-${safe(pack.order.number)}-print-files`);
  const warnings = [];
  const designs = pack.designs.filter((d) => !d.missing);
  if (pack.designs.length !== designs.length) warnings.push("A design in this order no longer exists — it has no print files.");

  const total = designs.reduce((n, d) => n + d.areas.reduce((m, a) => m + a.files.length, 0), 0);
  let done = 0;
  const line = "-".repeat(78);
  const sheet = [
    `IDENTEE · ORDER ${pack.order.number} · ${pack.order.customer || "-"} · ${new Date(pack.order.createdAt).toLocaleDateString("en-IN")}`,
    line,
    "Print each file at 100% (300 DPI). Line up the file's edges — never crop the artwork.",
    "Then check the artwork on the tee with a tape:",
    "  TOP  = from the collar (at the centre) down to the artwork's top edge",
    "  SIDE = artwork's centre from the tee's centre line (wearer's left / right)",
    line,
    "",
  ];

  for (const [i, d] of designs.entries()) {
    const title = d.name || `Design ${i + 1}`;
    const folder = root.folder(`${String(i + 1).padStart(2, "0")}-${safe(title)}`);
    const pieces = d.lines.reduce((n, l) => n + l.qty, 0);
    const checks = []; // problems to see before printing
    const rows = []; // { size, player?, label, spot, file }
    sheet.push(`DESIGN ${i + 1}: ${title}`, `${d.garment.label} · ${d.colour.name}${d.colour.hex ? ` (${d.colour.hex})` : ""} · ${pieces} tee${pieces === 1 ? "" : "s"}: ${d.lines.map((l) => `${l.size} × ${l.qty}`).join(", ")}`);
    if (d.players?.length && !d.playersMatch) checks.push("The player list does not match the sizes ordered — ask the customer before printing.");
    if (d.layoutVersion !== 2) {
      warnings.push(`“${title}” was saved in an older format and can't be made into print files.`);
      sheet.push("! Older design format — no print files. Ask the customer to re-make it.", "", "");
      continue;
    }

    // pictures (originals) and fonts must be ready before drawing
    onStep(done, total, `Loading pictures for “${title}”…`);
    // a picture the admin had enlarged for printing is used in place of the small one the customer chose
    const elements = d.elements.map((e) => (e.type === "image" && e.printSrc ? { ...e, src: e.printSrc } : e));
    const srcs = imageSrcs(elements);
    const failed = [];
    await Promise.all(srcs.map((s) => loadImage(s, { full: true }).catch(() => failed.push(s))));
    if (failed.length) {
      throw new Error(`${failed.length} picture${failed.length === 1 ? "" : "s"} in “${title}” couldn't be loaded, so its print files would be wrong. Check the internet connection and try again.`);
    }
    const missingFonts = await fontsReady(elements);
    if (missingFonts.length) {
      throw new Error(`The font${missingFonts.length === 1 ? "" : "s"} ${missingFonts.join(", ")} didn't load, so the text would print in the wrong font. Try again.`);
    }

    for (const area of d.areas) {
      const els = elements.filter((e) => e.position === area.key).map((e, n) => ({ ...e, id: e.id ?? `${area.key}-${n}` }));
      const guided = new Set(); // one guide picture per print size of this area
      for (const f of area.files) {
        const [w, h] = f.cm;
        // a player's own file: their name and number in place of the marked texts
        const who = f.player ? `${String(f.player.n).padStart(2, "0")}-${safe(playerLabel(f.player))}` : "";
        const drawn = f.player ? playerElements(els, f.player, cmToPx(w), cmToPx(h)) : els;
        const name = `${safe(area.label)}_${who ? `${who}_` : ""}${f.sizes.join("-")}_${fmtCm(w)}x${fmtCm(h)}cm_${PRINT_DPI}dpi.png`;
        onStep(done, total, `Drawing ${area.label} (${f.player ? playerLabel(f.player) : f.sizes.join(", ")}) for “${title}”…`);
        folder.file(name, await renderPrintFile(drawn, f.cm));
        done += 1;
        const box = artworkBox(drawn);
        for (const size of f.sizes) rows.push({ size, player: f.player || null, label: area.label, spot: box ? artworkSpot(area, size, box, f.cm) : null, file: name });

        // a guide picture with a ruler, one per print size
        const sizeKey = `${fmtCm(w)}x${fmtCm(h)}`;
        if (!guided.has(sizeKey)) {
          guided.add(sizeKey);
          // every size printed from a file of this size, with where its artwork lands
          const sizes = [...new Set(area.files.filter((x) => x.cm.join("x") === f.cm.join("x")).flatMap((x) => x.sizes))];
          const onTee = box ? sizes.map((sz) => artworkSpot(area, sz, box, f.cm)).map((sp, n) => `Size ${sizes[n]}: top ${downText(sp)} · side ${acrossText(sp)}`) : [];
          const small = new AreaRenderer(Math.round(w * 40), Math.round(h * 40));
          try {
            const guide = await placementGuide({
              canvas: small.render(drawn, { full: true }),
              wCm: w,
              hCm: h,
              box,
              tee: d.colour.hex,
              onTee,
              title: `${area.label} · ${fmtCm(w)} × ${fmtCm(h)} cm · size${f.sizes.length === 1 ? "" : "s"} ${f.sizes.join(", ")}${f.player ? ` (shown: ${playerLabel(f.player)})` : ""}`,
            });
            folder.file(`guide-${safe(area.label)}_${sizeKey}cm.jpg`, guide);
          } catch {
            warnings.push(`Couldn't make the placement guide for ${area.label} of “${title}”.`);
          } finally {
            small.destroy();
          }
        }

        // picture sharpness at this print size
        for (const e of els.filter((x) => x.type === "image")) {
          const img = cachedImage(e.src, true);
          const dpi = img ? Math.round(img.naturalWidth / ((((e.width || 0) / 100) * w) / 2.54)) : 0;
          if (dpi && dpi < LOW_DPI) checks.push(`${area.label} (${f.sizes.join(", ")}): a picture is only ${dpi} DPI at its print size — it may look blurry.`);
        }
      }
    }

    if (checks.length) {
      sheet.push("", "CHECK FIRST:", ...checks.map((c) => `  ! ${c}`));
      checks.forEach((c) => warnings.push(`“${title}”: ${c}`));
    }
    // one block per size (team order: per player), one line per print
    const printLine = (r) =>
      `  ${r.label.padEnd(21)} ${(r.spot ? `${fmtCm(r.spot.aw)} × ${fmtCm(r.spot.ah)} cm` : "-").padEnd(15)} ${(r.spot ? downText(r.spot) : "-").padEnd(27)} ${(r.spot ? acrossText(r.spot) : "-").padEnd(24)} ${r.file}`;
    const head = `  ${"PRINT".padEnd(21)} ${"ARTWORK".padEnd(15)} ${"TOP".padEnd(27)} ${"SIDE".padEnd(24)} FILE`;
    const blocks = d.players?.length
      ? d.players.map((p) => ({
          title: `PLAYER ${String(p.n).padStart(2, "0")} · ${p.name || "-"} · no. ${p.number || "-"} · size ${p.size}`,
          rows: rows.filter((r) => (r.player ? r.player.n === p.n : r.size === p.size)),
        }))
      : d.lines.map((l) => ({ title: `SIZE ${l.size} · ${l.qty} tee${l.qty === 1 ? "" : "s"}`, rows: rows.filter((r) => r.size === l.size) }));
    for (const b of blocks) sheet.push("", b.title, head, ...b.rows.map(printLine));
    // a * distance: what it is measured from
    const starred = [...new Set(rows.filter((r) => r.spot && !r.spot.fromCollar).map((r) => (r.spot.sleeve ? "sleeve" : r.spot.side)))];
    if (starred.length) {
      const mains = Object.fromEntries(d.areas.filter((a) => a.mainLabel).map((a) => [a.side, a.mainLabel]));
      sheet.push("", ...starred.map((side) => (side === "sleeve" ? "* sleeve start = the top of the sleeve print area (your usual sleeve position)." : `* ${side} start = your usual ${side} print start line (the top of ${mains[side] || `the main ${side} area`}).`)));
    }
    const texts = elements.filter((e) => e.type === "text");
    if (texts.length) sheet.push(`Text: ${texts.map((e) => `${d.players?.length && e.role ? `[each player's ${e.role}]` : `“${e.text}”`} (${e.fontFamily}${e.color ? `, ${e.color}` : ""})`).join("; ")}`);

    // the customer's preview pictures, to check the print against
    for (const side of ["front", "back", "left", "right"]) {
      const url = d.mockups?.[side];
      if (!url) continue;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        folder.file(`preview-${side}.jpg`, await r.arrayBuffer());
      } catch {
        warnings.push(`Couldn't add the ${side} preview of “${title}”.`);
      }
    }
    sheet.push("", line, "");
  }

  onStep(done, total, "Packing the ZIP…");
  root.file("ORDER-SHEET.txt", sheet.join("\r\n"));
  const blob = await zip.generateAsync({ type: "blob" }); // PNGs are already compressed
  onStep(total, total, "Done");
  return { blob, fileName: `IDENTEE-${safe(pack.order.number)}-print-files.zip`, warnings };
}
