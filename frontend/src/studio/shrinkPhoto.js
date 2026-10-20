// studio/shrinkPhoto.js — a photo from the phone made ready to upload: phones give 4–12 MB photos (Cloudinary takes
// at most 10 MB, and mobile data is slow), so a big one is resized on the phone first — at most 3000 px on its long
// side (still sharp enough to print 30+ cm wide), as a JPEG. A small PNG is kept as it is (it may be transparent).
// Returns { file, w, h } — the size is also what the print-quality check uses.
const MAX_SIDE = 3000;
const KEEP_PNG = 8 * 1024 * 1024;
const KEEP_JPEG = 4 * 1024 * 1024;

export class PhotoError extends Error {}

export async function shrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new PhotoError("That isn’t a photo. Choose a JPG, PNG or WebP picture.");
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // (a format this browser can't open, e.g. HEIC outside Safari): sent as it is if the server can take it
    if (/^image\/(png|jpe?g|webp)$/.test(file.type) && file.size <= 10 * 1024 * 1024) return { file, w: 1000, h: 1000 };
    throw new PhotoError("This photo can’t be opened here. Choose a JPG or PNG (on iPhone, take a screenshot of it and send that).");
  }
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const small = scale === 1;
  if (small && file.type === "image/png" && file.size <= KEEP_PNG) return close(bmp, { file, w, h });
  if (small && /^image\/(jpe?g|webp)$/.test(file.type) && file.size <= KEEP_JPEG) return close(bmp, { file, w, h });
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; // (a transparent PNG made into a JPEG gets white, not black)
  g.fillRect(0, 0, W, H);
  g.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.9));
  if (!blob) throw new PhotoError("The photo couldn’t be prepared. Try another one.");
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
  return { file: new File([blob], name, { type: "image/jpeg" }), w: W, h: H };
}

const close = (bmp, out) => {
  bmp.close?.();
  return out;
};
