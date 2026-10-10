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
