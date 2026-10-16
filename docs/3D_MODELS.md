# 3D models — developer guide

How the Design Room's 3D garments were made, and how to add one for a new product.

**Decision (16 Oct 2026):** 3D models are a **developer job, added in the code**. When the client asks for a product
with a new shape, a developer makes the model, tests it, adds it and releases the site. There is no admin upload for
models (new shapes are rare, and the testing needs the site running anyway). The client does everything else for a
product themselves in Admin → Customizable (details, sizes, colours, the "Make colour photos" tool, print areas, price).

---

## 1. Is a new model needed?

| The new product… | Model |
|---|---|
| has the **same shape** as an existing one (another round neck, another oversized tee, a new fabric/GSM) | **No new model.** `modelForGarment()` picks the existing one from the garment's fit / style / key. Check that the rule below matches the new garment's style name. |
| has a **new shape** (hoodie, full sleeves, polo with buttons, joggers, cap…) | **Yes** — follow this guide. |
| has no model at all | It still works: the Design Room falls back to the flat studio. Fine for a soft launch. |

What to ask the client for: product photos (front, back, side), the size chart (step 2 of the wizard), and where
prints go (the print team's sizes and start lines — see `docs/print-requests/`).

---

## 2. The models we have

All in `frontend/public/models/`. Credits in `frontend/public/models/ATTRIBUTION.txt` and in the site footer
(`components/SiteFooter.jsx`) — **CC BY 4.0 requires the credit to stay on the site.** Working files, licences and
measurements are in `identee-private-assets/3D-models/` (outside git).

| Key in `TEE_MODELS` | File | Source (CC BY 4.0) | Used by | Notes |
|---|---|---|---|---|
| `oversized` | `oversized-tee.glb` (1.7 MB) | “oversized_t-shirt” by ap-school | Oversized Tee | Textured. Measurements: `oversized-tee-panel-measurements.json` |
| `regular` | `regular-tee.glb` (1.0 MB) | “Tshirt” by Tabbuso | Boys / Girls / Kids Round Neck, co-ord tee | Converted from inches to metres, turned to face front, plain material |
| `oversizedCrop` | `oversized-crop.glb` (1.6 MB) | the oversized tee, cut to 2/3 | Oversized Crop | `crop_oversized.mjs`; `hangHalfHeight` so it hangs from the shoulders |
| `collarCrop` | `collar-crop-top.glb` (0.3 MB) | “T-shirt Polo Lengan Pendek” by Ikal.Ichwan | Crop Top with Collar | `build_crop_polo.py`: buttons/strip/pocket removed, slit opened into a V, body cropped, collar shown with baked vertex colours |
| `coord` | the regular tee + `coord-shorts.glb` (0.5 MB) | “Male Tshirt and Shorts” by kanesk06 | Co-ord Set | `build_shorts.py`: only the shorts kept; shown as an outfit (`bottom`, `outfit`) |

---

## 3. Find a model

- **Where:** Sketchfab (filter *Downloadable*), or another source with a clear licence.
- **Licence:** **CC BY 4.0** or **CC0** only. Not *NonCommercial* (NC) — we sell the tees. Not *NoDerivatives* (ND) — we
  always change the model (cut, recolour, simplify). Keep the licence text next to the working files.
- **Good model:** one garment (not a person wearing it), clean even surface (prints are decals on it), roughly
  20k–150k triangles, front/back/sleeves separate enough to aim at. Avoid heavy folds where prints go.
- **Download** glTF/GLB if offered (else FBX/OBJ and convert in Blender).

---

## 4. Prepare the file

Target: **one mesh, metres, facing front, plain material, under ~2 MB.**

1. **Clean up** (Blender, or a script like `build_crop_polo.py`): remove what isn't the garment (mannequin, hanger,
   buttons, labels, stitch-line meshes), join the meshes, fill holes that would show.
2. **Units and direction:** metres, the garment upright, the front facing the camera. The code works in the model's
   "raw" frame (z-up as exported): **raw = (x, −z_glb, y_glb)** — the front faces raw −y, and the **wearer's left is
   raw +x** (on the back too).
3. **Material:** plain (the site tints it to the chosen colour). If a detail must show without a texture (the crop top's
   collar), bake light shading into **vertex colours (`COLOR_0`)** — Room3D multiplies them with the garment colour.
4. **Shape changes** for a variant: cut with a script so it is repeatable (`crop_oversized.mjs` keeps the texture;
   `build_crop_polo.py` / `build_shorts.py` show cutting, V-neck opening, edge smoothing, vertex colours).
5. **Shrink:** `node optimise.mjs in.glb out.glb` (gltf-transform 4.1.1: weld + prune + quantize). Keep it under ~2 MB
   for phones; simplify more if needed.

`identee-private-assets/3D-models/gl.py` is a small glTF reader + software renderer (numpy) — use it to render front /
back / side pictures of a file and to measure points without opening the site.

---

## 5. Measure it

Write the numbers into `identee-private-assets/3D-models/<name>-measurements.json` (keep how you measured them).

| Value | What | How |
|---|---|---|
| `lengthCm` | the model's length, **shoulder top → hem at the centre**, in cm | ≈ the size S/M garment; prints for bigger sizes are drawn smaller by size length ÷ model length (true to size) |
| `anchors.front.neck` / `back.neck` | raw z of the **collar seam** at the centre line | the print team measures start lines from the collar seam (`collarCm` in `printPositions.js`) |
| `anchors.front.top` / `back.top` | raw z where the **main print's top edge** sits | e.g. neck − 0.08 m (front), neck − 0.07 m (back) unless the print team says otherwise |
| `anchors.left` / `right` | `top` (raw z) and `lateral` (raw y of the sleeve's outer centre line) | the sleeve print is centred on the sleeve |
| `hangHalfHeight` | only for a short garment | so it hangs from the shoulders on the stand instead of floating (0.355 for the crops) |

---

## 6. Add it to the code

1. Put the `.glb` in `frontend/public/models/`.
2. Add an entry to `TEE_MODELS` in `frontend/src/studio/teeModel.js`:

```js
hoodie: {
  url: "/models/hoodie.glb",
  credit: { text: "3D hoodie: “…” by …, CC BY 4.0", href: "https://sketchfab.com/3d-models/…" },
  lengthCm: 70,                         // shoulder top → hem
  // hangHalfHeight: 0.355,             // only if it floats above the stand
  anchors: {
    front: { top: 1.50, neck: 1.58 },   // raw metres
    back: { top: 1.54, neck: 1.61 },
    left: { top: 1.48, lateral: 0.04 },
    right: { top: 1.47, lateral: 0.04 },
  },
},
```

   An outfit of two pieces (like the co-ord set) adds `bottom: { url, credit, lengthCm, offset: [x, y, z], anchors }`
   and `outfit: { scale, lift }` — see `TEE_MODELS.coord`.
3. Teach `modelForGarment()` (same file) which garments use it — by style / key / fit, **before** the more general rules.
4. Credits: add the model to `frontend/public/models/ATTRIBUTION.txt` and to the credits line in
   `components/SiteFooter.jsx`.
5. **A new print side** (beyond front / back / left / right / shorts — e.g. a hood): it touches several places, the
   co-ord set's "shorts" side is the example to follow:
   - `server/models/customizationModel.js` — the `side` enum
   - `server/data/printPositions.js` — the areas (`side`, `cm`, `place`), and `DEFAULT_OFFERED`
   - `frontend/src/studio/Room3D.jsx` — `VIEWS`, `VIEW_LOOK`, `RAY`, `FACE`, `FLAT_SIDES`
   - `frontend/src/studio/DesignRoomPage.jsx` — `AREA_GROUPS`
   - `frontend/src/studio/printFiles.js` — `SIDE_ORDER`, `EST_START`
   - `frontend/src/studio/AreaThumb.jsx` — the little garment drawing on the area cards
   - `frontend/src/studio/aiOps.js` — the words that map an area the customer names ("on the hood") to the side

---

## 7. Test before releasing

Run the site locally and, for the garment (made as a **draft** in Admin → Customizable, with photos and print areas):

- [ ] The room opens, the garment stands on the stand (not floating, not sunk), the right way round.
- [ ] Every print area lands where the print team says, at size **S, M and the largest size** (prints get smaller on
      the model for bigger sizes — true to size).
- [ ] Tapping the garment opens the right area; sleeves and any new side show their prints.
- [ ] Text and a picture on each area look flat and sharp (no stretching over folds).
- [ ] **Review**: the turntable, and the four mockup pictures (My designs) show the whole garment, no border, no clipping.
- [ ] Light and dark garment colours both look right (vertex colours, shading).
- [ ] A phone: it loads in a few seconds and turns smoothly.
- [ ] Order it (cash on delivery, test account) and open the print files: positions and sizes are right.
- [ ] The credit shows in the footer.

## 8. Release

New branch → test (above) → merge → deploy. Then the client finishes the product in the wizard and publishes it.
