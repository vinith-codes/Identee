// studio/shrinkPhoto.js — a photo from the phone made ready to upload. Returns { file, w, h } — the size is also
// what the print-quality check uses.
//
// 15 Nov 2026: photos keep their full size now (print files were blurry where small pictures had to be enlarged).
// A photo the server can take (up to 25 MB) and no longer than 8000 px is sent as it is; only one over either
// limit is made smaller here (at most 8000 px on its long side, then 6000, 4000, 3000 until it fits), as a JPEG.
// (Before: everything over 4 MB was made 3000 px — the server took only 10 MB.)
//
// 12 Nov 2026: every picture is opened here before it is sent. One that can't be opened (a damaged file, or a
// format the browser doesn't know) is refused with a plain message — it used to go on the tee as an invisible
// picture that Review called "sharp". Used by the Assistant's 📎, the Upload button and Photo to art, so all three
// take the same photos (a 19 MB phone photo too).
//   keepClear: a see-through picture (a logo as PNG or WebP) that has to be made smaller stays see-through (PNG).
export const MAX_SIDE = 8000;
export const MAX_BYTES = 25 * 1024 * 1024; // what the server takes
const STEPS = [MAX_SIDE, 6000, 4000, 3000]; // made smaller in these steps until the server can take it

export class PhotoError extends Error {}

export const PHOTO_DAMAGED = "This picture file is damaged and can’t be opened. Please choose another one.";
export const PHOTO_UNKNOWN = "This photo can’t be opened here. Choose a JPG or PNG (on iPhone, take a screenshot of it and send that).";

// what to tell the customer about a picture that can't be opened: a JPG / PNG / WebP is damaged; anything else
// (an iPhone HEIC, a PDF renamed…) is a kind this browser doesn't know
export const cantOpenMessage = (type) => (/^image\/(png|jpe?g|webp)$/.test(type || "") ? PHOTO_DAMAGED : PHOTO_UNKNOWN);

const toBlob = (canvas, type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));

const draw = (bmp, W, H, white) => {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (white) {
    g.fillStyle = "#fff"; // (a transparent PNG made into a JPEG gets white, not black)
    g.fillRect(0, 0, W, H);
  }
  g.drawImage(bmp, 0, 0, W, H);
  return canvas;
};

// does the picture have see-through parts? (looked at on a small copy: quick, and enough to tell)
const isClear = (bmp) => {
  try {
    const k = Math.min(1, 200 / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * k));
    const H = Math.max(1, Math.round(bmp.height * k));
    const data = draw(bmp, W, H, false).getContext("2d").getImageData(0, 0, W, H).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  } catch {
    // can't tell: treated as a plain photo
  }
  return false;
};

export async function shrinkPhoto(file, { keepClear = false } = {}) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new PhotoError("That isn’t a photo. Choose a JPG, PNG or WebP picture.");
  if (!file.size) throw new PhotoError(PHOTO_DAMAGED);
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError(cantOpenMessage(file.type));
  }
  const w = bmp.width;
  const h = bmp.height;
  if (!w || !h) {
    bmp.close?.();
    throw new PhotoError(cantOpenMessage(file.type));
  }
  // within both limits: sent as it is, at full size (a JPG, PNG or WebP the server takes)
  if (fitsAsIs(file, w, h)) return close(bmp, { file, w, h });
  const base = (file.name || "photo").replace(/\.[^.]+$/, "");

  // a see-through logo stays see-through: a PNG, made smaller until the server can take it
  if (keepClear && /^image\/(png|webp|gif|avif)$/.test(file.type) && isClear(bmp)) {
    for (const side of [...STEPS, 2400, 1800, 1200]) {
      const k = Math.min(1, side / Math.max(w, h));
      const W = Math.round(w * k);
      const H = Math.round(h * k);
      const blob = await toBlob(draw(bmp, W, H, false), "image/png");
      if (blob && blob.size <= MAX_BYTES) return close(bmp, { file: new File([blob], `${base}.png`, { type: "image/png" }), w: W, h: H });
    }
    // (still too big as a PNG: it goes on as a JPEG below, on white)
  }

  // a JPEG, as big as the server takes: 8000 px first, smaller only while it is still over 25 MB. (A phone that
  // can't draw that big — an iPhone stops at about 16 million pixels — gives nothing back: the next step is tried.)
  let tried = 0;
  let last = null;
  for (const side of STEPS) {
    const k = Math.min(1, side / Math.max(w, h));
    const W = Math.round(w * k);
    const H = Math.round(h * k);
    if (tried && W >= tried) continue; // (the same size again would not help)
    tried = W;
    const blob = await toBlob(draw(bmp, W, H, true), "image/jpeg", 0.9);
    if (!blob) continue;
    last = { file: new File([blob], `${base}.jpg`, { type: "image/jpeg" }), w: W, h: H };
    if (blob.size <= MAX_BYTES) break;
  }
  bmp.close?.();
  if (!last) throw new PhotoError("The photo couldn’t be prepared. Try another one.");
  return last; // (still over 25 MB after every step: the server says so, in its own words)
}

// a photo sent as it is: a kind the server takes, within 25 MB and 8000 px (15 Nov 2026)
export const fitsAsIs = (file, w, h) => /^image\/(png|jpe?g|webp)$/.test(file?.type || "") && (file?.size || 0) <= MAX_BYTES && Math.max(w, h) <= MAX_SIDE;

const close = (bmp, out) => {
  bmp.close?.();
  return out;
};
