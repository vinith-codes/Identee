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
import { AreaRenderer, cachedImage, imageSrcs, loadImage } from "./konvaRender";
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
  const sheet = [
    `IDENTEE print files — order ${pack.order.number}`,
    `Customer: ${pack.order.customer || "-"}   Placed: ${new Date(pack.order.createdAt).toLocaleString("en-IN")}`,
    `All files: transparent PNG, ${PRINT_DPI} DPI, printed at 100% (the file's size in cm is the print size).`,
    "",
  ];

  for (const [i, d] of designs.entries()) {
    const title = d.name || `Design ${i + 1}`;
    const folder = root.folder(`${String(i + 1).padStart(2, "0")}-${safe(title)}`);
    const pieces = d.lines.reduce((n, l) => n + l.qty, 0);
    sheet.push(
      `${i + 1}. ${title}`,
      `   Garment: ${d.garment.label} · colour ${d.colour.name}${d.colour.hex ? ` (${d.colour.hex})` : ""}`,
      `   Sizes:   ${d.lines.map((l) => `${l.size} × ${l.qty}`).join(", ")}  (${pieces} piece${pieces === 1 ? "" : "s"})`,
    );
    if (d.layoutVersion !== 2) {
      warnings.push(`“${title}” was saved in an older format and can't be made into print files.`);
      sheet.push("   ! Older design format — no print files. Ask the customer to re-make it.", "");
      continue;
    }

    // pictures (originals) and fonts must be ready before drawing
    onStep(done, total, `Loading pictures for “${title}”…`);
    const srcs = imageSrcs(d.elements);
    const failed = [];
    await Promise.all(srcs.map((s) => loadImage(s, { full: true }).catch(() => failed.push(s))));
    if (failed.length) {
      throw new Error(`${failed.length} picture${failed.length === 1 ? "" : "s"} in “${title}” couldn't be loaded, so its print files would be wrong. Check the internet connection and try again.`);
    }
    const missingFonts = await fontsReady(d.elements);
    if (missingFonts.length) {
      throw new Error(`The font${missingFonts.length === 1 ? "" : "s"} ${missingFonts.join(", ")} didn't load, so the text would print in the wrong font. Try again.`);
    }

    for (const area of d.areas) {
      const els = d.elements.filter((e) => e.position === area.key).map((e, n) => ({ ...e, id: e.id ?? `${area.key}-${n}` }));
      for (const f of area.files) {
        const [w, h] = f.cm;
        const name = `${safe(area.label)}_${f.sizes.join("-")}_${fmtCm(w)}x${fmtCm(h)}cm_${PRINT_DPI}dpi.png`;
        onStep(done, total, `Drawing ${area.label} (${f.sizes.join(", ")}) for “${title}”…`);
        folder.file(name, await renderPrintFile(els, f.cm));
        done += 1;
        sheet.push(`   ${area.label} — sizes ${f.sizes.join(", ")}: ${fmtCm(w)} × ${fmtCm(h)} cm = ${cmToPx(w)} × ${cmToPx(h)} px  → ${name}`);

        // picture sharpness at this print size
        for (const e of els.filter((x) => x.type === "image")) {
          const img = cachedImage(e.src, true);
          const dpi = img ? Math.round(img.naturalWidth / ((((e.width || 0) / 100) * w) / 2.54)) : 0;
          if (dpi && dpi < LOW_DPI) {
            const msg = `“${title}” · ${area.label} (${f.sizes.join(", ")}): a picture is only ${dpi} DPI at its print size — it may look blurry.`;
            warnings.push(msg);
            sheet.push(`   ! ${msg}`);
          }
        }
      }
    }
    const texts = d.elements.filter((e) => e.type === "text");
    if (texts.length) sheet.push(`   Text: ${texts.map((e) => `“${e.text}” (${e.fontFamily}, ${e.color})`).join("; ")}`);

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
