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

// "17 cm below collar seam" (the print team measures from the seam where the collar rib joins the body) — a * marks a distance that is not from the collar (explained under the design)
const downText = (s) =>
  s.fromCollar
    ? `${fmtCm(s.down)} cm below collar seam`
    : `${fmtCm(Math.abs(s.down))} cm ${s.down >= 0 ? "below" : "above"} ${s.sleeve ? "sleeve" : s.side} start*`;
const acrossText = (s) =>
  Math.abs(s.across) < 0.3
    ? s.sleeve ? "centred on sleeve" : `centred · ${fmtCm(s.aw / 2)} cm each side`
    : s.sleeve
      ? `${fmtCm(Math.abs(s.across))} cm ${s.across > 0 ? "right" : "left"} of sleeve centre`
      : `${fmtCm(Math.abs(s.across))} cm to wearer's ${s.across > 0 ? "LEFT" : "RIGHT"}`;

/* ---------- the tee map: every print of one side, on a sketch of the tee ---------- */
// One picture per size (team order: per player) and side, NOT for printing: the tee with the collar and the
// centre line, each print in its place with the artwork, and arrows with the same cm as the order sheet.
// Prints and distances are to scale; the tee's outline is a sketch.
const MAP_PX = 12; // px per cm
const EST_START = { front: 8, back: 7 }; // the usual start line when an area has none from the collar (cm) — as in teeModel.js

function arrow(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - 14 * Math.cos(a - 0.4), y2 - 14 * Math.sin(a - 0.4));
  g.lineTo(x2 - 14 * Math.cos(a + 0.4), y2 - 14 * Math.sin(a + 0.4));
  g.closePath();
  g.fill();
}
// a label; left / right: x is its left / right end instead of its middle
function pill(g, text, x, y, { bg = "#B42318", fg = "#FFFFFF", size = 22, left = false, right = false } = {}) {
  g.font = `bold ${size}px Arial`;
  const w = g.measureText(text).width + 18;
  const h = size + 12;
  if (left) x += w / 2;
  if (right) x -= w / 2;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, 7);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x, y + 1);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
}

// prints: [{ area, size, cm: [w, h], box, drawn }] all on `side`
async function teeMap({ title, side, prints, tee }) {
  const S = MAP_PX;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1130;
  const g = c.getContext("2d");
  const cx = 600;
  const top = 170; // where the shoulders meet the neck
  const dark = (() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(tee || "");
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110;
  })();
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#141110";
  g.font = "bold 30px Arial";
  g.fillText(title, 40, 50, 1120);
  g.font = "18px Arial";
  g.fillStyle = "#B42318";
  g.fillText("TEE MAP — NOT FOR PRINTING. Measure from the COLLAR SEAM and the CENTRE LINE. Artwork and distances to scale; the tee is a sketch.", 40, 82, 1120);

  // the tee
  const half = 32 * S; // body half width
  const hem = top + 74 * S;
  const neckHalf = 9 * S;
  const drop = (side === "back" ? 2.5 : 8) * S; // neckline depth at the centre
  const rib = 2 * S;
  g.fillStyle = tee || "#EEEEEE";
  g.strokeStyle = "#3A3530";
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(cx - neckHalf - 20, top);
  g.lineTo(cx - half, top + 50);
  g.lineTo(cx - half - 150, top + 240);
  g.lineTo(cx - half - 70, top + 300);
  g.lineTo(cx - half, top + 250);
  g.lineTo(cx - half, hem);
  g.lineTo(cx + half, hem);
  g.lineTo(cx + half, top + 250);
  g.lineTo(cx + half + 70, top + 300);
  g.lineTo(cx + half + 150, top + 240);
  g.lineTo(cx + half, top + 50);
  g.lineTo(cx + neckHalf + 20, top);
  g.closePath();
  g.fill();
  g.stroke();
  // collar rib and the inside of the neck
  g.fillStyle = dark ? "#55504A" : "#D9D1C4";
  g.beginPath();
  g.moveTo(cx - neckHalf - 20, top);
  g.quadraticCurveTo(cx, top + 2 * (drop + rib), cx + neckHalf + 20, top);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = dark ? "#2A2724" : "#BCB2A4";
  g.beginPath();
  g.moveTo(cx - neckHalf, top);
  g.quadraticCurveTo(cx, top + 2 * drop, cx + neckHalf, top);
  g.closePath();
  g.fill();
  g.stroke();
  const collarY = top + drop + rib; // the collar seam at the centre (where the print team measures from)
  const ink = dark ? "#FFFFFF" : "#141110";

  // centre line
  g.strokeStyle = dark ? "rgba(255,255,255,.55)" : "rgba(20,17,16,.45)";
  g.lineWidth = 1.5;
  g.setLineDash([8, 8]);
  g.beginPath();
  g.moveTo(cx, collarY);
  g.lineTo(cx, hem);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = ink;
  g.font = "bold 15px Arial";
  g.fillText("CENTRE LINE", cx + 8, hem - 14);
  // collar line
  g.strokeStyle = "#B42318";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 120, collarY);
  g.lineTo(cx + 120, collarY);
  g.stroke();
  pill(g, "COLLAR SEAM", cx - 210, collarY, { size: 16 });

  const starts = new Set();
  for (const pr of prints) {
    const { area, size, box } = pr;
    const [w, h] = pr.cm;
    const p = area.place || { align: "centre", topCm: 0 };
    const collar = area.collarCm?.[String(size).toUpperCase()];
    const startCm = collar != null ? 0 : EST_START[side] || 8; // the line its TOP is measured from, below the collar
    const areaTop = collar != null ? collar : startCm + (area.main ? 0 : p.topCm || 0);
    const gap = p.gapCm || 0;
    // the viewer's left/right: the wearer's left is on the right of the front, on the left of the back
    const wl = side === "back" ? -1 : 1;
    const x0 = p.align === "wearer-left" ? (wl > 0 ? cx + gap * S : cx - (gap + w) * S) : p.align === "wearer-right" ? (wl > 0 ? cx - (gap + w) * S : cx + gap * S) : cx - (w * S) / 2;
    const y0 = collarY + areaTop * S;
    // the artwork as it prints
    const r = new AreaRenderer(Math.round(w * S), Math.round(h * S));
    try {
      g.drawImage(r.render(pr.drawn, { full: true }), x0, y0, w * S, h * S);
    } finally {
      r.destroy();
    }
    if (!box) continue;
    const spot = artworkSpot(area, size, box, pr.cm);
    const ax = x0 + (box.x0 / 100) * w * S;
    const ay = y0 + (box.y0 / 100) * h * S;
    const aw = ((box.x1 - box.x0) / 100) * w * S;
    const ah = ((box.y1 - box.y0) / 100) * h * S;
    g.strokeStyle = "#D6006E";
    g.lineWidth = 2.5;
    g.strokeRect(ax, ay, aw, ah);
    // what it is: the print's name and the artwork's size, under it (under the CENTRED arrows when centred)
    g.fillStyle = ink;
    g.font = "bold 16px Arial";
    g.textAlign = "center";
    g.fillText(`${area.label} · artwork ${fmtCm(spot.aw)} × ${fmtCm(spot.ah)} cm`, ax + aw / 2, ay + ah + (Math.abs(spot.across) < 0.3 ? 76 : 24));
    g.textAlign = "left";
    // TOP: from the collar (or the usual start line) down to the artwork's top edge
    const fromY = collarY + startCm * S;
    if (collar == null && !starts.has(startCm)) {
      starts.add(startCm);
      g.strokeStyle = "#B42318";
      g.lineWidth = 2;
      g.setLineDash([12, 6]);
      g.beginPath();
      g.moveTo(cx - half + 10, fromY);
      g.lineTo(cx + half - 10, fromY);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#B42318";
      g.font = "bold 15px Arial";
      g.fillText(`YOUR USUAL ${side.toUpperCase()} START LINE*`, cx - half + 14, fromY - 8);
    }
    const tx = ax + aw / 2;
    g.strokeStyle = "#B42318";
    g.fillStyle = "#B42318";
    g.lineWidth = 3;
    if (ay - fromY > 6) arrow(g, tx, fromY, tx, ay);
    pill(g, `TOP ${downText(spot).replace(" cm below collar seam", " cm").replace(/ cm (below|above) .*$/, " cm*")}`, tx + 10, (fromY + ay) / 2, { left: true, size: 20 });
    // SIDE: from the centre line to the artwork's centre
    const my = ay + ah / 2;
    if (Math.abs(spot.across) >= 0.3) {
      g.strokeStyle = "#1D4ED8";
      g.fillStyle = "#1D4ED8";
      arrow(g, cx, my, tx, my);
      // the label goes on the far side of the artwork, away from the centre line and the other prints
      const out = tx > cx;
      pill(g, `SIDE ${fmtCm(Math.abs(spot.across))} cm`, out ? ax + aw + 8 : ax - 8, my, { bg: "#1D4ED8", size: 20, left: out, right: !out });
    } else {
      // centred: half the artwork's width on each side of the centre line
      g.strokeStyle = "#1D4ED8";
      g.fillStyle = "#1D4ED8";
      g.lineWidth = 2.5;
      const by = ay + ah + 14;
      arrow(g, tx, by, ax, by);
      arrow(g, tx, by, ax + aw, by);
      pill(g, `CENTRED · ${fmtCm(spot.aw / 2)} cm | ${fmtCm(spot.aw / 2)} cm`, tx, by + 26, { bg: "#1D4ED8", size: 18 });
    }
  }
  // the wearer's left and right
  g.fillStyle = "#141110";
  g.font = "bold 18px Arial";
  const leftWord = side === "back" ? "WEARER'S LEFT" : "WEARER'S RIGHT";
  const rightWord = side === "back" ? "WEARER'S RIGHT" : "WEARER'S LEFT";
  g.fillText(`← ${leftWord}`, 40, hem + 40);
  g.textAlign = "right";
  g.fillText(`${rightWord} →`, 1160, hem + 40);
  g.textAlign = "left";
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("map failed"))), "image/jpeg", 0.88));
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
    "HOW TO PRINT",
    "  1. Print each PNG at 100% (300 DPI) — it is the artwork at its real size (see-through parts don't print).",
    "  2. Place the artwork on the tee with a measuring tape:",
    "       TOP  = from the collar SEAM (where the collar joins the body, at the centre) down to the artwork's top edge",
    "       SIDE = from the tee's centre line (fold the tee in half) to the artwork",
    "  3. The MAP-….jpg picture of each size shows the same on a drawing of the tee.",
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
        for (const size of f.sizes) rows.push({ size, player: f.player || null, label: area.label, spot: box ? artworkSpot(area, size, box, f.cm) : null, file: name, area, cm: f.cm, box, drawn });

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
      `  ${r.label.padEnd(21)} ${(r.spot ? `${fmtCm(r.spot.aw)} × ${fmtCm(r.spot.ah)} cm` : "-").padEnd(15)} ${(r.spot ? downText(r.spot) : "-").padEnd(27)} ${(r.spot ? acrossText(r.spot) : "-").padEnd(30)} ${r.file}`;
    const head = `  ${"PRINT".padEnd(21)} ${"ARTWORK".padEnd(15)} ${"TOP".padEnd(27)} ${"SIDE".padEnd(30)} FILE`;
    const blocks = d.players?.length
      ? d.players.map((p) => ({
          title: `PLAYER ${String(p.n).padStart(2, "0")} · ${p.name || "-"} · no. ${p.number || "-"} · size ${p.size}`,
          key: `player-${String(p.n).padStart(2, "0")}-${safe(playerLabel(p))}`,
          rows: rows.filter((r) => (r.player ? r.player.n === p.n : r.size === p.size)),
        }))
      : d.lines.map((l) => ({ title: `SIZE ${l.size} · ${l.qty} tee${l.qty === 1 ? "" : "s"}`, key: `size-${safe(l.size)}`, rows: rows.filter((r) => r.size === l.size) }));
    for (const b of blocks) {
      // the tee maps of this block: one per side with prints (sleeves are on the sheet only)
      const maps = [];
      for (const side of ["front", "back"]) {
        const prints = b.rows.filter((r) => r.area.side === side);
        if (!prints.length) continue;
        const file = `MAP-${b.key}-${side}.jpg`;
        onStep(done, total, `Drawing the tee map (${b.title.split(" · ")[0]} ${side}) for “${title}”…`);
        try {
          folder.file(file, await teeMap({ title: `${b.title} · ${side.toUpperCase()} · ${title}`, side, prints, tee: d.colour.hex }));
          maps.push(file);
        } catch {
          warnings.push(`Couldn't make the ${side} tee map for ${b.title} of “${title}”.`);
        }
      }
      sheet.push("", `${b.title}${maps.length ? `   (picture: ${maps.join(", ")})` : ""}`, head, ...b.rows.map(printLine));
    }
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
