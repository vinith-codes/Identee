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

## Regular-fit round-neck tee (`build_regular.py`)
Same method, IDENTEE **Regular fit** chart (size M: chest 40" round = 20" flat, length 28"). Measures the shirt from its
shoulders (not the hanger) and puts the shoulder at 27.3% and the hem at 87.4% of the canvas, like the oversized photos,
so the photo ruler is 27.3 / 87.4. Input: `identee-private-assets/source/white_regular_front_back.png` (the user's white
front/back photo, background removed). Output (48 images) in `identee-private-assets/regular-images/`; uploaded to
Cloudinary `identee/garments/boys-round-neck/`. The side views reuse the oversized side drawing (estimate).

Kids round neck: same script on the kids flat-lay photo (no hanger). The photo is small, so first
`clean_small_photo.py` (trim the grey rim, soften speckle, upscale), then
`build_regular.py <clean.png> <side_white.png> <outdir> <pylib> --no-hanger`. Kids proportions (chest ≈ 0.71 × length)
match the regular M, so the same canvas and photo ruler (27.3 / 87.4) work. Uploaded to `identee/garments/kids-round-neck/`.

## The crops (`build_regular.py --fit=…`)
A crop is wide and short, so it is drawn smaller: `--fit=CHEST_FLAT_IN,LENGTH_IN,LEN_PX,TOP_Y,CHEST_ROW` (size M) puts the
shoulder top at TOP_Y and the hem at TOP_Y+LEN_PX (photo ruler 30 / 70 for both crops) and measures the body width at
CHEST_ROW of the length — below the sleeves, which reach further down a short body. Inputs are prepared by
`identee-private-assets/source/crops_prep.py`:
- **Crop Top with Collar** (`--no-hanger --fit=17,20,400,300,0.8`): front = the client's product photo (cut out, texture
  softened, turned grey-white); back = the same outline with the V and collar points smoothed away
  (`crop_collar_back_from_front.py`); sides = renders of the 3D model. Output in `identee-private-assets/crop-collar-images/`.
- **Oversized Crop** (`--fit=23,20,400,300,0.9`): the oversized tee's white front/back photo cut to 2/3 of its length;
  sides = renders of the cropped 3D model. Output in `identee-private-assets/oversized-crop-images/`.
