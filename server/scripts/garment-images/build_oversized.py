# Builds the Oversized Tee customizer images (12 colours x front/back/left/right)
# to the IDENTEE size chart (size M: chest 23" flat, length 30").
#   python build_oversized.py <white_photo.webp> <side_white.png> <outdir> <pylib>
# Writes <colour>-<view>.jpg (800x1000) and calibration.json (pixels per inch
# and the shirt outline per view, used to size print areas per garment size).
import sys, json
sys.path.insert(0, sys.argv[4])
import numpy as np
from PIL import Image

PHOTO, SIDE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CW, CH = 800, 1000
BG = (241, 240, 236, 255)
M_CHEST_IN, M_LENGTH_IN = 23, 30          # IDENTEE Oversized, size M (from the PDF)
TARGET_LEN_PX = 640                        # collar -> hem on the canvas
SHIRT_TOP_Y = 236                          # where the shirt top sits on the canvas
PPI = TARGET_LEN_PX / M_LENGTH_IN          # pixels per inch for size M

COLOURS = {
    "maroon": "#6E1C22", "lavender": "#B7A2E0", "black": "#1C1C1D", "white": "#F4F3EF",
    "red": "#C2352C", "beige": "#D4C49B", "royal-blue": "#2441B5", "cool-blue": "#8DC1EC",
    "coffee-brown": "#573216", "navy": "#202759", "cream": "#E7E3CF", "bottle-green": "#1C5A2B",
}

def analyse(rgba, has_hanger=True):
    a = np.asarray(rgba).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    garment = (alpha > 0.02) & (sat < 0.12)
    rows = np.where(garment.sum(1) > garment.shape[1] * 0.12)[0]
    if has_hanger and len(rows):
        garment[: rows[0]] = False            # hook above the shirt stays natural
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    shade = np.clip(lum / np.percentile(lum[garment], 97), 0, 1.15)
    return rgb, alpha, garment, shade

def recolour(parts, hexc):
    rgb, alpha, garment, shade = parts
    c = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    base_l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    k = 0.85 if base_l < 0.3 else 1.0
    col = c[None, None, :] * (shade[..., None] ** k)
    col = col + np.clip(shade - 0.92, 0, 1)[..., None] * (0.25 if base_l < 0.3 else 0.0)
    out = rgb.copy()
    out[garment] = np.clip(col[garment], 0, 1)
    return Image.fromarray((np.dstack([out, alpha]) * 255).astype(np.uint8), "RGBA")

def place_photo_half(half):
    """Widen to IDENTEE proportions, scale to TARGET_LEN_PX, centre on the body."""
    a = np.asarray(half)[..., 3] > 10
    rows = np.where(a.sum(1) > 120)[0]
    top, hem = rows[0], rows[-1]
    ychest = top + int((hem - top) * 0.55)                 # below the sleeves
    r = np.where(a[ychest])[0]
    chest_px, body_cx = r.max() - r.min(), (r.max() + r.min()) / 2
    sx = (M_CHEST_IN / M_LENGTH_IN) / (chest_px / (hem - top))
    s = TARGET_LEN_PX / (hem - top)
    img = half.resize((round(half.width * sx * s), round(half.height * s)), Image.LANCZOS)
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ox = round(CW / 2 - body_cx * sx * s)
    oy = round(SHIRT_TOP_Y - top * s)
    canvas.paste(img, (ox, oy), img)
    return canvas, {"top": SHIRT_TOP_Y, "hem": SHIRT_TOP_Y + TARGET_LEN_PX,
                    "centerX": CW / 2, "chestPx": round(chest_px * sx * s, 1)}

photo = Image.open(PHOTO).convert("RGBA")
W, H = photo.size
views = {}
calib = {"ppiAtSizeM": round(PPI, 3), "sizeM": {"chestIn": M_CHEST_IN, "lengthIn": M_LENGTH_IN},
         "canvas": [CW, CH], "views": {}}
for view, box in (("front", (0, 0, W // 2, H)), ("back", (W // 2, 0, W, H))):
    canvas, info = place_photo_half(photo.crop(box))
    views[view] = analyse(canvas)
    calib["views"][view] = info
side = Image.open(SIDE).convert("RGBA")
views["right"] = analyse(side, has_hanger=False)
views["left"] = analyse(side.transpose(Image.FLIP_LEFT_RIGHT), has_hanger=False)
calib["views"]["right"] = calib["views"]["left"] = {
    "top": SHIRT_TOP_Y, "hem": SHIRT_TOP_Y + TARGET_LEN_PX, "centerX": CW / 2,
    "estimates": {"sleeveLengthIn": 9, "sleeveOpeningIn": 8.5, "bodyDepthIn": 10}}

for name, hexc in COLOURS.items():
    for view, parts in views.items():
        img = recolour(parts, hexc)
        bg = Image.new("RGBA", (CW, CH), BG)
        bg.alpha_composite(img)
        bg.convert("RGB").save(f"{OUT}/{name}-{view}.jpg", quality=90)
json.dump(calib, open(f"{OUT}/calibration.json", "w"), indent=2)
print("built", len(COLOURS) * len(views), "images; ppi", round(PPI, 2), "; front chest px", calib["views"]["front"]["chestPx"], "=", round(calib["views"]["front"]["chestPx"] / PPI, 2), "in")
