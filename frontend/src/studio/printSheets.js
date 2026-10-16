// studio/printSheets.js
//
// The print team's day sheets: they print on 58 × 100 cm sheets, a whole day's orders at once ("gang sheets").
// Every print of the day's custom-design orders is drawn at 300 DPI with the same code as one order's print files
// (printFiles.js), cut to the artwork, and laid out on as few sheets as possible:
//   - 1 cm between prints (for cutting), 0.5 cm clear at the sheet's edges
//   - one piece per tee (3 tees = 3 pieces); sizes with the same print size share the artwork but not the piece
//   - a print may be turned 90° when that fits better; its tag always sits under its bottom edge
//   - a tag under each print (order, size, tee colour, print area, n of N; two lines on a narrow print), cut off after
// Layout: MaxRects (best short side fit), largest prints first, each piece on the first sheet it fits.
import { AreaRenderer, cachedImage, imageSrcs, loadImage, playerElements } from "./konvaRender";
import { playerLabel } from "./teamOrder";
import { fontsReady } from "./fonts";
import { PRINT_DPI, cmToPx, setPngDpi, toPng, artworkBox, artworkSpot, acrossText, fmtCm, EST_START } from "./printFiles";

export const SHEET = { w: 58, h: 100 }; // cm
export const GAP = 1; // cm between prints
export const EDGE = 0.5; // cm kept clear at the sheet's edges
const BLEED = 0.1; // cm of empty space kept around the artwork when it is cut out of its area
const MM = 10; // the layout works in whole millimetres
const LOW_DPI = 150;
const SIDE_ORDER = { front: 0, back: 1, left: 2, right: 3, shorts: 4 };

/* ---------- 1. the pieces: every print of every tee ---------- */
/**
 * @param packs   [{ order, designs }] — GET /api/customizations/admin/print-day/:day
 * @param onStep  (done, total, label)
 * @returns {{ arts, pieces, warnings, orders, tees }}
 *   arts:   one per print file — { canvas (300 DPI, cut to the artwork), wCm, hCm, order, design, area, n, file, spot }
 *   pieces: one per tee — { art, tag, k, of }
 */
export async function collectPieces(packs, onStep = () => {}) {
  const arts = [];
  const pieces = [];
  const warnings = [];
  let tees = 0;
  const total = packs.reduce((n, p) => n + p.designs.filter((d) => !d.missing).reduce((m, d) => m + d.areas.reduce((a, x) => a + x.files.length, 0), 0), 0);
  let done = 0;

  for (const pack of packs) {
    const no = pack.order.number;
    for (const [i, d] of pack.designs.entries()) {
      if (d.missing) {
        warnings.push(`Order ${no}: a design no longer exists — it has no prints.`);
        continue;
      }
      const title = d.name || `Design ${i + 1}`;
      tees += d.lines.reduce((n, l) => n + l.qty, 0);
      if (d.layoutVersion !== 2) {
        warnings.push(`Order ${no}: “${title}” was saved in an older format — it is not on the sheets. Ask the customer to re-make it.`);
        continue;
      }
      if (d.players?.length && !d.playersMatch) warnings.push(`Order ${no}: the player list of “${title}” doesn't match the sizes ordered — check before printing.`);

      onStep(done, total, `Loading pictures for order ${no}…`);
      const elements = d.elements.map((e) => (e.type === "image" && e.printSrc ? { ...e, src: e.printSrc } : e));
      const failed = [];
      await Promise.all(imageSrcs(elements).map((s) => loadImage(s, { full: true }).catch(() => failed.push(s))));
      if (failed.length) throw new Error(`${failed.length} picture${failed.length === 1 ? "" : "s"} in order ${no} couldn't be loaded, so its prints would be wrong. Check the internet connection and try again.`);
      const missingFonts = await fontsReady(elements);
      if (missingFonts.length) throw new Error(`The font${missingFonts.length === 1 ? "" : "s"} ${missingFonts.join(", ")} didn't load, so text would print in the wrong font. Try again.`);

      const areas = [...d.areas].sort((a, b) => (SIDE_ORDER[a.side] ?? 9) - (SIDE_ORDER[b.side] ?? 9));
      for (const [k, area] of areas.entries()) {
        const n = k + 1;
        const els = elements.filter((e) => e.position === area.key).map((e, m) => ({ ...e, id: e.id ?? `${area.key}-${m}` }));
        for (const f of area.files) {
          onStep(done, total, `Drawing ${area.label} (${f.player ? playerLabel(f.player) : f.sizes.join(", ")}) for order ${no}…`);
          const [w, h] = f.cm;
          const drawn = f.player ? playerElements(els, f.player, cmToPx(w), cmToPx(h)) : els;
          const box = artworkBox(drawn, f.cm);
          done += 1;
          if (!box) continue; // nothing printed in this area
          const art = { canvas: await cutOut(drawn, f.cm, box), order: no, design: d, title, area, n, file: f, spot: {} };
          art.wCm = art.canvas.width / (PRINT_DPI / 2.54);
          art.hCm = art.canvas.height / (PRINT_DPI / 2.54);
          for (const size of f.sizes) art.spot[size] = artworkSpot(area, size, box, f.cm);
          arts.push(art);

          for (const e of els.filter((x) => x.type === "image")) {
            const img = cachedImage(e.src, true);
            const dpi = img ? Math.round(img.naturalWidth / ((((e.width || 0) / 100) * w) / 2.54)) : 0;
            if (dpi && dpi < LOW_DPI) warnings.push(`Order ${no}, ${area.label} (${f.sizes.join(", ")}): a picture is only ${dpi} DPI at its print size — it may look blurry.`);
          }

          // one piece per tee
          const copies = f.player
            ? [{ size: f.player.size, who: playerLabel(f.player) }]
            : f.sizes.flatMap((size) => Array.from({ length: d.lines.filter((l) => l.size === size).reduce((m, l) => m + l.qty, 0) }, () => ({ size })));
          copies.forEach((c, j) => pieces.push({ art, size: c.size, who: c.who || "", k: j + 1, of: copies.length }));
        }
      }
    }
  }
  for (const p of pieces) {
    p.tag = tagOf(p);
    fitTag(p);
  }
  onStep(total, total, "Laying out the sheets…");
  return { arts, pieces, warnings, orders: packs.length, tees };
}

// one print area at 300 DPI, cut to its artwork (+ a hair of empty space)
async function cutOut(elements, cm, box) {
  const W = cmToPx(cm[0]);
  const H = cmToPx(cm[1]);
  const r = new AreaRenderer(W, H);
  try {
    const full = r.render(elements, { full: true });
    const b = cmToPx(BLEED);
    const x0 = Math.max(0, Math.floor((box.x0 / 100) * W) - b);
    const y0 = Math.max(0, Math.floor((box.y0 / 100) * H) - b);
    const x1 = Math.min(W, Math.ceil((box.x1 / 100) * W) + b);
    const y1 = Math.min(H, Math.ceil((box.y1 / 100) * H) + b);
    const c = document.createElement("canvas");
    c.width = Math.max(1, x1 - x0);
    c.height = Math.max(1, y1 - y0);
    c.getContext("2d").drawImage(full, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  } finally {
    r.destroy();
  }
}

const tagOf = (p) =>
  [`#${p.art.order}`, p.size, p.art.design.colour.name, `${p.art.n}. ${p.art.area.label}`, p.who, p.of > 1 ? `${p.k} of ${p.of}` : ""].filter(Boolean).join(" · ");

// The tag's lines and the room it needs: one line when it fits under the print, else two (order · size · colour /
// print area · n of N) and the piece is given at least the width of its longest line — never squeezed unreadable.
const TAG_FONT = 0.36; // cm (≈ 10 pt)
const TAG_LINE = 0.48; // cm per line
let measurer;
const textCm = (s) => {
  measurer ||= document.createElement("canvas").getContext("2d");
  measurer.font = `600 100px Arial, sans-serif`;
  return (measurer.measureText(s).width / 100) * TAG_FONT;
};
function fitTag(p) {
  const one = `▲ ${p.tag}`;
  const lines =
    textCm(one) <= p.art.wCm
      ? [one]
      : [`▲ ${[`#${p.art.order}`, p.size, p.art.design.colour.name].join(" · ")}`, [`${p.art.n}. ${p.art.area.label}`, p.who, p.of > 1 ? `${p.k} of ${p.of}` : ""].filter(Boolean).join(" · ")];
  p.lines = lines;
  p.tagH = lines.length * TAG_LINE + 0.12;
  p.boxW = Math.max(p.art.wCm, ...lines.map(textCm));
}

/* ---------- 2. the layout ---------- */
// One sheet: MaxRects with best-short-side-fit; every rectangle includes the gap on its right and bottom.
class Sheet {
  constructor(w, h) {
    this.free = [{ x: 0, y: 0, w, h }];
    this.items = [];
  }
  fit(w, h) {
    let best = null;
    for (const f of this.free) {
      for (const [rw, rh, turned] of w === h ? [[w, h, false]] : [[w, h, false], [h, w, true]]) {
        if (rw > f.w || rh > f.h) continue;
        const short = Math.min(f.w - rw, f.h - rh);
        const long = Math.max(f.w - rw, f.h - rh);
        if (!best || short < best.short || (short === best.short && (long < best.long || (long === best.long && f.y < best.y)))) best = { x: f.x, y: f.y, w: rw, h: rh, turned, short, long };
      }
    }
    return best;
  }
  place(r) {
    const next = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
    }
    // drop free rectangles inside another one
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  }
}

/**
 * @returns {{ sheets: [{ items: [{ piece, x, y, turned }] (cm from the sheet's top-left), used }], tooBig: pieces[] }}
 */
export function layOut(pieces) {
  const g = Math.round(GAP * MM);
  const W = Math.round((SHEET.w - 2 * EDGE) * MM) + g;
  const H = Math.round((SHEET.h - 2 * EDGE) * MM) + g;
  const size = (p) => [Math.ceil(p.boxW * MM) + g, Math.ceil((p.art.hCm + p.tagH) * MM) + g];
  // largest first (longest side, then area): big prints are placed while there is room, small ones fill the gaps
  const order = [...pieces].sort((a, b) => {
    const [aw, ah] = size(a);
    const [bw, bh] = size(b);
    return Math.max(bw, bh) - Math.max(aw, ah) || bw * bh - aw * ah;
  });
  const sheets = [];
  const tooBig = [];
  for (const p of order) {
    const [w, h] = size(p);
    let spot = null;
    let sheet = null;
    for (const s of sheets) {
      spot = s.fit(w, h);
      if (spot) {
        sheet = s;
        break;
      }
    }
    if (!spot) {
      sheet = new Sheet(W, H);
      spot = sheet.fit(w, h);
      if (!spot) {
        tooBig.push(p);
        continue;
      }
      sheets.push(sheet);
    }
    sheet.place(spot);
    sheet.items.push({ piece: p, x: EDGE + spot.x / MM, y: EDGE + spot.y / MM, turned: spot.turned });
  }
  const area = SHEET.w * SHEET.h;
  return {
    sheets: sheets.map((s) => ({ items: s.items, used: s.items.reduce((n, it) => n + it.piece.art.wCm * it.piece.art.hCm, 0) / area })),
    tooBig,
  };
}

/* ---------- 3. drawing a sheet ---------- */
/**
 * @param pxPerCm  118.11 for the 300-DPI print, ~6 for a preview
 * @param preview  draws the sheet's paper, each print's outline and a light tag (not for printing)
 */
export function drawSheet(sheet, pxPerCm, { preview = false } = {}) {
  const c = document.createElement("canvas");
  c.width = Math.round(SHEET.w * pxPerCm);
  c.height = Math.round(SHEET.h * pxPerCm);
  const g = c.getContext("2d");
  if (preview) {
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.imageSmoothingQuality = "high";
  for (const it of sheet.items) {
    const { art } = it.piece;
    const w = art.wCm * pxPerCm;
    const h = art.hCm * pxPerCm;
    const tag = it.piece.tagH * pxPerCm;
    g.save();
    // turned: 90° clockwise — the print's top faces the sheet's right edge, its tag the left edge
    if (it.turned) {
      g.translate(it.x * pxPerCm + h + tag, it.y * pxPerCm);
      g.rotate(Math.PI / 2);
    } else g.translate(it.x * pxPerCm, it.y * pxPerCm);
    if (preview) {
      g.fillStyle = "rgba(201,162,75,0.10)";
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(art.canvas, 0, 0, w, h);
    if (preview) {
      g.strokeStyle = "rgba(21,19,15,0.35)";
      g.lineWidth = Math.max(1, pxPerCm * 0.04);
      g.strokeRect(0, 0, w, h);
    }
    // the tag, under the print's bottom edge (reads the right way up when the print is upright)
    g.fillStyle = preview ? "rgba(21,19,15,0.75)" : "#4A4A4A";
    g.font = `600 ${TAG_FONT * pxPerCm}px Arial, sans-serif`;
    g.textBaseline = "middle";
    it.piece.lines.forEach((line, n) => g.fillText(line, 0, h + (0.06 + TAG_LINE * (n + 0.5)) * pxPerCm));
    g.restore();
  }
  return c;
}

/* ---------- 4. the download ---------- */
const where = (art, size) => {
  const s = art.spot[size];
  if (!s) return "";
  const from = s.fromCollar
    ? "below the collar seam"
    : s.sleeve
      ? "below the top of the sleeve print area"
      : s.side === "shorts"
        ? `below the shorts' usual start (${EST_START.shorts} cm under the waistband)`
        : `below the usual ${s.side} start line`;
  return `TOP ${fmtCm(s.down)} cm ${from} · SIDE ${acrossText(s)}`;
};

/**
 * The ZIP: SHEET-01.png … (300 DPI, 58 × 100 cm, transparent) + SHEET-LIST.txt
 * @returns {{ blob, fileName }}
 */
export async function buildSheetsZip(day, layout, { orders, tees, warnings }, onStep = () => {}) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const root = zip.folder(`IDENTEE-print-sheets-${day}`);
  const pxPerCm = PRINT_DPI / 2.54;
  const count = layout.sheets.reduce((n, s) => n + s.items.length, 0);
  const list = [
    `IDENTEE · PRINT SHEETS · orders placed on ${day}`,
    `${orders} order${orders === 1 ? "" : "s"} · ${tees} tee${tees === 1 ? "" : "s"} · ${count} print${count === 1 ? "" : "s"} · ${layout.sheets.length} sheet${layout.sheets.length === 1 ? "" : "s"} of ${SHEET.w} × ${SHEET.h} cm`,
    "",
    `Print each SHEET PNG at 100% (300 DPI) — ${SHEET.w} × ${SHEET.h} cm. ${GAP} cm between prints for cutting.`,
    "Each print has a small tag under its BOTTOM edge (▲ points to the top of the print): order · size · tee colour · print area · n of N.",
    "The tag is printed in the gap — cut it off. A print lying sideways has its top towards the sheet's right edge.",
    "Where each print goes on the tee is listed below (also on that order's job card: Admin → Orders → Designs & print files).",
    "",
  ];
  for (const [i, s] of layout.sheets.entries()) {
    const name = `SHEET-${String(i + 1).padStart(2, "0")}.png`;
    onStep(i, layout.sheets.length, `Drawing sheet ${i + 1} of ${layout.sheets.length} at 300 DPI…`);
    const c = drawSheet(s, pxPerCm);
    root.file(name, setPngDpi(await toPng(c)));
    c.width = 0; // free the big canvas now
    list.push(`${name} — ${s.items.length} print${s.items.length === 1 ? "" : "s"}, ${Math.round(s.used * 100)}% of the sheet used`);
    const rows = [...s.items].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of rows) {
      const p = it.piece;
      list.push(`  ${p.tag}${it.turned ? " (sideways)" : ""}`);
      list.push(`      ${fmtCm(p.art.wCm)} × ${fmtCm(p.art.hCm)} cm at ${fmtCm(it.x)} cm from the left, ${fmtCm(it.y)} cm from the top · on the tee: ${where(p.art, p.size)}`);
    }
    list.push("");
  }
  if (layout.tooBig.length) list.push(`! Not on any sheet (bigger than ${SHEET.w} × ${SHEET.h} cm): ${layout.tooBig.map((p) => p.tag).join("; ")}`, "");
  if (warnings.length) list.push("CHECK BEFORE PRINTING", ...warnings.map((w) => `  ! ${w}`), "");
  root.file("SHEET-LIST.txt", list.join("\r\n"));
  onStep(layout.sheets.length, layout.sheets.length, "Packing the ZIP…");
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, fileName: `IDENTEE-print-sheets-${day}.zip` };
}
