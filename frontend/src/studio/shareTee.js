// studio/shareTee.js — "Share my tee" (Assistant v2 round 3, 7 Nov 2026): one picture of the finished tee, front and
// back side by side with a small IDENTEE line, sent with the phone's share sheet (WhatsApp …) or saved as a file.
const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("picture"));
    img.src = src;
  });

/**
 * The share card: the front and back pictures (data URLs from the Review step) on a light background.
 * @returns {Promise<Blob>} a PNG
 */
export async function makeShareCard({ front, back, title = "My IDENTEE tee", footer = "identee.co.in" }) {
  const pics = (await Promise.all([front, back].filter(Boolean).map((s) => load(s).catch(() => null)))).filter(Boolean);
  if (!pics.length) throw new Error("No picture of the tee yet.");
  const H = 900;
  const gap = 32;
  const widths = pics.map((p) => Math.round((p.width / p.height) * (H - 180)));
  const W = widths.reduce((a, b) => a + b, 0) + gap * (pics.length + 1);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#F6F3EC";
  g.fillRect(0, 0, W, H);
  let x = gap;
  pics.forEach((p, i) => {
    g.drawImage(p, x, 60, widths[i], H - 180);
    x += widths[i] + gap;
  });
  g.fillStyle = "#141110";
  g.font = "bold 34px Arial, sans-serif";
  g.textAlign = "center";
  g.fillText(title, W / 2, H - 78);
  g.font = "22px Arial, sans-serif";
  g.fillStyle = "#8A6F2E";
  g.fillText(`Designed with the IDENTEE Assistant · ${footer}`, W / 2, H - 40);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn’t be made."))), "image/png"));
}

/** Shares the card with the phone's share sheet when the browser has one, else saves it as a file. Returns "shared" | "saved". */
export async function shareTee(blob, { text = "My tee design on IDENTEE", fileName = "my-identee-tee.png" } = {}) {
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: text, text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "saved";
}
