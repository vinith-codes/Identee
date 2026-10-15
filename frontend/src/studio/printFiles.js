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
// The artwork's outer box inside its print area, in % of the area. Measured in cm (the area is rarely square),
// so a turned item — text running up a Vertical Front — is measured as it really sits.
function artworkBox(els, [wCm, hCm]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of els) {
    const w = ((e.width || 0) / 100) * wCm;
    const h = ((e.height || 0) / 100) * hCm;
    const cx = ((e.x || 0) / 100) * wCm + w / 2;
    const cy = ((e.y || 0) / 100) * hCm + h / 2;
    const a = ((e.rotation || 0) * Math.PI) / 180;
    const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
    x0 = Math.min(x0, cx - hw);
    x1 = Math.max(x1, cx + hw);
    y0 = Math.min(y0, cy - hh);
    y1 = Math.max(y1, cy + hh);
  }
  if (!Number.isFinite(x0)) return null;
  const c = (v) => Math.max(0, Math.min(100, v));
  return { x0: c((x0 / wCm) * 100), y0: c((y0 / hCm) * 100), x1: c((x1 / wCm) * 100), y1: c((y1 / hCm) * 100) };
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

// SIDE in words: "centred · 5 cm each side", "8.8 cm to wearer's LEFT"
const acrossText = (s) =>
  Math.abs(s.across) < 0.3
    ? s.sleeve ? "centred on sleeve" : `centred · ${fmtCm(s.aw / 2)} cm each side`
    : s.sleeve
      ? `${fmtCm(Math.abs(s.across))} cm ${s.across > 0 ? "right" : "left"} of sleeve centre`
      : `${fmtCm(Math.abs(s.across))} cm to wearer's ${s.across > 0 ? "LEFT" : "RIGHT"}`;

/* ---------- the job card: one page per size (team order: per player) ---------- */
// What the print team reads: the order and the size at the top, the tee's front and back with every print
// in its place (numbered ①②③, with the TOP and SIDE arrows), and a table with one line per print.
// NOT for printing on the tee. Prints and distances are to scale; the tee's outline is a sketch.
const MAP_PX = 12; // px per cm on the tee drawings
// the usual start line when an area has none from the collar (cm) — as in teeModel.js
// (shorts: below the top of the waistband, the co-ord set's leg prints)
const EST_START = { front: 8, back: 7, shorts: 25 };

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
// the print's number in a round badge
function badge(g, n, x, y, r = 19) {
  g.fillStyle = "#141110";
  g.strokeStyle = "#FFFFFF";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "#FFFFFF";
  g.font = `bold ${Math.round(r * 1.15)}px Arial`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), x, y + 1);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
}
const isDark = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110;
};

// One side of the tee with its prints → a 1200 × 1060 canvas.
// prints: [{ n, area, size, cm: [w, h], box, drawn }] all on `side`
function teeMap({ side, prints, tee }) {
  const S = MAP_PX;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1060;
  const g = c.getContext("2d");
  const cx = 600;
  const top = 96; // where the shoulders meet the neck
  const dark = isDark(tee);
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#141110";
  g.font = "bold 40px Arial";
  g.fillText(side === "back" ? "BACK" : "FRONT", 30, 56);

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

  // centre line
  g.strokeStyle = dark ? "rgba(255,255,255,.55)" : "rgba(20,17,16,.45)";
  g.lineWidth = 1.5;
  g.setLineDash([8, 8]);
  g.beginPath();
  g.moveTo(cx, collarY);
  g.lineTo(cx, hem);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = dark ? "#FFFFFF" : "#141110";
  g.font = "bold 16px Arial";
  g.fillText("CENTRE LINE", cx + 8, hem - 14);
  // collar seam
  g.strokeStyle = "#B42318";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 120, collarY);
  g.lineTo(cx + 120, collarY);
  g.stroke();
  pill(g, "COLLAR SEAM", cx - 215, collarY, { size: 17 });

  const starts = new Set();
  for (const pr of prints) {
    const { area, size, box } = pr;
    const [w, h] = pr.cm;
    const p = area.place || { align: "centre", topCm: 0 };
    const collar = area.collarCm?.[String(size).toUpperCase()];
    const startCm = collar != null ? 0 : EST_START[side] || 8; // the line its TOP is measured from, below the collar seam
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
    // TOP: from the collar seam (or the usual start line) down to the artwork's top edge
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
      g.font = "bold 16px Arial";
      g.fillText(`YOUR USUAL ${side.toUpperCase()} START LINE*`, cx + half - 330, fromY - 8);
    }
    const tx = ax + aw / 2;
    g.strokeStyle = "#B42318";
    g.fillStyle = "#B42318";
    g.lineWidth = 3;
    if (ay - fromY > 6) arrow(g, tx, fromY, tx, ay);
    pill(g, `TOP ${fmtCm(Math.abs(spot.down))} cm${spot.fromCollar ? "" : "*"}`, tx + 10, (fromY + ay) / 2, { left: true, size: 22 });
    // SIDE: from the centre line to the artwork's centre
    const my = ay + ah / 2;
    g.strokeStyle = "#1D4ED8";
    g.fillStyle = "#1D4ED8";
    g.lineWidth = 2.5;
    if (Math.abs(spot.across) >= 0.3) {
      arrow(g, cx, my, tx, my);
      // the label goes on the far side of the artwork, away from the centre line and the other prints
      const out = tx > cx;
      pill(g, `SIDE ${fmtCm(Math.abs(spot.across))} cm`, out ? ax + aw + 8 : ax - 8, my, { bg: "#1D4ED8", size: 22, left: out, right: !out });
    } else {
      // centred: half the artwork's width on each side of the centre line
      const by = ay + ah + 14;
      arrow(g, tx, by, ax, by);
      arrow(g, tx, by, ax + aw, by);
      pill(g, `CENTRED · ${fmtCm(spot.aw / 2)} | ${fmtCm(spot.aw / 2)} cm`, tx, by + 28, { bg: "#1D4ED8", size: 20 });
    }
    badge(g, pr.n, ax - 4, ay - 4);
  }
  // the wearer's left and right
  g.fillStyle = "#141110";
  g.font = "bold 20px Arial";
  g.fillText(`← ${side === "back" ? "WEARER'S LEFT" : "WEARER'S RIGHT"}`, 30, hem + 44);
  g.textAlign = "right";
  g.fillText(`${side === "back" ? "WEARER'S RIGHT" : "WEARER'S LEFT"} →`, 1170, hem + 44);
  g.textAlign = "left";
  return c;
}

// The whole job card → JPEG bytes.
// rows: [{ n, label, file, spot, area, size, cm, box, drawn }]   checks / notes: lines of text
async function jobCard({ heading, sub, rows, tee, checks = [], notes = [] }) {
  const W = 2000;
  const sides = ["front", "back"].filter((s) => rows.some((r) => r.area.side === s && r.box));
  const mapW = 960;
  const mapH = Math.round((1060 * mapW) / 1200);
  const rowH = 54;
  const mapsTop = 196;
  const tableTop = mapsTop + (sides.length ? mapH + 30 : 0);
  const H = tableTop + 70 + rows.length * rowH + 30 + (checks.length + notes.length) * 34 + 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, W, H);
  // heading
  g.fillStyle = "#141110";
  g.fillRect(0, 0, W, 104);
  g.fillStyle = "#FFFFFF";
  g.font = "bold 46px Arial";
  g.fillText(heading, 40, 68, W - 80);
  g.fillStyle = "#141110";
  g.font = "26px Arial";
  g.fillText(sub, 40, 148, W - 80);
  g.fillStyle = "#B42318";
  g.font = "bold 22px Arial";
  g.fillText("JOB CARD — NOT FOR PRINTING.   TOP = collar seam (centre) ↓ to the artwork's top edge.   SIDE = tee's centre line → artwork's centre.   Print each PNG at 100%.", 40, 184, W - 80);
  // the tee: front and back side by side
  sides.forEach((side, i) => {
    const map = teeMap({ side, prints: rows.filter((r) => r.area.side === side && r.box), tee });
    const x = sides.length === 1 ? (W - mapW) / 2 : 30 + i * (mapW + 20);
    g.drawImage(map, x, mapsTop, mapW, mapH);
    g.strokeStyle = "#E4DED5";
    g.lineWidth = 2;
    g.strokeRect(x, mapsTop, mapW, mapH);
  });
  // the table: one line per print
  const cols = [
    ["#", 40],
    ["PRINT", 110],
    ["ARTWORK", 480],
    ["TOP (from collar seam)", 720],
    ["SIDE (from centre line)", 1130],
    ["FILE", 1520],
  ];
  g.fillStyle = "#F1ECE4";
  g.fillRect(30, tableTop, W - 60, 56);
  g.fillStyle = "#141110";
  g.font = "bold 22px Arial";
  cols.forEach(([t, x]) => g.fillText(t, x, tableTop + 36));
  rows.forEach((r, i) => {
    const y = tableTop + 56 + i * rowH;
    if (i % 2) {
      g.fillStyle = "#FAF8F4";
      g.fillRect(30, y, W - 60, rowH);
    }
    badge(g, r.n, cols[0][1] + 18, y + rowH / 2, 18);
    g.fillStyle = "#141110";
    g.font = "bold 24px Arial";
    g.fillText(r.label, cols[1][1], y + 35, 360);
    g.font = "24px Arial";
    const s = r.spot;
    g.fillText(s ? `${fmtCm(s.aw)} × ${fmtCm(s.ah)} cm` : "-", cols[2][1], y + 35, 230);
    g.fillText(s ? (s.sleeve ? `${fmtCm(s.down)} cm from sleeve top*` : `${fmtCm(Math.abs(s.down))} cm ${s.down >= 0 ? "below" : "above"}${s.fromCollar ? "" : ` ${s.side} start*`}`) : "-", cols[3][1], y + 35, 400);
    g.fillText(s ? acrossText(s) : "-", cols[4][1], y + 35, 380);
    g.font = "20px Arial";
    g.fillStyle = "#5A524A";
    g.fillText(r.file, cols[5][1], y + 35, W - cols[5][1] - 40);
  });
  // problems and notes
  let y = tableTop + 56 + rows.length * rowH + 44;
  g.font = "bold 24px Arial";
  g.fillStyle = "#B42318";
  for (const t of checks) {
    g.fillText(`! ${t}`, 40, y, W - 80);
    y += 34;
  }
  g.font = "22px Arial";
  g.fillStyle = "#5A524A";
  for (const t of notes) {
    g.fillText(t, 40, y, W - 80);
    y += 34;
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("job card failed"))), "image/jpeg", 0.9));
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
  const date = new Date(pack.order.createdAt).toLocaleDateString("en-IN");
  const sheet = [
    `IDENTEE · ORDER ${pack.order.number} · ${pack.order.customer || "-"} · ${date}`,
    "",
    "Open the JOB-CARD picture of each size: it shows where every print goes, with the measurements.",
    "Print each PNG at 100% (300 DPI). The number at the start of a file name is the print's number on the job card.",
    "",
  ];

  for (const [i, d] of designs.entries()) {
    const title = d.name || `Design ${i + 1}`;
    const folder = root.folder(`${String(i + 1).padStart(2, "0")}-${safe(title)}`);
    const pieces = d.lines.reduce((n, l) => n + l.qty, 0);
    const checks = []; // problems to see before printing
    const rows = []; // { n, size, player?, label, spot, file, area, cm, box, drawn }
    const colour = `${d.colour.name}${d.colour.hex ? ` (${d.colour.hex})` : ""}`;
    sheet.push(`DESIGN ${i + 1}: ${title} · ${d.garment.label} · ${colour} · ${pieces} tee${pieces === 1 ? "" : "s"} (${d.lines.map((l) => `${l.size} × ${l.qty}`).join(", ")})`);
    if (d.players?.length && !d.playersMatch) checks.push("The player list does not match the sizes ordered — ask the customer before printing.");
    if (d.layoutVersion !== 2) {
      warnings.push(`“${title}” was saved in an older format and can't be made into print files.`);
      sheet.push("  ! Older design format — no print files. Ask the customer to re-make it.", "");
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

    // every print gets a number: front first, then back, then the sleeves
    const SIDE_ORDER = { front: 0, back: 1, left: 2, right: 3, shorts: 4 };
    const areas = [...d.areas].sort((a, b) => (SIDE_ORDER[a.side] ?? 9) - (SIDE_ORDER[b.side] ?? 9));
    const files = [];
    for (const [k, area] of areas.entries()) {
      const n = k + 1;
      const els = elements.filter((e) => e.position === area.key).map((e, m) => ({ ...e, id: e.id ?? `${area.key}-${m}` }));
      for (const f of area.files) {
        const [w, h] = f.cm;
        // a player's own file: their name and number in place of the marked texts
        const who = f.player ? `P${String(f.player.n).padStart(2, "0")}-${safe(playerLabel(f.player))}` : f.sizes.join("-");
        const drawn = f.player ? playerElements(els, f.player, cmToPx(w), cmToPx(h)) : els;
        const name = `${n}-${safe(area.label)}_${who}.png`;
        onStep(done, total, `Drawing ${area.label} (${f.player ? playerLabel(f.player) : f.sizes.join(", ")}) for “${title}”…`);
        folder.file(name, await renderPrintFile(drawn, f.cm));
        files.push(name);
        done += 1;
        const box = artworkBox(drawn, f.cm);
        for (const size of f.sizes) rows.push({ n, size, player: f.player || null, label: area.label, spot: box ? artworkSpot(area, size, box, f.cm) : null, file: name, area, cm: f.cm, box, drawn });

        // picture sharpness at this print size
        for (const e of els.filter((x) => x.type === "image")) {
          const img = cachedImage(e.src, true);
          const dpi = img ? Math.round(img.naturalWidth / ((((e.width || 0) / 100) * w) / 2.54)) : 0;
          if (dpi && dpi < LOW_DPI) checks.push(`${n} ${area.label} (${f.sizes.join(", ")}): a picture is only ${dpi} DPI at its print size — it may look blurry.`);
        }
      }
    }
    checks.forEach((c) => warnings.push(`“${title}”: ${c}`));

    // a * distance: what it is measured from
    const mains = Object.fromEntries(d.areas.filter((a) => a.mainLabel).map((a) => [a.side, a.mainLabel]));
    const notesFor = (rs) =>
      [...new Set(rs.filter((r) => r.spot && !r.spot.fromCollar).map((r) => (r.spot.sleeve ? "sleeve" : r.spot.side)))].map((side) =>
        side === "sleeve"
          ? "* Sleeves: measured from the top of the sleeve print area (your usual sleeve position)."
          : side === "shorts"
            ? `* Shorts start = ${EST_START.shorts} cm below the top of the waistband (size M — your usual leg print position). SIDE = from the shorts' centre seam.`
            : `* ${side === "front" ? "Front" : "Back"} start = your usual ${side} print start line (the top of ${mains[side] || `the main ${side} area`}) — no distance from the collar seam yet.`,
      );
    const texts = elements.filter((e) => e.type === "text");
    const fonts = texts.length ? `Text: ${texts.map((e) => `${d.players?.length && e.role ? `[each player's ${e.role}]` : `“${e.text}”`} (${e.fontFamily}${e.color ? `, ${e.color}` : ""})`).join("; ")}` : "";

    // one job card per size (team order: per player)
    const blocks = d.players?.length
      ? d.players.map((p) => ({
          heading: `ORDER ${pack.order.number}  ·  PLAYER ${String(p.n).padStart(2, "0")}: ${p.name || "-"} · no. ${p.number || "-"}  ·  SIZE ${p.size}`,
          key: `player-${String(p.n).padStart(2, "0")}-${safe(playerLabel(p))}`,
          short: `player ${String(p.n).padStart(2, "0")} ${playerLabel(p)}, size ${p.size}`,
          rows: rows.filter((r) => (r.player ? r.player.n === p.n : r.size === p.size)),
        }))
      : d.lines.map((l) => ({
          heading: `ORDER ${pack.order.number}  ·  SIZE ${l.size}  ·  ${l.qty} TEE${l.qty === 1 ? "" : "S"}`,
          key: `size-${safe(l.size)}`,
          short: `size ${l.size} × ${l.qty}`,
          rows: rows.filter((r) => r.size === l.size),
        }));
    for (const b of blocks) {
      const file = `JOB-CARD_${b.key}.jpg`;
      onStep(done, total, `Making the job card (${b.short}) for “${title}”…`);
      try {
        const bRows = [...b.rows].sort((x, y) => x.n - y.n);
        folder.file(file, await jobCard({ heading: b.heading, sub: `${title} · ${d.garment.label} · ${colour} · ${pack.order.customer || ""} · ${date}`, rows: bRows, tee: d.colour.hex, checks, notes: [...notesFor(bRows), fonts].filter(Boolean) }));
        sheet.push(`  ${file.padEnd(36)} → ${b.short}`);
      } catch {
        warnings.push(`Couldn't make the job card for ${b.short} of “${title}”.`);
      }
    }
    sheet.push(`  Print files: ${files.join(", ")}`);
    if (checks.length) sheet.push(...checks.map((c) => `  ! ${c}`));

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
    sheet.push("");
  }

  onStep(done, total, "Packing the ZIP…");
  root.file("ORDER-SHEET.txt", sheet.join("\r\n"));
  const blob = await zip.generateAsync({ type: "blob" }); // PNGs are already compressed
  onStep(total, total, "Done");
  return { blob, fileName: `IDENTEE-${safe(pack.order.number)}-print-files.zip`, warnings };
}
