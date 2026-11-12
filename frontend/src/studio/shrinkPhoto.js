// studio/shrinkPhoto.js — a photo from the phone made ready to upload: phones give 4–12 MB photos (the server takes
// at most 10 MB, and mobile data is slow), so a big one is resized on the phone first — at most 3000 px on its long
// side (still sharp enough to print 30+ cm wide), as a JPEG. A small PNG is kept as it is (it may be transparent).
// Returns { file, w, h } — the size is also what the print-quality check uses.
//
// 12 Nov 2026: every picture is opened here before it is sent. One that can't be opened (a damaged file, or a
// format the browser doesn't know) is refused with a plain message — it used to go on the tee as an invisible
// picture that Review called "sharp". Used by the Assistant's 📎, the Upload button and Photo to art, so all three
// take the same photos (a 19 MB phone photo too).
//   keepClear: a see-through picture (a logo as PNG or WebP) that has to be made smaller stays see-through (PNG).
const MAX_SIDE = 3000;
const MAX_BYTES = 10 * 1024 * 1024; // what the server takes
const KEEP_PNG = 8 * 1024 * 1024;
const KEEP_JPEG = 4 * 1024 * 1024;

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
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const small = scale === 1;
  if (small && file.type === "image/png" && file.size <= KEEP_PNG) return close(bmp, { file, w, h });
  if (small && /^image\/(jpe?g|webp)$/.test(file.type) && file.size <= KEEP_JPEG) return close(bmp, { file, w, h });
  const base = (file.name || "photo").replace(/\.[^.]+$/, "");

  // a see-through logo stays see-through: a PNG, made smaller until the server can take it
  if (keepClear && /^image\/(png|webp|gif|avif)$/.test(file.type) && isClear(bmp)) {
    for (const side of [MAX_SIDE, 2400, 1800, 1200]) {
      const k = Math.min(1, side / Math.max(w, h));
      const W = Math.round(w * k);
      const H = Math.round(h * k);
      const blob = await toBlob(draw(bmp, W, H, false), "image/png");
      if (blob && blob.size <= MAX_BYTES) return close(bmp, { file: new File([blob], `${base}.png`, { type: "image/png" }), w: W, h: H });
    }
    // (still too big as a PNG: it goes on as a JPEG below, on white)
  }

  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const canvas = draw(bmp, W, H, true);
  bmp.close?.();
  const blob = await toBlob(canvas, "image/jpeg", 0.9);
  if (!blob) throw new PhotoError("The photo couldn’t be prepared. Try another one.");
  return { file: new File([blob], `${base}.jpg`, { type: "image/jpeg" }), w: W, h: H };
}

const close = (bmp, out) => {
  bmp.close?.();
  return out;
};
