# Vector print files (12 Nov 2026)

The print team approved the all-vector samples (Centre-Back L and S). This puts the same idea into
**Prepare for print** on the admin site, so every order can get vector print files.

Branch: `feature/vector-print`

## What happens now

1. The admin presses **Prepare for print** (or **Prepare all**) on an order, as before.
2. The server does the approved recipe as before: fetch, clean the cut edge, enlarge on Replicate,
   vector edge, 600 DPI picture.
3. **New:** the server looks at the picture and decides "drawn art" or "photo"
   (`server/services/vectorArt.js` → `artKind`):
   - edge score below 2.2 (sharp lines, flat colours) **and**
   - less than 10 % of the ink is smooth skin tone (a real person's face or arm).
   Both must be true for "drawn art". When unsure it stays a photo — the safe, approved way.
4. **Drawn art** is turned into vector colour shapes (32 colours) **inside the approved vector edge**
   (`vectorizeArt`: vtracer, in tiles, at most 30 MP). Holes and the outline stay exactly as before.
5. A **photo** stays the sharp picture. The admin can still switch it to shapes (made with 96 colours).
6. The .ai file draws the shapes instead of the picture — written straight onto the page (an extra page content
   part between the vector edge and its end), like the approved hand-made files. The day sheets use the shapes too.

7. **Smoother outline (all prepared pictures, not only shapes):** the outline was traced from the customer's
   see-through shape enlarged up to 4×, so every original pixel became a 4-pixel step on the edge (a staircase when
   zoomed in). It is now smoothed by about 0.6 of one original pixel before tracing (0.8 px, as approved, when the
   picture was not enlarged). Thin details stay. Pictures already prepared keep their old edge until prepared again.

8. **Sharper shapes (13 Nov 2026):** drawn art now uses 48 colours (32 flattened two-tone shading) and a light
   edge-cleaning step before tracing (Kuwahara filter, radius 2): the soft in-between colours where a dark line meets
   a fill join one side, so lines are crisp with no light rim beside them. Photos keep 96 colours and no edge-cleaning
   (it makes faces look painted). Tested with the real Real-ESRGAN x4plus enlarger run locally (free): cleaner than
   the laptop's plain-resize stand-in, so real orders look better than REPLICATE_MOCK tests.

9. **Smooth, solid outlines (13 Nov 2026, user: "see in hand … between shoulder and the palm"):** k-means split a dark
   outline into 3–4 near-identical browns, and the patches where they met looked bumpy. Now colours closer than ΔE 4
   (8 for dark colours) are joined (`ART_MERGE`), colour areas are smoothed a little more before tracing
   (`ART_SMOOTH` 2.2 px), and the cut edge is smoothed at 0.85 of one original pixel (was 0.6). (An outer-rim step,
   `ART_RIM`, was tried and removed: the detail check below showed it turned the silver stirrup white.)
   Test files: `identee-release/vector-print-test-12nov/`.

10. **The whole picture as vector, with no detail lost (13 Nov 2026, user: "Not even single bit detail should be
    missed … for all future images", "make the whole image as vector without any details lost and with high
    quality"):**
    - `detailCheck` draws the shapes at the real print size (10 px per mm) and compares them with the print-ready
      picture, both ways: every spot must find a colour within ΔE 20 within 0.2 mm in the other one. A missing spot of
      0.1 mm² or more is a lost detail. (The picture against itself: 0 lost — the check adds no noise.)
    - What loses details: not the colour choice (the 96-colour map of the picture passes with 0 lost) but the clean-up
      (edge-cleaning, joined colours, smoothing) and the tracer, which merges thin areas into their neighbours with any
      settings. Tried and dropped: more colours (200), no smoothing, the tracer's pixel mode, no outline, tracing each
      colour by itself (gaps), stacked layers (wrong colours peep through), re-tracing the spots (patch edges show).
    - What works (`vectorizeChecked`): the clean shapes are made as before; the check finds the missed spots; those
      spots (grown by 0.3 mm) are drawn again as **exact little vector blocks** from a fine 96-colour map of the
      picture, on top (`exactBlocks`); checked again; up to 4 rounds (about 5 s each).
    - Cowboy, 35 cm: 52 spots missed → 2 → 1 → 0. **Every detail kept, 100 % matched, all vector**: 4,468 shapes +
      about 39,000 small blocks, 1.8 MB, 45 s. The blocks cover about 0.5 % of the picture; zoomed in very far they
      look like tiny squares along some outlines — far below what a print shows (one block is about 0.09 mm).
    - If a picture still loses something after the repairs, a gentler try follows (96 colours), and only if that
      fails too does the sharp picture print. The admin can still choose either with **Prints as**.

11. **After the user zoomed into the v6 and v7 files (13 Nov 2026 — flecked, bumpy outlines; stair-step jeans
    highlight; blotches; pixel squares; a hard cream band on the cheek):** how it stands now (v8):
    - **Base shapes: 96 colours** (`ART_COLOURS`), edge-cleaning 2, colours closer than ΔE 4 joined, smoothing 2.8 px.
      With 48 colours thin highlights (the jeans) were lost and soft shading became hard bands — and every repair of
      those showed as a patch. With 96 the base itself keeps them; 128 left faint patches and rougher lines.
    - **The cut-out's fringe:** the outermost pixels of the ink (1.5 of the customer's own pixels, `FRINGE`) take the
      colour area just inside them (`band` in `vectorizeArt`) — the outline is one solid colour to the cut edge. Only
      the area map changes (the removed `ART_RIM` changed the picture itself and whitened the stirrup).
    - **The check does not call blur a detail:** a colour that is a blend of two colours found right there on the
      other side is not a miss (`CHECK_BLEND`), and the fringe band is not checked (`CHECK_RIM`, at least 0.3 mm).
      The colour limit stays ΔE 20. Tried and dropped: ΔE 12 (every shading step and blurred edge became a miss — the
      repairs made a patchwork of blotches and squares) and a local-detail comparison (misfires near the cut edge).
    - **Repairs are smooth shapes** (`smoothPatches`: in each missed spot every colour of a 160-colour map is traced
      by itself with curves; round 1 with shading noise voted away, round 2 as it is). Exact blocks of the picture's
      own colours (`exactBlocks`) remain only as the last resort; the cowboy needs none.
    - Cowboy, 35 cm: 33 small spots missed (biggest 0.5 mm²) → 0 after two smooth rounds. Every detail kept, all
      vector, no squares: about 5,200 shapes + 2,000 small repair shapes, 1.3 MB, about 75 s.
      Test file: `identee-release/vector-print-test-12nov/TEST-cowboy-v8-all-vector-clean.svg`.
    - **v9 — after the user zoomed into v8 (blobs of a neighbouring shade inside a brown area, a dark outline split
      into two or three dark browns):** a colour area under 600 px (`ART_ISLAND`, about 4 mm² at 300 DPI) whose colour
      is within ΔE 10 of the colour it mostly touches (20 for very dark colours) joins it — 2,734 islands on the
      cowboy; and very dark colours are joined three times as far as others (ΔE 12, was 8). A real detail stays: it is
      a clearly different colour (the eye's shine, the silver stirrup) or bigger (the jeans highlight). Still every
      detail kept, no squares; about 2,400 shapes + 2,500 small repair shapes, 77 s.
      Test file: `TEST-cowboy-v9-all-vector-clean.svg`.
    - **v11 — after the user zoomed into v9 (the horse's muzzle: soft pink shading as wobbly nested bands, a lighter
      band hugging every dark line):** the bands are only ΔE 4 from the skin (measured) but 10–15 px wide. After the
      close vote, the colour areas are voted again over 20 px (`ART_CALM`) — but a pixel may only change to a shade
      nearly its own (within ΔE 10, `ART_CALM_DE`). So a thin band of a slightly different shade joins the shade
      around it, the border between two shades of a soft fade becomes one calm curve, a dark line beside it has no
      say, and clearly different colours keep their exact shape (eye shines, cheek rim-light, jeans highlight, rein:
      all still there). Two tries that changed nothing (the user noticed: "no change from v9 to v10"): letting every
      colour vote (next to a line the line won), and 7 px (a 12 px band is still the majority around itself).
      Still every detail kept, no squares; about 100 s. Test file: `TEST-cowboy-v11-all-vector-calm.svg`
      (`…v10…` is the try that changed nothing).
    - **v12 — after the user's screenshot of the horse's mouth ("it should be the same colour … these two should be
      joined"):** two skin shades ΔE 4 apart lay side by side. Colours closer than ΔE 6 now become one (`ART_MERGE`,
      was 4). A sliver between the coat and the skin stayed: it touched the coat more, and the island rule looked only
      at the colour touched most — it now joins the neighbour it is most like (among those it really touches), and
      islands may be up to 1,500 px (`ART_ISLAND`). And a repair now draws only what differs from the shapes already
      there (`PATCH_DE` 8): it used to redraw its whole spot, plain surroundings too, in a very slightly different
      shade. Measured on that spot: one skin colour, no near-twin. Check passes; 2,900 shapes + 1,570 small repair
      shapes; about 90 s. Test file: `TEST-cowboy-v12-all-vector-joined.svg`.
    - **v13 — after the user's screenshot of the hat and bandana (dark dashes along the bandana's edge, a brown blob
      on the hat's outline):** the cut-out's fringe is up to 3 of the customer's own pixels deep (`FRINGE` 3, was
      1.5), and the clean-up of that band is now careful: where the band's main colour there is really the colour
      just inside it (ΔE 6 or less — one thick outline), every band pixel takes the colour just inside; elsewhere only
      a colour that is a small minority there (a stripe) takes the main colour; everything else stays. It works on
      the first colour map, in fine cells, before the smoothing votes. Tried and dropped: big cells (square notches in
      the bandana) and a wider "same colour" limit (a dark-brown hoof counted as its own outline — the outline was
      painted over).
    - **v14 — after the user's screenshot of the saddle horn (its lighter crescent in tan blobs) — the user: "v14 is
      good":** found by switching the clean-up steps off one at a time.
      (1) The edge-cleaning filter (Kuwahara) churns soft shading into patches — it now works only within reach of a
      strong edge (`CRISP_EDGE`: lightness changes by 56 of 255); soft shading stays as the picture has it.
      (2) The calm vote joins only really close shades again (`ART_CALM_DE` 7; at 13 it swallowed the crescent itself).
      (3) Small islands: besides "nearly the same colour" (ΔE 13), a **scrap of soft shading** also joins its
      neighbour — up to ΔE 18, but only if the picture has no crisp edge along the border they share (`SOFT_EDGE`:
      the picture changes across it by less than half of how far apart the two colours are). A real small detail has
      a crisp border and stays. Only 9 such scraps on the whole cowboy.
      Tried and dropped: adding a list colour for every colour far from the list (it gave edge blends their own
      colours: a bumpy shading line and patches inside the boot's outline).
      Checked side by side against v13 on every place the user had shown (horn, boot, muzzle, face, jeans, belt,
      hat, bandana, hoof, hand). Every detail kept, no squares; about 3,200 shapes in 45 colours + 2,300 small repair
      shapes; about 95 s. Test file: `TEST-cowboy-v14-all-vector.svg`.
    - **Still to do before it goes live:** all of this was tuned on ONE picture (the cowboy). Try 2–3 other drawings
      (a logo, a flat cartoon, a detailed illustration) and a photo; run a real order through the live server's
      enlarger; have the print team open a real .ai in Illustrator.
12. **Every picture, not only the cowboy (13 Nov 2026, user: "I am expecting this for all the images. Make it
    possible" — then "test with all possible images and make the code changes according to it").**
    - A test set of 14 different pictures (flat logo, text, flat badge, cartoon, detailed emblems, line art, painted
      art, portrait, real photo, poster, mandala, metallic text), each through the same steps as Prepare (free local
      enlarger) and the detail check: 12 passed, 2 failed — a JCB badge and a line-art lion.
    - **Why they failed** (found by switching the steps off one at a time): badges made for a black tee often have
      their black outlines left out of the ink (the tee is the line), so the ink is full of thin see-through lines. The
      cut-out fringe clean-up (point 11, v13) ran along every one of them, in square cells: square steps,
      leopard-spotted letters, half-filled holes. And the detail check skipped that band everywhere, so most of such a
      badge was never checked.
    - **Fix:** (1) the fringe clean-up and the check's skipped band only along see-through areas at least 2 mm across
      — the cut-out's real background (`wideOutside`, `WIDE_MM`); along a thin see-through line every pixel is now
      checked. (2) The clean-up's "main colour there" is a soft vote per pixel, not square cells. (3) A colour area
      that reaches deeper than the band is real (a letter, a stroke) and is never repainted — only flecks, stripes and
      halos that live inside the band are. (4) A stripe is repainted only if it is the main colour blended with grey
      (white, black or between: the removed background) — a lion's small pink dot kept its red centre.
    - **Repairs on the last try** start from 95% matched (was 99%): there the only other way out is the sharp picture,
      not vector at all. The line-art lion (thin bright streaks under 0.4 mm) now passes this way.
    - **Straight edges:** the tracer now straightens each curve within 1 px (`simplify: 1`). A flat badge's diagonal
      edges had fine saw-teeth at 5× zoom; now straight, nothing lost. 2 or 3 px bent the line.
    - Checked side by side on the cowboy at the user's 8 places: unchanged, still passes (3,053 shapes).
    - Then a test of 81 real designs from the laptop (customer uploads, AI designs, the SCENE and shop designs, two
      real photos), up to 2,048 px — results below when done.
    - Honest limit: zoomed in about 8× some line edges are a little less smooth than the picture's, and soft skin
      shading shows very faint steps. Flat shapes cannot be a soft blur; at print size it does not show.
    - **The 81 designs (old code):** all 81 passed the check, but 65 needed 3 rounds of repairs and 24 the gentler
      second try. Repairs are what look patchy (small blocks) when zoomed in — so the next round went after the causes
      of the repairs.
13. **What the enlarger makes up (13 Nov 2026).** A flat yellow-and-blue badge kept failing along one straight edge.
    The customer's own picture has a clean edge there; the enlarger (Real-ESRGAN) drew a 1 px dark line along it, plus
    a brighter halo and faint shading bands. The shapes painted that line navy (the nearest colour), so it matched
    neither picture, and the repairs drew it back as a broken, blocky line.
    - **The customer's picture goes along** (`src`: the upload after the cut-edge clean-up, on the tee's colour as the
      recipe shows it; kept as `source.png` next to the print-ready picture). (1) A pixel whose colour is nowhere near
      it in the customer's picture (plainly enlarged, ΔE 20, about one customer pixel around) was made up by the
      enlarger: it takes the colour beside it nearest the customer's (`madeUp`). (2) The detail check counts a spot as
      lost only if the shapes miss it in the print-ready picture **and** in the customer's picture — a real detail is
      in both. The customer's picture is first slid (±3 px) to where it fits: the enlarger shifts the picture ~1 px.
    - **The check's blend rule** now also accepts blends along the straight sRGB line: resizing and drawing mix two
      colours that way (yellow + blue = grey-olive), which lies up to ΔE 20 off the Lab line — every soft
      yellow-to-blue edge pixel was a false miss.
    - **Flat art** (16 colours or fewer): colours practically the same (under ΔE 3) are one; then, on the colour map as
      traced, a part thinner than one customer pixel that is nearly the colour beside it, or a blend between the two
      colours either side, joins its side (`ART_FLAT.snap`). The badge: 2,135 shapes after 3 repairs → **160 shapes,
      no repairs, straight edges**, no dark line.
    - **Thin lines keep their width** (drawn art): in the smoothing vote a pixel of a thin part whose colour is unlike
      everything next to it (over ΔE 20) counts its own colour twice.
    - **Dark islands:** very dark colours were joined up to ΔE 26 apart, beyond the check's 20 — the near-black line
      along the top of the cowboy's teeth became the mouth's maroon, was flagged, and repaired with blocks. Now at most
      ΔE 18 where the check can see it (0.1 mm² or more). Cowboy base shapes: 37 missed spots → 20 (biggest 2.08 →
      0.76 mm²); the user's 8 places and the face look as v14, the line above the teeth is back.
    - Tried and dropped: flat art's colours from the customer's picture (its own blended edge pixels became colours:
      1,067 shapes, notched edges).
    - Pictures prepared before this: switching their shapes on still works, with the check as it was (no `source.png`).
    - Then all 95 test pictures again on this code — results below when done.
14. **The last few spots (13 Nov 2026).** After the review fixes, 5 of the 14 test pictures ended a few spots short
    (v18). The repair blocks drew the picture with the enlarger's made-up pixels already recoloured, so a spot the
    check still wanted never changed. Then the second round of blocks took the picture as it is (v19): 25 of the first
    29 passed, but 4 still ended 2–8 spots short (painted-handcuffs, an upload photo, an art upload, a collection
    picture — all passed in v17).
    - **Why:** blocks in the enlarger's own (brighter) colours made those pixels differ from the customer's picture.
      The check had let the pixels next to them pass as "only the enlarger's" — now they had a real difference beside
      them, so they became a lost spot. Each round of blocks fixed one spot and made a new one at its edge.
    - **Fix:** every round of blocks takes the picture as it is, and draws the whole run of differing pixels the lost
      spot sits in (the check's misses before the customer's-picture test, joined over gaps up to 2R + 1 px), not
      only the spot (`joinedRun`).
    - Tried on copies first: the 4 failures and 4 that passed (lion-lines, poster-dark, painted-prisoner, mandala)
      all pass, each in **3 repair rounds instead of 4**. Tests 116/116. Then all 95 again (v20) — results below.
15. **All 95 pictures on the final code (v20, 13 Nov 2026) — every one passes.**
    - **95 of 95 pass the detail check**: 0 lost spots, every picture matches 99.98 % or more. 54 drawn pictures
      became vector shapes by themselves; 41 photos pass too, but stay the sharp picture unless the admin switches.
    - Repair rounds: 6 pictures needed none, 9 one, 9 two, 71 three (the most it does).
    - Time on the laptop (two pictures at a time): about 2½ minutes for half of them; the slowest (25 MP prints)
      about 12 minutes. (Two pictures showed about 3 hours: the laptop was asleep 15:49–18:41 while they ran;
      without the sleep they took about 7–8 minutes.)
    - The test list had two pictures with the same short name, so one was skipped in the batch; it was run on its
      own (`scenedes-profile-leave-you`, passes) and the list now gives it its own name.
    - File size: drawn art up to about 85 MB of shapes (3 big 25 MP posters over 50 MB); big photos switched to
      shapes up to about 145 MB. Results: `tools/vector-calib/suite-v20/` and `suite-all-v20/`.

## What the admin sees (Designs & print files)

- Row status: "✓ Print-ready · vector shapes (64 colours) · sharp at any size".
- Detail check line: "✓ Detail check: every detail kept at the print size", or "Detail check: shapes would lose
  N small details (biggest X mm²), so the sharp picture prints — it keeps every detail".
- **Prints as: [Vector shapes] [Sharp picture]** — switch any picture. Switching back and forth is instant;
  making shapes for the first time takes about 20–60 seconds (free, no AI cost).
- "looks like drawn art / a photo" note under the switch.
- **Compare with the original** shows the shapes when they are used ("Vector shapes (printed)").
- The order sheet says which pictures are vector shapes.

## Files changed

| File | What |
|---|---|
| `server/services/vectorArt.js` (new) | drawn-art/photo check, edge-cleaning, picture → vector shapes |
| `server/services/printRecipe.js` | returns the ink mask for the shapes; `edgeSigma` (smoother outline) |
| `server/controllers/printFileController.js` | makes the shapes in Prepare; the switch (`POST /picture/vector`); serves shapes, preview, day-sheet `?v=1` |
| `server/routes/printFileRoutes.js` | the 3 new routes |
| `server/models/customizationModel.js` | `printFile.vector` {kind, score, skin, made, use, colours, shapes, check} |
| `frontend/src/services/printFileService.js` | `vector`, `vectorPreviewBlobUrl`, `setVector`, sheet `v` |
| `frontend/src/studio/printFiles.js` | picks shapes or picture per picture; order-sheet line |
| `frontend/src/studio/vectorPrint.js` | draws the shapes in the .ai |
| `frontend/src/pages/admin/OrderDesignsModal.jsx` | the switch, status, compare labels |

No new npm packages (`@visioncortex/vtracer` was already in the server). No new .env settings.

## Tested on the laptop (test database only)

- Cowboy cartoon → drawn art → 2,366 shapes in 38 colours (real enlarger, all clean-up steps); .ai opens in pdfium and Inkscape; edges crisp at 4× zoom.
- Saree photo → photo (skin 13.7 %) → sharp picture; switched to shapes → 52,716 shapes, 96 colours.
- Switch on/off instant; old shape files removed when a picture is prepared again.
- Day sheet with shapes renders; phone (375 px) and desktop layout checked.
- Detail check + repair: cowboy → every detail kept after the repair rounds → vector shapes by itself, through the
  website's switch on the test order; the PDF content with the blocks opens in Inkscape. A failed check shows why and
  the sharp picture prints; choosing shapes then asks first. Shapes made before the check are made again when switched on.

## Known limits

- Vector shapes flatten soft shading into steps; the spots where that would lose a detail are redrawn as small blocks.
- The check and repairs add about 20–40 s for a small picture; a big 25 MP print takes up to about 12 minutes in all
  on the laptop (v20).
- Big photos switched to shapes make big files (up to about 145 MB); drawn art stays under about 85 MB.
- Not yet tried on a real order with the real enlarger on the server (the test used the same enlarger run on the laptop).
- Big pictures: shapes are traced at up to 30 MP; a 90 MP picture worked in the test.
- Inkscape is slow to open files with many shapes; Illustrator is what the print team uses.
- Not yet: the "Prepare again" button and the Send-again warning (waiting for print-team feedback).
