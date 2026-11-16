# Topaz enlarger + customer designs at 4K (server side, 15 Nov 2026)

Why: the blurry prints came from ~1,000 px AI pictures enlarged 4x by Real-ESRGAN, which smooths. Topaz adds real
detail and keeps faces (creativity 0). An AI picture made at 4K and then enlarged by Topaz is the sharpest.
Branch `feature/topaz-4k`. The frontend half (settings page, order window lines, previews, phone upload limits) is
described by the frontend helper.

## What changed (server)

| File | Change |
|---|---|
| `server/services/replicateService.js` | Topaz (`topazlabs/image-upscale`): `enlargeWithTopaz`, `topazInput` (model choice), `topazFactor` (2x/4x/6x), `topazUnits` (billing). The picture goes to Replicate's file store (`POST /v1/files`), the run uses `Prefer: wait=60`, then polls; 5-minute limit; the file is deleted afterwards. **No shrink** for Topaz (the 1,448 px Real-ESRGAN limit is not applied). Real-ESRGAN code unchanged. |
| `server/controllers/printFileController.js` | Prepare for print uses Topaz first (`enlargeForPrint`), Real-ESRGAN when the admin chose it or when Topaz fails in any way. Photo or art is decided by `pictureKind` (main had no such decision). With Topaz a picture may be enlarged up to 6x (was 4x). The printFile on the design element and `meta.json` get `enlarger`. Cost: `printCost`. Status route says which enlarger is chosen. |
| `server/models/customizationModel.js` | `printFile.enlarger`: `"topaz"` / `"real-esrgan"` / `"real-esrgan-backup"` (not set when the picture was not enlarged). |
| `server/controllers/aiController.js` | 3 new settings; `DESIGN_SIZE = "4K"` for customers' designs (new design, change, photo to art, copy, inspired, fix); the 4K price; a design being changed is sent to the AI at most 2,048 px. |
| `server/controllers/assistantController.js` | The Assistant's concept pieces (`/api/ai/develop`) and matching pieces (`/api/ai/match`) at 4K and the 4K price; the spelling check reads a 1,536 px copy. |
| `server/services/aiImageService.js` | A 4K picture gets 180 s before it is given up (others still 90 s). |
| `server/multer/multer.js` | Customer picture uploads (`/api/customizations/upload-design`) have their own 25 MB limit (they shared the 100 MB video limit). |
| `server/tests/topaz4k.test.mjs` | 13 tests (all with stand-ins: no real calls, no database). |

Not changed on purpose: concept sheets (2K), the one-line banner lettering (1K, see below), Photo of it worn / Try it on
me, the admin Studio, the Collection maker, the print redraw (already 4K), Grok (its own sizes).

## Topaz settings used

- A photo: `Low Resolution V2` when it is under about 2 MP, else `Standard V2`; `face_enhancement` on, strength 0.8,
  creativity 0.
- Drawn / painted / AI art: `CGI`, no face enhancement.
- Factor: asked <= 2.5x -> `2x`; <= 4x -> `4x`; more -> `6x`. The result is then resized (lanczos) to the exact size.
- `output_format: "png"`. The see-through shape is resized separately, as before.

Photo or art (`pictureKind`): a design-maker picture (`/ai-designs/`) or an art-library picture is art, unless it has no
see-through at all and its pixels look like a photo (Photo Studio's enhanced photo). Any other picture (customer
uploads) is judged by its pixels: thousands of colours and few flat areas = photo; otherwise art. If the check itself
fails, art is used.

## Settings (Admin -> Settings -> AI designs; defaults work without saving)

| Key | Returned as | Default | Allowed |
|---|---|---|---|
| `ai.printEnlarger` | `printEnlarger` | `"topaz"` | `"topaz"` or `"real-esrgan"` (anything else: 400) |
| `ai.topazPricePerUnitInr` | `topazPricePerUnitInr` | 4.5 | 0-100 |
| `ai.price4kPerImageInr` | `price4kPerImageInr` | 8.7 | 0-100 |

`PUT /api/ai/admin` also accepts `replicatePricePerImageInr` now (it had a limit but could not be saved).
`GET /api/print-files/status` -> `enlarger.choice` and `enlarger.topazPricePerUnitInr` added.

## Costs (for the spending figures)

- Topaz: Replicate's own unit count (`metrics.unspecified_billing_metric`) x `topazPricePerUnitInr`. 1 unit = $0.05,
  by the size of the result: up to 24 MP 1 unit, 48 MP 2, 60 MP 3, 96 MP 4, 132 MP 5, 168 MP 6.
  Examples at 30 cm print width (600 DPI aim): a new 4K design (3584 x 4800) -> 2x -> 69 MP -> 4 units, about ₹18; an
  older 1K picture (1024 x 1365) -> 6x -> 50 MP -> 3 units, about ₹13.5. A picture big enough already: no run, ₹0.
- Logged like Real-ESRGAN: `AiUsage` kind `print`, model `topaz-image-upscale`, prompt
  `Print-ready picture (design …, picture N) · 2× · Topaz`. A backup run says `· Replicate (Topaz failed)` and costs
  `replicatePricePerImageInr`. These rows count in the admin's sums exactly as Real-ESRGAN's did (with Google's, as
  before: only `grok…` models are counted apart).
- 4K customer pictures: `price4kPerImageInr` each (Grok's stand-in keeps `grokPricePerImageInr`; the banner lettering
  keeps `pricePerImageInr`).

## Fallback

Topaz refused (no credit, bad input), failed, gave no picture, or took over 5 minutes (the run is cancelled) ->
Real-ESRGAN runs automatically in the same job, and the picture is marked `enlarger: "real-esrgan-backup"`. If
Real-ESRGAN fails too, the job fails as before.

## Previews and uploads

- PREVIEW: generated pictures stay full size at `/uploads/ai-designs/<file>.png`. `GET …?w=<px>` already returns a WebP
  copy that wide (snapped to 240/400/600/800/1200/1600/2000, cached under `uploads/.sizes/`). The frontend's
  `imageUrl(url, width)` adds it. No new route.
- UPLOAD: 25 MB per customer picture on the server. Uploads are only opened for their header, later steps use sharp's
  default 268 MP limit or none, so 8,000 x 8,000 photos are fine.
- Cut-out of a 4K picture (3584 x 4800) measured on the laptop: about 5 s and about 260 MB extra memory per picture.

## Unsure / left out

- Banner lettering (the one-line words for the tall thin areas) stays 1K because the brief said "not banners". It is
  one line in `makeAiDesign` (`generateImage({ prompt, ratio: "21:9" })`) if it should be 4K too.
- `pictureKind` is a simple rule of thumb; a painted customer upload may be called a photo (then Topaz uses
  Standard V2 with faces, which is still fine).
- The cost of 6x on old 1K pictures (above): change `useTopaz ? 6 : 4` in `startPrintPicture` to cap it at 4x.

## RELEASE NOTES (live server)

1. Upload these backend files (panel File Manager), keeping folders:
   `server/services/replicateService.js`, `server/services/aiImageService.js`, `server/controllers/printFileController.js`,
   `server/controllers/aiController.js`, `server/controllers/assistantController.js`, `server/models/customizationModel.js`,
   `server/multer/multer.js` (the test file is not needed live). No new npm packages (Node 22's own `FormData`/`Blob`).
2. `.env`: nothing new. `REPLICATE_API_TOKEN` is already live and covers Topaz. Keep a few dollars of Replicate credit:
   a Topaz picture is about $0.05-$0.20.
3. Proxy / Nginx in front of the backend:
   - `client_max_body_size 25m;` (or more) so 25 MB customer photos are not refused with 413.
   - read timeout of at least 180 s (`proxy_read_timeout 240s;` as in docs/DEPLOYMENT.md): a 4K design takes about
     40-60 s, more when Google refuses and Grok takes over. Prepare for print is a background job, not affected.
4. Restart the backend (panel Restart).
5. Check: Admin -> Settings -> AI designs shows Topaz as the enlarger. Prepare one picture of a test order: its steps
   say "with Topaz", the admin AI page shows a `· Topaz` line with a cost, and the order window shows "enlarged with
   Topaz". Make one Design Room picture: it comes back about 3,600 px wide (the page shows a smaller copy).

## 4K copy by AI before Topaz (16 Nov 2026)

The user's rule: when the admin presses **Prepare for print** (or Prepare all) and the picture is **not 4K** (its
longest side under 3,840 px), the AI first makes a 4K copy of it, then Topaz enlarges that copy (only as far as the
print size needs: 600 DPI aim; a small chest print may need no Topaz at all). Reason: the user's logo tests on
16 Nov (117 px and 360 px WhatsApp logos): a 4K copy + Topaz printed cleanest.

| File | Change |
|---|---|
| `server/controllers/aiController.js` | The admin's "4K copy" code is now `makeAiPrintCopy()` (used by the old button and by Prepare). Cost = the 4K price setting. A customer's see-through picture is copied on the magenta key and cut out again at 4K (clean edge, its own whites kept) unless it has magenta of its own (`hasKeyColour`). The AI is shown the picture up to 4,096 px (was 1,536: "dont shrink"). Prepare never uses Grok. `dropPrintPicture` sets `aiCopyOff`. New setting `print.aiCopy` (`printAiCopy`, default on). |
| `server/controllers/printFileController.js` | `aiCopyPlan()` + `FOUR_K` (3840). The job makes the copy first, then enlarges `printSrc`. If the AI refuses or its budget is used up, the uploaded picture is enlarged as before. printFile/meta get `aiCopy: true`. Status: `aiCopy { on, fourK, priceInr }`. Photo or art for Topaz's model is asked of the text AI (`askPictureKind`, a fraction of a paisa; the pixel rule called the G logo a photo and a real photo art), pixel rule as fallback. |
| `server/services/aiImageService.js` | `printPrompt`: no redraw, no invented bevels/3D edges/highlights/map details, "a higher-resolution scan of the very same artwork". |
| `server/models/customizationModel.js` | `aiCopyOff` on the picture; `printFile.aiCopy`. |
| `frontend/.../OrderDesignsModal.jsx` | Prepare button shows "+ 4K copy ₹8.7"; confirm says "It is not 4K (N px)…"; row says "4K copy by AI, enlarged with Topaz"; "Use the uploaded picture, not the AI copy" (drops both; next Prepare = Topaz alone). |
| `frontend/.../AiSettingsPage.jsx` | Switch "Copy pictures that are not 4K with AI first". |
| `frontend/src/studio/enlargerNote.js` | `adminEnlarger(enlarger, aiCopy)`. |
| tests | `server/tests/aiCopy.test.mjs` (6), one frontend test. |

Costs: a picture under 4K = ₹8.7 (AI copy) + Topaz units if still needed. Faces: the AI is told to keep them
exactly, but the admin should press "Compare with the original" on photos.

**No shrinking (16 Nov 2026):** the admin's 4K-copy button refuses a picture already 4K or bigger (the copy would be smaller), and the link is hidden for it. When Topaz fails on a picture over the backup's ~2 MP limit (about 1,448 x 1,448), Real-ESRGAN is NOT used (it would shrink it first): the job stops with "press Prepare for print again". Small pictures still get the backup. (Choosing Real-ESRGAN in Settings still shrinks big pictures: that is the admin's own choice.)

## Grok when Google refuses (16 Nov 2026)

The owner's rule: Prepare for print asks Google for the 4K copy; when Google refuses (famous people, film characters), Grok makes the copy (about 2K, ~₹6, it redraws more: compare it with the original), then Topaz enlarges it. A copy made on the magenta key then has every magenta pixel cleared wherever it is (`clearKeyColour` in services/cutoutService.js): a picture that runs off its own edge has no plain edge for the usual cut-out, and the original's outline laid over a shifted copy left hot-pink gaps (VF-2026-0079 poster). Pale pink (a white edge blended with the key) is kept as a soft edge, so white letters get no dark ring.

## Grok's copy put back in the picture's shape (16 Nov 2026)

Grok picks its own picture shape and may zoom, so its copy used to be stretched into the customer's box: the VF-2026-0079 front printed 31.9 cm wide where the customer placed 28.3 cm, and the VF-2026-0080 back was 9% too tall for its width. Now `fitCopyToSheet` (services/alignCopy.js, called in makeAiPrintCopy) finds the sheet that was sent inside Grok's copy (same proportions, any size and position, by comparing light and dark patterns) and cuts the copy to that frame. Any strip Grok left out is filled from the sheet itself (the customer's picture, enlarged plainly, so a little softer there). Nothing is shrunk. A copy already of the sheet's shape (Google, under 1% off) is left exactly as it is; a poor match (likeness under 0.5) is also left as it was. Tests: server/tests/alignCopy.test.mjs.

Checked on the two real orders (laptop, re-fitted from the existing Topaz files, no new cost): front now 28.2 cm wide (customer 28.3), back within 0.3%. The sharper print edge also needs `scale: keep` passed to runRecipe (printFileController.js), so the edge rule works on the enlarged size.

**The Studio too (16 Nov 2026):** the Studio's "sharpen for print" (shop tees, `enlargeStudioPicture` in services/studioService.js) asked Grok the same way, so it now calls `fitCopyToSheet` as well. A read-only check of the live Studio tees found 111 pictures with a print copy: 105 within 1% of the original's shape (Google), 2 pictures off: "SCENE · The One Stands Alone" (1.6%, 3 tees) and "SCENE · The Real Scene Begins Now" (4.1%, 3 tees). Their print copies were made before this fix; they need making again after the release.
