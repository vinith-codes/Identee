# IDENTEE — Handoff for the next chat

_Last updated: 9 Oct 2026 (end of chat 3). Read this first, then `docs/PHASE1_PROGRESS.md` (full before/after history, §1–6j),
`docs/CUSTOMIZER_PLAN.md` (design-studio plan + decisions) and `docs/PRODUCT_SPEC.md` (products, sizes, print positions)._

## ⏭ Where we stopped (start here)

**Branch `feature-design-room` — MERGED to `main` on 9 Oct 2026** (fast-forward, pushed). It holds:
1. **3D Design Room** (`/customize/:garment`) — studio Part 1. PHASE1_PROGRESS §6i.
2. **My designs + the designed tee in orders** — PHASE1_PROGRESS §6j.
3. Customizable page shows the **white** tee, no colour dots, no "How it works" (colour is picked in the room's first step).
4. **"Start designing" = a fresh design** (`?new=1`, removed from the URL at once); an unfinished browser design is kept and
   offered in the first step ("Continue it") and only replaced once the new design has content.
5. Later fixes (all tested): editor keeps the print area to ~⅓ of the screen height so the controls fit (sleeves); small areas
   render ≥ 480 px; **smooth dragging** (editor not rebuilt mid-drag, 3D updated once per frame, one canvas per area);
   **Review** = 3D tee turning 360° on the left (⟳ 360° / ❚❚ Pause, tap a side to view it) + the 4 sides and summary on the right
   (phone: tee on top, sides below); the Save name box opens above the side panels; saving no longer jumps Review back to Design.
   Verified in the real DB: mockups → Cloudinary `identee/mockups`, uploads → `identee/designs`, art → `identee/art-designs`.

Merge = `git switch main && git pull --ff-only origin main && git merge --ff-only feature-design-room && git push origin main`.

**Branch `feature-sizes-cart` — MERGED to `main` on 9 Oct 2026** (PHASE1_PROGRESS §6k): Review has a sizes × quantity table
(Add to cart / Buy now for any mix of sizes); cart holds custom designs (grouped one card per design, "+ Add another design");
Design Room "Added to your cart" card (Design another tee / Go to cart / Keep editing); My designs "Add to cart" with a size picker
(also re-orders); one checkout for many designs, each design locked when ordered.

**Branch `feature-print-files` — MERGED to `main` on 9 Oct 2026** (PHASE1_PROGRESS §6l): Admin → Orders → **Designs & print files**
(previews, colour, sizes × qty, print areas in cm) → **Download print files (ZIP)**: transparent 300-DPI PNG per print area per
ordered size group + previews + ORDER-SHEET.txt, made in the admin's browser with the Design Room's Konva code. Tested on the
real order VF-2026-0023 by the user.

**Branches `feature-readymade-redesign` + `feature-home-redesign` — MERGED to `main` on 9 Oct 2026** (PHASE1_PROGRESS §6m–6o):
- Admin → Ready-made: 5-step product wizard (add + edit), All products list (search, filters, restock, hide/show, delete only
  if never ordered); sellers can only change their own products; hidden products leave the shop, cart and checkout.
- Customer: /ready-made = category tiles; category pages have a filterable grid (`GET /api/shop/products`); product page
  rebuilt (real sizes from stock, gallery, add to cart / buy now, details, related).
- Home page redesigned (classy editorial, real tee photos, slow hero animation); fonts Bricolage Grotesque + Inter now loaded.
- Data to fix in the admin: 12 of 13 ready-made products have broken old-project photo paths; style "Blacers" is in no category.

**Data audit + `fix-art-security` — MERGED 9 Oct 2026:** read-only check of the DB + Cloudinary: everything saved since
the move to Cloudinary is complete (0 links to missing Cloudinary files; designs, mockups and Oversized photos complete).
Files from before the move were lost (old products, old orders' thumbnails, old category banners, profile pictures).
Cleaned (backup in `identee-private-assets/backup-2026-10-09-audit-cleanup/`, script in `identee-private-assets/scripts/`):
8 photo records of deleted garments and a broken video banner deleted; broken art hidden, then deleted by the user in admin.
Security fix: adding/deleting art designs and art categories (and the admin art list) now needs an admin/seller login.
Admin art page labels hidden art and shows "Picture missing" instead of broken images.
Left for the user: re-add photos to 12 ready-made products; delete Cloudinary "samples" demo folder.

**`fix-footer` — MERGED 9 Oct 2026:** one footer on every customer page (`components/SiteFooter.jsx`, in CustomerLayout):
real links only (shop, live categories, account pages, about/contact), contact + address + map + social links from
Admin → Settings (left out when empty; the social boxes currently hold "identee.co.in", not profile links).

**Branches `feature-print-areas-sizes` + `feature-design-room-layout` — MERGED to `main` on 10 Oct 2026** (PHASE1_PROGRESS §6p–6q):
- Print team's sheet: 6 more print areas (Full Front, Vertical Front, Front Right Vertical, Top Back, Centre Back, Vertical Back)
  with exact sizes per garment size; older 6 areas kept; **one print per overlapping spot**; XS is not sold.
- Design Room **studio layout**: tools column on the left (Areas, Text, Upload, Art, Ideas, AI soon) with a side panel; print
  areas are small tee cards grouped Front / Back / Sleeves; colour + size in a top-bar menu; Review button in the top bar;
  the 3D tee has the middle to itself; the editor is a column on the right. Phones: tools along the bottom, panels as sheets.
- Text panel: heading, small line, curved, **vertical text**; images have **Fill area**.
- Speed: a drag is painted straight onto the area's texture (`roomApi.touch`), no page redraw per frame; while an area is open
  the 3D canvas renders on demand. Sleeve prints lie flat on the 3D tee (preview only; print files come from the flat editor).
- Ask the print team: does 13 × 14 cm really fit a 2XL sleeve? (it reaches the hem on the 3D model).
- AI plan written (`docs/AI_PLAN.md`), build not started: Phase 1 = Ideas panel + background remover (free parts first).

**Branch `feature-design-room-two-step` — MERGED to `main` on 10 Oct 2026:**
- Design Room is now **two steps**: left = *Step 1 Where to print* (tee cards only), right = *Step 2 What to add* with tabs
  Text / Upload / Art / Assistant; a selected item shows *Edit text / Edit picture* with "+ Add more". Classy look from the
  approved prototype (ivory/white, gold accent, pills). The Ideas tab was removed.
- Text: several lines, align, CAPS toggle, letter + line spacing, outline, four shape buttons (straight, curved up/down,
  vertical); new fields `letterSpacingPct`, `lineHeight`, `strokeWidthPct`, `strokeColor` saved by the server. Smaller print-area box.
- **Background remover** (free, in the browser): `studio/removeBackground.js` — flat colours cleared directly, photos via ORMBG
  through `@huggingface/transformers`. Go-live notes in section 7.
- **Design assistant** (free, scripted): slogans (12 occasions x 4 tones), six layout templates, design check with one-tap fixes
  (also runs once before Review), colour / where-to-print / size help. See `docs/AI_PLAN.md` (stages A-D, prices, decisions).
- Decided: image generation = Gemini "Nano Banana" standard, **built when the client supplies the key** (plus daily limit and
  monthly cap). Suggested designs must all stay usable (replace, or place on another area).
- Prototypes: design room https://claude.ai/artifact/8MnzSPYMxprafYopkcvHba , assistant walkthrough https://claude.ai/artifact/5NuXtHtrY1gpxdbyLgLaCL
- Not yet tested by anyone: phone layout after the restyle, saving/ordering a design that uses the new text settings, the
  blurry / over-the-edge checks, five of the six templates.

**Branch `feature-review-animation` — MERGED to `main` on 10 Oct 2026:**
- Review step happens in a **dressing room** (`Boutique` in `studio/Room3D.jsx`): slatted wall, lit arch, IDENTEE sign, a rack
  of tees each side, shelves, lamps, mirrored floor (drei `MeshReflectorMaterial`), plinth with a ring of light. The design
  step keeps the bright `Studio`; both sets stay mounted and only one is visible (`room` prop).
- In Review the **tee turns, not the camera** (`turntable`, `spin`, `face`); the camera sits at `SHOWROOM` and leans with the pointer.
- **Unfold reveal**: the tee lies folded on the plinth, lifts, opens (bottom, then both sides), then the prints fade in.
  The fold is drawn in the vertex shader (`FOLD`, `foldable`) and shared by tee, shadow and decals. Timings in `UNFOLD`.
- Order pictures (`snapshot`) are always taken in the studio with the tee open and facing forward; the real view is redrawn
  straight after each one (otherwise the studio shot flashes mid-reveal).
- Panel glides in, totals roll (`studio/Rolling.jsx`), quantity ticks, drawn tick on the added-to-cart card. All motion is
  skipped for `prefers-reduced-motion`.
- Testing tip: the Browser pane only draws frames on a screenshot. To check an animation, step it manually (r3f `advance`
  with a faked `performance.now`) and lay the frames out in a contact sheet.
- Not tested: Review on a phone; the added-to-cart tick (needs a real cart write); speed on a slow laptop.

**`fix-review-first-time` — MERGED 10 Oct 2026:** the first Review visit used to skip the start of the reveal (the room was
being built while the clock ran). Now the unfold and the camera move count their own time (clamped per frame), the reveal
and the "lights on" (`data-lit` on `.dr-app`, set by `onLit`) wait until the room has drawn a few frames, and the room's
reflections stay loaded (studio sets `scene.environmentIntensity = 0`) so materials are not rebuilt on entering Review.

**`feature-review-dark` — MERGED 10 Oct 2026:** the Review dressing room is now dark with pools of light (user's choice):
a spotlight on the designed tee and one on each rack (`Spot` in `Room3D.jsx`), edge lights from behind that get stronger
for dark tee colours (`dark` in `Boutique`), the arch dimmed to a glow, lamps over the racks.

**Branches `feature-ai-designs` + `feature-assistant-panel` — MERGED to `main` on 12 Oct 2026** (details: `docs/AI_PLAN.md`):
- **Real AI is live in the Design Room.** Key: `IDENTEE_GEMINI_API_KEY` in `server/.env` (Google Gemini, billing on; Google-side
  spend cap Rs 400/month). One key serves pictures (`gemini-nano-banana-2.1`) and text (`gemini-flash-lite-latest`).
- **Make a design** (`/api/ai/design`): describe -> style -> pictures, cut out on the server (sharp), Add to tee / Other area /
  Change. **Photo to art**: upload a photo -> Cartoon / Sketch / Sticker / Watercolour / Pop art.
- **AI slogans** (`/api/ai/slogans`), **edit by chat** and **one sentence for the whole tee** (`/api/ai/edit` + `studio/aiOps.js`):
  the text AI returns checked ops (text, colour, shape, size, move, delete, add text, tee colour, a picture per area).
- **The assistant has its own panel**: first screen offers Design it myself / Design with the Assistant; Assistant button in the
  top bar; manual editing always one tap away.
- **Admin -> Settings -> AI designs**: on/off, requests per customer per day, pictures per request, monthly cap, cost per picture,
  spend and latest requests. Keep the site's cap a little under Google's cap.
- `AI_IMAGE_PROVIDER=mock` = free stand-in pictures for testing. Footer now carries the 3D model credit (CC BY 4.0).
- **Decision to confirm with the client:** the user removed all subject restrictions (customers can ask for famous characters,
  brands, real people); only Google's own rules and a rights line in Review remain. I advised against it.
- Not yet tested with the real picture AI: photo to art, the whole-tee sentence, 'change it', styles other than Bold mascot.
- `@imgly/background-removal-node` (AGPL) is still in `server/package.json` from earlier work; check whether anything uses it.

**`feature-assistant-examples` — MERGED to `main` on 12 Oct 2026:** the assistant opens with a list of what it can do
(`EXAMPLES` in `assistantScript.js`): tap-able examples that fill the message box or start the feature; "What can you do?" shows it again.

**`fix-email-sender` — NOT MERGED (waiting for the user's "merge"):** one email setup for everything the site sends
(`server/utils/mailer.js`: `mailer()`, `fromAddress()`, `shopInbox()`). Before, only login codes could use EMAIL_HOST; order
/ invoice, contact-form, enquiry and review emails were hard-wired to Gmail, and contact messages, enquiries and invoice
copies went to previous developers' Gmails (contact: a hard-coded address; MAIL_TO / ADMIN_EMAIL in .env). Now they all
go to the shop inbox from Admin → Settings → General (support, else store email = info@identee.co.in); contact messages
have Reply-To = the customer; the enquiry auto-reply signs "The IDENTEE Team" (MAIL_FROM_NAME no longer used).
The company has **Zoho Mail (info@identee.co.in)**. To switch: Zoho app password + SMTP on, SPF/DKIM verified (DMARC
added) in the Zoho admin, then .env EMAIL_HOST=smtp.zoho.in (or .com), EMAIL_PORT=465, EMAIL_USER=EMAIL_FROM=
info@identee.co.in, EMAIL_PASS=<app password>; restart. Checked (no mail sent): server starts, SMTP login OK, shop
inbox = info@identee.co.in. `utils/mailSender.js` is old unused CommonJS code (not imported anywhere).

**`print-start-lines` — MERGED to `main` on 14 Oct 2026:** the print team's start lines (their handwritten
sheet, 14 Oct 2026): how far the print's top edge is below the collar, per size group S–M / L–XL / 2XL–3XL.
- Full Front, Vertical Front, Front Right Vertical: 6 / 7 / 8 cm. Top Back, Centre Back, Vertical Back: 8 / 10 / 12 cm.
- `collarCm` per area in `server/data/printPositions.js` (sent with the positions and in the print pack). The 3D tee places
  these areas from the collar line (`anchors.*.neck` in `teeModel.js`); the print pack says "its top edge below the collar:
  7 cm (sizes L, XL) — your start line".
- Not on the sheet (still estimates): Centre Front, Left/Right Chest, Full Back, sleeves.
- Print pack, "so the print team never wonders where": each file also gets "On the tee" lines (`artworkOnTee` in
  `printFiles.js`) — where the ARTWORK lands on the garment: its top edge in cm below the collar per size (areas with a
  start line) or below their usual start line (others), and its centre from the tee's centre line (wearer's left/right).
  The same lines are printed on each guide-….jpg.
- ORDER-SHEET.txt rewritten to be read in seconds (user: "they don't have time to read for each t-shirt"): a 4-line
  header (TOP = from the collar, SIDE = from the centre line), then per design one block per SIZE (team order: per
  PLAYER) with one line per print: PRINT · ARTWORK size · TOP · SIDE · FILE. "CHECK FIRST" lists problems; a * marks a
  distance from the usual start line (explained under the design). `artworkSpot` / `downText` / `acrossText`;
  `whereOnGarment` removed. Tested with a made-up normal order + team order in the browser.
- TEE MAP pictures (`teeMap` in `printFiles.js`): per size (team order: per player) and side, `MAP-size-M-front.jpg` —
  a tee sketch on the order's colour with the COLLAR and CENTRE LINE, each print area (dashed) with the artwork in place
  and to scale (12 px/cm), a red TOP arrow (from the collar, or from "YOUR USUAL … START LINE*" drawn at the estimate in
  `EST_START`, same as teeModel) and a blue SIDE arrow from the centre line. Sleeves: sheet only. Named on each block's
  title line in ORDER-SHEET.
- Only tee measurements now (user: "the print team should not get confused"): the guide-….jpg pictures (artwork inside the
  print area) and the map's print-area boxes were removed; each map shows the artwork with its name and size, TOP from
  the collar and SIDE from the centre line (centred = half the width each side). Sheet header = "HOW TO PRINT", 3 steps.
- `docs/print-requests/collar_measure_question.png` (+ .svg): picture asking the print team whether "from the collar"
  means the TOP edge of the collar (A) or the collar SEAM (B). ANSWER (14 Oct 2026): the collar SEAM (B). Sheet, map and code notes say "collar seam".
- JOB CARDS (user: the sheet was "clumsy"; their zip of VF-2026-0026 was still the old main version): every print is
  numbered (front, back, sleeves) and its file is named `1-Vertical-Front_2XL.png` (team: `_P01-Arun-7`). One
  `JOB-CARD_size-2XL.jpg` (team: per player) per size: a black heading (order · size · qty), front and back tee drawings
  with numbered prints and TOP / SIDE arrows (`teeMap`, now returns a canvas), and a table # · PRINT · ARTWORK · TOP ·
  SIDE · FILE, then CHECK FIRST problems and * notes (`jobCard`). ORDER-SHEET.txt is now 5–6 lines per design (job
  cards + file list). MAP-….jpg files gone.
- Bug fixed: `artworkBox` measured turned items in % of a non-square area (VF-0026 Front Right Vertical said 1.7 × 54
  cm; really 9.2 × 20 cm). It now works in cm. Checked by building the pack for VF-2026-0026 (read-only) in the browser.
  Checked with a made-up order run through `buildPrintPack` in the browser (Full Front M/L/2XL + Left Chest): 17 / 18 /
  19.4 cm below the collar, chest logo 8.2 cm to the wearer's left.
- Effect: Top Back, Centre Back and Vertical Back now all start on the same line, so they overlap and only one of them
  can be used at a time (before, Top Back + Centre Back could be used together).

**`feature-print-placement` — MERGED to `main` on 13 Oct 2026:** the print pack now tells the print team
where things go (user: "if the image starts from the centre of Centre Front, how do they know?").
- ORDER-SHEET.txt opens with "HOW TO PLACE A PRINT": each PNG is the WHOLE print area with the artwork already in place — line up
  the file's edges, never crop and centre the artwork. Per area: "where on the tee" (`whereOnGarment` in `printFiles.js`, from each
  area's `place` + its side's main area, sent by `getOrderPrintPack` as `main` / `place` / `mainLabel`); per file: the artwork's
  size and its distance from the area's left and top edges (`artworkBox`).
- A `guide-<area>_<w>x<h>cm.jpg` per area and print size: the area on the tee's colour with the artwork, a cm ruler on the top
  and left, centre lines, and the artwork's box with its distances — marked NOT FOR PRINTING (`placementGuide`).
- Checked by building the pack for real order VF-2026-0024 in the browser (read-only): sheet text and the Centre Front guide.
- The "where on the tee" distances are the estimates in `server/data/printPositions.js`; they become exact when the print team
  sends its start lines (still an open request).

**`fix-three-pictures-limit` — MERGED to `main` on 13 Oct 2026:** one message can ask for pictures on
several areas ("lion on front, tiger on back, zebra on left sleeve"); the page draws at most THREE (`MAX_PICTURES` in `chatEdit`).
A fourth used to be dropped silently. Now the planner lists every picture asked for, the page draws three and says which were
left out and to ask again; the example in the Assistant's list says "Up to three pictures at once". Checked with the text service:
the three-picture sentence plans lion/centre-front, tiger/full-back, zebra/left-sleeve; a four-picture sentence plans four (the
eagle on the right sleeve is the one left out). NOT run with the real picture service (three drawings in a row, ~₹21).

**`feature-lettering-art` — MERGED to `main` on 13 Oct 2026:** words as a
picture. The user showed a brush-lettered slogan tee and wants customers to get that from a plain request ("make the text God is
only belief as a image on the t-shirt front"). New picture style **Hand lettering** (`AI_STYLES` in `aiImageService.js`); the
Assistant spots such requests ("as an image / picture", "typography", "lettering", "a design that says …") and sends the words
straight to that style, without asking for a style (`asPicture` block in `assistantScript.js`). "add/write text that says …" still
adds real text. New example in the Assistant's list. One paid run of the user's exact prompt (2 pictures, ~₹7, not recorded in
AiUsage because it was run from a script): both spelled correctly, brush lettering with splatters, backgrounds removed.
Not checked: the flow on screen in the Assistant; placing on the area named in the request (the customer taps Add to tee).

**`feature-art-filters` — MERGED to `main` on 13 Oct 2026:**
Google's picture service refuses some photos (the user's photo of a film star: `400 Request blocked for an unspecified policy
reason`). Our own art filters now cover that — no AI service, free, about a second: `server/services/artFilterService.js` makes
**Sketch, Stencil, Poster and Pop art** from any photo (sharp + plain pixel loops). Sketch and Stencil are ink on a see-through
background (dark ink for a light tee, light ink for a dark tee). A photo on a plain background has the background removed and
the empty space trimmed (`subjectMask`); a busy background is kept whole; a see-through PNG keeps its own outline.
- `POST /api/ai/design` with `{ photoUrl, artStyle: "Art filters (free)" }` returns the four (not counted, no cost, works with the
  AI off); and when the picture service refuses a photo-to-art request (422) the same four come back by themselves with
  `{ filtered: true, refused: true }`. The Assistant offers "Art filters (free)" beside the AI styles and explains a refusal.
- Checked: the filter path through the server on a throwaway DB (5 checks), and the filters on three real pictures (the user's
  star photo — small, dark, plain background; a bike on a busy street; a see-through illustration), for light and dark tees.
- NOT checked: the refusal fallback with the real picture service (the code path is the 422 branch in `makeAiDesign`), and the
  Assistant flow on screen. Gotcha fixed on the way: sharp returns THREE channels after `blur()` on a one-channel raw picture —
  use `.extractChannel(0)`.
- Told the user to tell the client: printing a film star's face on tees for sale can bring a legal complaint (personality rights).

**`fix-team-name-link-old-designs` — MERGED to `main` on 13 Oct 2026:** the user typed a team name on
the chest and the back did not follow — their jersey was placed before the link existed (a reload keeps the old design). Now any
design works: when a text is changed and the SAME words are on another print area (not a player name/number), they are linked
from that change on (`syncLinked`). A linked text's settings have a switch that stays visible: **Change everywhere / Only this one**
(`link` = `"team"` | `"solo"`, both saved); switching back to "everywhere" gives the other places this text's words at once.
Second case (the user's actual one: chest already said "Chennai Strikers", back still "TEAM NAME"): a text that still shows a
layout's sample words in the layout's own area follows the name typed in the layout's other area (uses `TEMPLATES` items with `link`).
Same branch: the question "Does this text change for each player?" with its three buttons is GONE from the text settings (user:
"not needed"). A per-player text shows one line ("Each player gets their own name here…" + "Make it the same on every tee");
any other text has a quiet line at the bottom: "Ordering for a team? Use this text as each player's name or number." The
`teamTools` / `teamAsked` switch was removed. `element.role` and everything behind it are unchanged.
Checked on the dev site with an old-style jersey: typing on the chest changed the back; "Change only this one" then changed one.

**`feature-team-name-link` — MERGED to `main` on 13 Oct 2026:** on the Team jersey layout the team name
is on the chest and on the back; they are now linked (`element.link = "team"`, set by the template). Changing the words of one
changes the other (`syncLinked` in `DesignRoomPage.jsx`, used by typing and by chat edits); each keeps its own size and is made
smaller only as far as a long name needs (`ownSizePct`), so a shorter name gets its size back. The text AI is told which text is
the team name / player name / player number (`is` in `describeDesign`) — before, "change the team name" changed the PLAYER text.
Also: the left panel's cards and tabs no longer overflow at 761–1279 px widths. Checked on the dev site (typing a long and a
short name, a chat edit, the back view). Not checked: saving and reopening a linked design from My designs.

**`feature-compare-pictures` — MERGED to `main` on 13 Oct 2026:** in the order's print-files window,
an enlarged picture has one button, **Compare with the original**: both pictures side by side on the tee's colour, with their
pixel widths, shared zoom (Whole / 2× / 4× / 8×, mouse wheel, double-click) and shared dragging; Esc closes only the compare
view (`ComparePictures` in `OrderDesignsModal.jsx`). Checked on a throwaway order with the real 1,024 px and 4,096 px pictures.

**`feature-print-enlarge` — MERGED to `main` on 13 Oct 2026:** pictures at print quality (the user
wants 300 DPI). AI designs are made at the picture service's 1K size (~1,000 px): about 90 DPI on Centre Front, 70 on Full Back.
- **Admin → Orders → Designs & print files** now lists each picture in an ordered design with its real DPI at print size
  (`PrintPictures` in `OrderDesignsModal.jsx`) and, when it is under 250 DPI, an **Enlarge for print** button.
- `POST /api/ai/admin/print-picture { designId, index }` (`makePrintPicture` in `aiController.js`): the picture goes to the
  picture service at its **4K** size (`generateImage({ size: "4K" })`, `printPrompt`), is put on a sheet of the nearest allowed
  shape and cut back so it keeps its own shape, gets its background cleared (AI designs: `cutOutPlainBackground`; a customer's
  see-through picture keeps its own outline), is stored as near-lossless WebP in `identee/print-pictures`, and saved on the
  ordered design as `element.printSrc`. `DELETE` on the same address goes back to the original. Counted as 3 pictures of spend
  (`PRINT_COST_FACTOR`, kind `print` in AiUsage). The print files use `printSrc` when it exists (`printFiles.js`).
- **Customer side (user's point: a "Low — may print blurry" note would make customers swap a good design):** the Design
  Room now judges a picture as it WILL be printed — after the shop's enlargement (`printSharpness` in `designCheck.js`: ×4, up
  to 4,096 px, only while the AI is on). The picture's settings say "Good · we sharpen it before printing"; the design check
  only calls a picture blurry when it would still be under 100 DPI after enlarging. This is a promise the admin keeps by
  pressing Enlarge for print on low pictures before printing.
- **One paid test (user approved):** a 1,024 px AI design came back 4,096 × 4,096 in 35 s — same drawing and lettering, clean
  edges; after cut-out 2.5 MB as WebP (a PNG would be 15.9 MB). 4,096 px = 372 DPI at 28 cm, 274 DPI at 38 cm, ~200 DPI at 52 cm.
- 8 API checks passed on a throwaway DB with the stand-in picture; the admin window was clicked through there too.
- **NOT tested:** the whole flow with the real picture service and Cloudinary (it would write to the shared DB and cost ~₹11);
  a customer's photo or see-through logo with the real service; the exact price of a 4K picture (check Google's spend page —
  the ×3 is an estimate from the tokens used). Ask the print team whether 200–275 DPI is fine for the largest areas.

**`fix-colour-on-reload` — MERGED to `main` on 12 Oct 2026:** "Start designing" opens the room with
`?new=1&color=<slug>`; only `new` was removed from the address, so on a reload the leftover `color` won over the colour the
customer had picked. Now `color` is removed too, and a design in progress keeps its own colour (the address colour only
starts a NEW design). Checked on the dev site: start white → pick Red → step in → reload → still Red.

**`fix-keep-on-reload` — MERGED to `main` on 12 Oct 2026:** what a page reload keeps in the Design Room.
- New `identee:room:v1:<garment>` in localStorage (`ROOM_KEY`): that the customer is in the room, colour, size, whether the
  assistant is open, its conversation (last 80 messages, with the pictures it offered) and `aiPlaced`. Before, only the design's
  items were kept: an empty tee went back to the first screen and the chat was always lost.
- A design saved to My designs and changed afterwards: the draft now carries `dirty` + `locked`, and a reload keeps the local
  changes instead of fetching the saved version over them (`keepLocal`, `unsaved`).
- Stepping in on a fresh start (`?new=1`) now replaces the unfinished design kept from before (it was offered as "Continue it").
- Checked on the dev site: reload with an empty tee (room, colour, open assistant and chat came back) and after the Team jersey
  layout (design + chat came back). NOT checked: the saved-design case (needs a login and a real save), and pictures offered by
  the AI after a reload ("Add to tee" then takes the slower path once, by design).

**`feature-delete-garment` (built on `fix-admin-role-guards`) — MERGED to `main` on 12 Oct 2026:** a garment
added by mistake can be deleted from Admin → Customizable → open it → last step (Publish) → "Delete this garment". Server rules
(`deleteGarmentType`): not while it is live (unpublish first), not when any saved design uses it (it stays an unpublished draft);
its colour photos (rows + stored files) are removed with it. 8 API checks passed on a throwaway DB; the button itself was not clicked.
Same branch: the "Older pages" links on the Customizable list were removed (user's request). The old pages still exist at
`/admin/garment-types` and `/admin/garment-photos` (unlinked); the old Garment types page has a one-click Delete with no confirmation.

**`fix-admin-role-guards` — MERGED to `main` on 12 Oct 2026:** making another person an admin already
existed (Admin → Customers → Edit → "Promote as Admin"; the person must have logged in to the site once so they have an account).
Added rules in `server/controllers/userControler.js`: an admin can't remove their own admin access or delete their own account, an
admin account can't be deleted until its admin access is removed, the last admin can't be removed; and a confirmation in the Edit
page before giving admin access. 9 API checks passed on a throwaway DB. The confirmation box itself was not clicked through.
Same branch: **Admin → Customers was restyled** to the light admin look (`pages/admin/AdminUserPage.jsx`): four tiles, search by
name/email/phone, filters (Everyone / Have ordered / No orders yet / Admins & staff), a table with access badges, orders and join
date; Delete is off for your own row and for admins. The old pie chart is gone. The Edit page (`AdminEditUserPage.jsx`) got
readable colours and plain role labels. Checked on the dev site with the real data, read-only.
**`fix-ai-refusal-message` — MERGED to `main` on 12 Oct 2026:** the user asked for "Messi
kicking a football" and Google's picture service refused it (server log: `400 Image generation blocked for unspecified reasons`).
That is Google's own rule (real, named people / protected characters) — our site has no restrictions, and it cannot be switched off
from our side. Changed: the customer's message now says what usually causes it and suggests describing the picture without the
name (`aiImageService.js`); and the assistant no longer says "I've added a picture…" when the picture failed (`chatEdit`).
Not tested with the real image AI (it would cost a request).
**`feature-email-sender` — MERGED to `main` on 12 Oct 2026 (does nothing until `EMAIL_HOST` is set):** login codes can be sent through any mail
service: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` in `server/.env` (`services/otpSender.js`). Without
`EMAIL_HOST` it still uses the Gmail account, as before. NOT tested with a real service yet (no account). Why codes land in spam
today: they are sent from a personal Gmail address. Found (read-only DNS look-up): `identee.co.in` mail is on Zoho (MX), has an
SPF record and DMARC `p=quarantine` — so mail sent as `@identee.co.in` through Brevo MUST have Brevo's DKIM + SPF records added
to the domain first, or it will be quarantined. Steps for the user/client: Brevo account → add domain → add the DNS records Brevo
shows → SMTP key into `.env` → `EMAIL_FROM=no-reply@identee.co.in`. Only the login-code email uses this; the other mailers
(`utils/mailSender.js`, contact, enquiry, review) still use their own Gmail settings and should be moved the same way.

**`feature-area-cards-colour` — MERGED to `main` on 12 Oct 2026:** the small tees on the "Where to print"
cards are drawn in the colour of the tee being designed (`AreaThumb` `fabric`); a dark tee gets a light box (`.dr-thumb.on-dark`).

**`fix-back-arrow` — MERGED to `main` on 12 Oct 2026:** the Design Room's top-left arrow goes back one
step (Review → Design → colour & size → the garment list) instead of leaving the room at once; the design is kept (`stepBack`).

**`feature-room-polish` — MERGED to `main` on 12 Oct 2026:** a livelier Design Room (all 7 ideas the user
agreed to).
- **Point at the tee:** the print area under the pointer glows on the 3D tee (`AreaGlow` in `Room3D.jsx`), a dark chip names it
  ("Centre Front · 28 × 32 cm · Tap to design here") and its card lights up in the list; a tap opens it. Where areas overlap
  the lowest `rank` wins (smaller area first, a side's main area favoured, tall thin strips give way) — `areaAt` in `Tee`.
  Areas covered by another design are left out (`hotspots` in `DesignRoomPage.jsx`).
- **Point at a card in "Where to print":** the area glows on the tee and, when nothing is being edited, the tee turns to that side.
- **Studio:** two softboxes, a glow on the wall, a pool of light and a second gold ring on the floor, gold dust, a soft vignette
  (CSS). All of it is in the group `studio-extra`, which the saved preview pictures leave out (`snapshot`).
- **Feedback:** the tee leans a little towards the pointer; it gives a small pop and the plinth ring lights up when something is
  added (`popKey`) and the ring lights on a colour change (`PULSE`); cards and buttons lift on hover and press in; the cards
  arrive one after another. Motion is skipped for "reduce motion".
- **Ways to start:** on an empty tee three cards sit under it — Add text, Upload a picture, Ask the Assistant (`.dr-starts`).
- **"Where to print" panel:** Front / Back / Sleeves tabs (`areaTab`; a gold count shows how many areas on that side have a
  design; the tab follows the area being edited or pointed at on the tee; choosing a tab turns the tee), two bigger cards per
  row, and a used area's card shows the tee in its colour with the real design on it and a tick (`printThumb` in `konvaRender.js`).
- **Quick tool bar** above the tee for the selected item: smaller, bigger, Centre, Copy, To front, Delete (`.dr-quickbar`,
  `resizeSel` / `centreSel`). The full settings stay in the right panel.
- **Bolder pass (same branch):** the first screen is a shop window — card on the left, the tee turning on its stand beside
  it and changing colour live (`showcase`; the 3D picture is slid right with CSS `.dr-stage[data-fit] .dr-room`, the camera
  pushes in). Stepping in: the tee does one full turn (`twirlKey`, also on a colour change in the room), panels glide in.
  On a computer the room is three rounded cards on a soft ground (panel · stage · panel) with a gold hairline under the top
  bar; prints fade in when first placed; the main buttons have a slow sheen; the start cards moved above the tee.
- **Light / dark studio switch** (sun/moon button in the top bar, remembered in `localStorage` `identee:room-dark`, light is the
  default): only the 3D stage goes dark — charcoal walls, the same softboxes and gold ring, lights from behind so a dark tee keeps
  its outline; panels stay light. `SKIN` + `skinStudio(scene, dark)` in `Room3D.jsx` set it by object name (`skin-…`); the saved
  preview pictures are always taken in the light studio (`snapshot`). Review is unchanged. To make dark the default, flip the
  `useState` initial value of `darkRoom` in `DesignRoomPage.jsx`.
- **Fixed on the way:** the tee model has an outer and an inner fabric layer — a tap on the front reached a BACK print's inner
  layer and opened Full Back. Prints now use the outer layer only (`keepFacing` for flat areas), react only from their own side,
  and a tap ends on the tee. Front/back for picking goes by the viewing side, not the fabric's direction.
- Checked in the browser on a computer: hover/tap on the tee (Centre Front, Left Chest, Vertical Front), card hover turning
  the tee to the back, opening an area, adding text, Review and its four side pictures (clean). **Not checked:** phones,
  dragging speed with the new studio on a slow computer, the pop itself (too quick to catch in a screenshot).

**`feature-team-order` — MERGED to `main` on 12 Oct 2026:** team orders — one design, a different
name and number on each tee.
- **The per-player setting is hidden unless it is a team design** (a text already set as name/number, players in the list, or the
  customer pressed the small "Ordering for a team?" link at the bottom of a text's settings — `teamTools` in `Controls`).
- **Marking:** a text has "Does this text change for each player? No, same on all / Yes, the name / Yes, the number" in its settings
  (`element.role` = `name` | `number`). The Team jersey layout marks PLAYER and 07 by itself.
- **Review:** when a text is marked, a switch appears — "The same on every tee" / "A name & number per tee". The second shows
  a player list (name, number, size; + Add a player; Paste a list). One row = one tee. Tapping a row shows that player's
  tee on the 3D model (turned to the side the name is on). A long name is made smaller to stay inside the print area.
- **Storage:** `design.players = [{ name, number, size }]` (max 99), saved with the design; code in `studio/teamOrder.js`
  (list reader `parsePlayers`, counts) and `playerElements()` in `studio/konvaRender.js` (draws one player's tee — used by the
  Review preview and by the print files).
- **Cart / checkout:** a team design is always its list: the server counts sizes from the list (`rosterItems`), ignores
  quantities sent by the browser, keeps the cart in step when the list changes (`syncTeamCart`), and refuses quantity
  changes in the cart ("open the design to add or remove players"). Buy now does the same. Price per tee is unchanged.
- **Print files:** an area that carries a marked text gets ONE FILE PER PLAYER
  (`Full-Back_02-10-Karthik-Subramaniam_XL_38x42cm_300dpi.png`); other areas stay one file per size group. ORDER-SHEET.txt
  lists the players; a warning shows if the list and the ordered sizes ever disagree.
- **Assistant:** understands a pasted list ("Arun 7 L, Karthik 10 XL") and "Team order"; listed in its examples.
- **Tested** on a throwaway DB: 16 API checks (save, validation, cart follows list, order, print pack), and in the browser:
  assistant list → Review list → player preview on the tee → cart page → print ZIP (file per player looked right).
  **Not tested:** phone layout of the player list, the role buttons' look in the text settings, My designs "Add team to
  cart" button, the admin print window's table (its data was tested), Razorpay path.
- Review opens on the first player's tee; the four side pictures (and so the saved previews) follow the player being looked at.
  A warning shows in the list when it has names/numbers but no text on the tee is set to carry them.
- Known limits: the saved preview pictures show one player only (the one last looked at); one size per player row
  (a player wanting two tees needs two rows).

**`feature-ai-more` — MERGED to `main` on 12 Oct 2026:** Make it sharper / Recolour for this tee (picture settings) and the
text stylist ("Style it for me"). Sharper and recolour are untested with the real image AI. See `docs/AI_PLAN.md`.

**Asked earlier, not built — making the AI easy to find OUTSIDE the assistant** (user: "how does the user know these AI features are here?").
Proposed, in order: (1) a Home-page section "Design with AI" with 3 examples and a button into the room with the assistant open;
(2) an "AI" badge + one line on the Customizable card/page; (3) the assistant's first message lists what it can do with
tap-able examples (make a design, photo to art, slogans, edit by chat, whole tee in a sentence); (4) hints inside the manual
tools — under the Step 2 tabs "or ask the Assistant", and after an upload "Turn this into art" / "Remove background";
(5) a one-time tip pointing at the Assistant button on the first visit. Wait for the user's go-ahead.

**Next:** policy pages (Privacy, Returns & refunds, Shipping, Terms — required by Razorpay for live payments; need the
client's rules), Payments / Sellers admin pages; go-live items (Brevo email, deployment,
Razorpay live keys). Gotcha: the C: drive is nearly full — keep throwaway test databases on E:.

**Waiting on the client / user:** the print team's measurement answers (`docs/print-requests/IDENTEE_Oversized_Measurement_Request.pdf`:
where each print starts, sleeve length/opening, sizes of the other 9 areas, Pantone codes); licence of the white oversized-tee
photo used for the 2D garment photos; AI design budget (AI tool shows "soon"); Razorpay live keys at launch.

## 1. Project in one paragraph
IDENTEE is a custom-apparel e-commerce web app (client project at Quindl): customers design their own T-shirts or buy ready-made
products; admins manage catalogue, orders, etc. Stack: **React 19 + Vite + Redux Toolkit** (`frontend/`), **Node + Express (ESM) +
MongoDB/Mongoose 9** (`server/`), **Razorpay** (test keys) + COD, **Cloudinary** for all uploads (account `vy728xfe`), Gmail SMTP.
3D: **three.js + @react-three/fiber + drei**; design editor: **Konva**. Original spec = "AI-Powered Custom Apparel E-commerce Platform".

## 2. Client focus & product decisions
- **Oversized Tee only for now** (240 GSM Cotton + French Terry, XS–3XL, 12 colours). Polo and others later "when needed" — the system
  stays multi-garment (admin wizard). The 5 old test garments were **deleted** from the shared DB on 9 Oct (backup:
  `identee-private-assets/backup-2026-10-09-removed-garments/`); only `oversized-tee` remains (live, **₹899**, 7 sizes + chart,
  both fabrics, 12 colours, 48 photos, 6 print areas, photo ruler 27.29% / 87.6%). All old test designs were deleted too.
- **Prices:** garment base price (+ paid art) per piece; per-print-side prices later (client undecided).
- **Studio decisions (9 Oct):** Konva editor; **3D Design Room** is the main view (flat editing layer per print area, prints shown
  as decals); many sizes per design, **no minimum**; guests can design, login to upload / save / order.
- **Print boxes are true to size** per garment size (size chart = ruler); print start positions are estimates until the print team answers.

## 3. What's on `main` (merged 9 Oct, see PHASE1_PROGRESS)
| § | Feature |
|---|---|
| 4–5 | Email OTP login (phone OTP built, off); ordering security (server pricing, Razorpay verify + webhook, atomic stock, coupons, CANCELLED) |
| 5.9, 6, 6b | Address validation + current location + PIN autofill; admin categories; all uploads → Cloudinary |
| 6c, 6f | Customizer Part A (real print positions, layout v2); size-accurate print boxes (customer size picker + photo ruler) |
| 6d, 6e, 6g | Admin redesign: 8-section menu, Home (setup checklist / needs attention / today — reads `general.*` settings), Customizable list + 6-step garment wizard (15 print areas), crashing pages fixed (Invoices, Shipping rates, Reviews), dead settings tabs removed, Payments/Sellers hidden, product shipping optional |
| 6h | Home page: "How would you like to shop?" → **Customizable** (`/customizable`, grouped by category) and **Ready-made** (`/ready-made`); top menu Home · Customize · Ready-made · About · Contact |

## 4. The 3D Design Room (branch `feature-design-room`)
- Flow: fitting (colour + size) → room (tee floating in the centre, colour swatches, Front/Back/Left/Right cameras) → tap a print area →
  flat Konva editor (text 10 fonts / colours / arcs, upload + DPI quality meter, art library, ideas, handles, pinch, snap, undo/redo,
  keyboard) live on the 3D tee → Review (4 mockups) → Order (saves + locks the design → Buy Now).
- Code: `frontend/src/studio/` (`DesignRoomPage.jsx`, `Room3D.jsx`, `AreaEditor.jsx`, `konvaRender.js`, `teeModel.js`, `StudioRoute.jsx`,
  `webgl.js`, `designRoom.css`); lazy route; no WebGL / no 3D model → classic flat studio (`pages/CustomizePage.jsx`).
- 3D model: `frontend/public/models/oversized-tee.glb` (1.7 MB, optimised) — "oversized_t-shirt" by ap-school, **CC BY 4.0, credit line
  required** (shown in the room; `public/models/ATTRIBUTION.txt`). Its UVs are a real-scale sewing pattern (≈130.7 cm per UV unit, front
  panel 56.8 × 72.4 cm ≈ S/M). Originals + measurements: `identee-private-assets/3D-models/`. Light fallback model (CHMIL, CC BY) there too.
- Prototype: https://claude.ai/artifact/CpC7keN2M9xQFhNaeSnyPY (source: `identee-private-assets/design-room-prototype/`).
- **Where a design is stored:** MongoDB `customizations` (elements, garment, colour, size, name, `orderedAt` lock, `hiddenAt`) +
  4 mockups in Cloudinary `identee/mockups`; uploads in `identee/designs`; orders keep the design id + front mockup.
  Browser autosave: `localStorage identee:design:v3:<garment>`. API: `/api/customizations` (`POST`, `GET /mine`, `GET/PUT/DELETE /:id`,
  `POST /:id/duplicate`).
- Pages: `/my-designs` (T-shirt icon in the top bar), order page "View your design" (`components/DesignPreview.jsx`).

## 5. Repo, branches, how to run
- Folder `E:\AI CUSTOMIZATION\Identee` (Windows). `origin` = **https://github.com/vinith-codes/Identee** (public, user's own);
  `upstream` = `devipriya-code/Identee` (read-only).
- Workflow: one feature branch per piece of work → test → user says **"merge"** → fast-forward `main` → push. Never force-push `main`;
  undo with `git revert`. Leave the root `package-lock.json` change uncommitted (not ours).
- **Line endings:** some files are stored with CRLF while `core.autocrlf=true` — edit preserving `\r\n`, check `git diff --cached --numstat`,
  fix with `git -c core.autocrlf=false add <file>`.
- Run: `cd server && npm run dev` (3001) and `cd frontend && npm run dev` (http://localhost:5173, `VITE_API_URL=http://localhost:3001`).
- `server/.env`: MONGO_URI (Atlas, **shared team DB — ask before writing**), JWT_SECRET, EMAIL_*, RAZORPAY_* (test), CLOUDINARY_*. Never print secrets.
- Testing pattern: throwaway `mongod --port 27099` (data dir in the scratchpad) + server on 5099 (`MONGO_URI=mongodb://127.0.0.1:27099/identee_test`)
  + `VITE_API_URL=http://localhost:5099 npx vite --port 5174`; copy needed collections read-only from Atlas; delete test Cloudinary files after.
- The Claude terminal panel doesn't work on this machine (space in the user path) — start servers with background Bash.
- Artifacts can't serve `.glb` → embed as base64 in a `.js` module.

## 6. Private assets (NOT in git — repo is public): `E:\AI CUSTOMIZATION\identee-private-assets\`
Oversized-tee photo source + 48 generated images, `3D-models/` (CC BY originals, optimised glb, measurements, licence),
`design-room-prototype/`, `admin-prototype/`, `backup-2026-10-09-removed-garments/` (deleted garments, photos, designs). See its README.

## 7. Before go-live
Brevo + domain email (OTP mails land in spam), HTTPS + deploy to the Quindl server, `TRUST_PROXY=1`, Razorpay webhook + live keys,
run `scripts/migrateUserAuthIndexes.js`, old `server/uploads` → `scripts/migrateUploadsToCloudinary.js`, CC BY credit kept on the site,
print-team start distances applied.

**Deployment — the user decided on 12 Oct 2026 to do it LATER.** Plan agreed in words: a test link first (free hosting or the
Quindl server — the user has not yet said whether Quindl has one), real launch after the client gives domain access, live keys and
policy pages. Code to fix before any deployment (found by reading the code, NOT fixed yet):
- `server/server.js` CORS list is hard-coded (two localhost addresses + an old `new-vyavarclient-3f1f.vercel.app`) — take the
  site's address from a setting.
- `server/controllers/contactController.js` sends Contact-page messages to a hard-coded outside address
  (`paletteproductiondevelopers@gmail.com`), not to the shop — use the shop's address from store settings; check the enquiry and
  review mailers for the same.
- 34 frontend files fall back to `localhost` when `VITE_API_URL` is missing — build with the real address and verify.
- Nothing may rely on the server's own disk (`server/uploads`) on hosts that restart — pictures must go to Cloudinary.
- Write `docs/DEPLOYMENT.md` listing every `.env` setting.

**Background remover (Design Room) at go-live:**
- Host the AI model ourselves instead of fetching it from huggingface.co: copy `onnx-community/ormbg-ONNX` (`config.json`,
  `preprocessor_config.json`, `onnx/model_quantized.onnx`, ~44 MB) to our hosting and point Transformers.js at it
  (`env.remoteHost` / `env.allowRemoteModels` in `frontend/src/studio/removeBackground.js`).
- The host must serve `.wasm` files (the build adds a ~21 MB `ort-wasm…` file, only downloaded when the feature is used).
- Test on the live HTTPS address: one logo on a plain background (instant) and one photo (model download + cut-out),
  on a computer and on a mid-range phone; then order it and check the print file's background is transparent.

## 8. How the user likes to work
- Vinith is learning → plain words, step by step, tables; exact commands in separate code blocks.
- Wants things tested before merge and documented in `docs/`; asks "is it saved in DB?" → verify with read-only queries.
- Confirm before writing to the shared Atlas DB, before anything irreversible; keep backups before deleting data.
