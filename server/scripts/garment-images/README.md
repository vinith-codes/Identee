# Garment images for the customizer

Builds the Oversized Tee images the customizer uses: **12 colours × 4 views**
(front, back, left side, right side), 800 × 1000 px, drawn to the IDENTEE size
chart (size M: chest 23" flat, length 30"), so print areas can be shown at their
true size for every garment size.

## Inputs
- A **white** oversized tee photo with a **transparent background**, front on the
  left half and back on the right half (not stored in git — licence unconfirmed).
- `side_white.svg` — the side-profile drawing (render to `side_white.png`, 800 × 1000,
  transparent). Sleeve length 9" and opening 8.5" are **estimates** until the client
  confirms them.

## Run
```bash
python build_oversized.py <white_photo.webp> <side_white.png> <outdir> <python-lib-dir>
```
Needs Pillow + NumPy. Output: `<colour>-<view>.jpg` and `calibration.json`
(pixels per inch at size M and the shirt outline per view).

## How it works
- The photo is widened so chest ÷ length = 23 ÷ 30 (IDENTEE's real proportions),
  then scaled so collar→hem = 640 px (21.33 px per inch at size M).
- Each colour keeps the photo's light and shadow; only the fabric colour changes
  (the hanger stays natural).
- To add a colour, add it to `COLOURS` and run again. To use real photos later,
  pass them instead — nothing else changes.

`oversized_calibration.json` is the calibration of the current image set.
