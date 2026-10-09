# IDENTEE — Handoff for the next chat

_Last updated: 9 Oct 2026 (end of chat 2). Read this first, then `docs/PHASE1_PROGRESS.md` (full before/after history) and `docs/PRODUCT_SPEC.md` (products, sizes, print positions)._

## ⏭ Where we stopped (start here)
**DONE end of chat 2:** 48 Oversized Tee images uploaded to Cloudinary `identee/garments/oversized-tee`; GarmentType `oversized-tee` (12 colours, category "Oversized" → T-Shirts, **basePrice 0 — set a price in Admin → Garment Types**) and 12 `garmentcolorimages` docs with print areas created in the real DB. Test: http://localhost:5173/customize/oversized-tee?color=black. Photo licence still unconfirmed (user chose to proceed).

**DONE chat 3:** fixed the customizer "couldn't find" error (the 12 oversized photo docs lacked `isActive: true`; set it + added a loading guard). **Admin redesign Part 1** on branch `feature-admin-redesign` (from `feature-customizer-part-a`): 8-section menu, top bar, new Home with setup checklist / needs attention / today — see PHASE1_PROGRESS §6d.

**Garment set-up wizard** on branch `feature-garment-wizard` (from `feature-admin-redesign`): Admin → Customizable list + 6-step wizard, 15 print areas per garment, garment-photo writes now admin-only — see PHASE1_PROGRESS §6e.

**MERGED to `main` (9 Oct 2026):** `feature-customizer-part-a`, `feature-admin-redesign`, `feature-garment-wizard` (fast-forward, pushed). Old branches can be deleted later.

**NEXT:** size-accurate print boxes (customer picks a size; box = cm × px-per-cm from that size's chart) on a new branch from `main`.

**Still waiting on the user for:** photo licence confirmation for the white oversized-tee mockup (or client's own photos); the client's measurement-sheet answers.

**"Set it up" means:** upload the 48 images in `E:\AI CUSTOMIZATION\identee-private-assets\oversized-images\` to Cloudinary `identee/garments`; create GarmentType `oversized-tee` (label "Oversized Tee", category string "Oversized" so it joins the T-Shirts category styles, 12 colours with slugs/hex from `server/scripts/garment-images/build_oversized.py`), and a `garmentcolorimages` doc per colour with front/back/left/right imageUrl; set print areas to match the images (see calibration below). Ask before writing to the shared DB. Optionally hide Polos/Hoodies/Sweatshirts/Kids' Wear categories (asked, not yet approved).

**Then build (agreed order):** merge Part A → **size-accurate print boxes** (customer picks size while designing; box px = print cm × px-per-cm for that size; px-per-cm from the size chart length: M 30" = 640 px → 21.33 px/in; each size uses its own length/chest from the chart) → real admin menu + Home (as prototyped) → Oversized Tee setup wizard (incl. 15-area print-area gallery; garment's own size chart + per-garment print areas, "provisional" flag) → customer "Where do you want to print?" picker + mobile touch (Part B) → size × qty + fabric choice (Part C) → 300-DPI print files (Part D) → ready-made products.

**Garment images (done this chat):** the user's white oversized-tee photo (front/back) is recoloured into 12 colours and **widened to IDENTEE proportions** (chest:length = 23:30, verified 23.0" at 30"); side views are a drawn profile (`server/scripts/garment-images/side_white.svg`) at the same scale with **estimated** sleeve 9" long / 8.5" opening. Calibration: `server/scripts/garment-images/oversized_calibration.json` (canvas 800×1000, shirt top y=236, hem y=876, centre x=400, 21.33 px/in at M). Tool + README in `server/scripts/garment-images/` (Python + Pillow/NumPy, install with `python -m pip install --target <dir> pillow numpy`). Private assets (NOT in git, repo is public): `E:\AI CUSTOMIZATION\identee-private-assets\` (source photo, side_white.png, 48 images, admin prototype source).

**Sent to the client (awaiting answers):** `docs/print-requests/IDENTEE_Oversized_Measurement_Request.pdf` (sleeve length/opening, where each print starts in cm, sizes of the other 9 areas, Pantone codes, photo licence) and `IDENTEE_Polo_Print_Area_Request.pdf` (polo — later). When answers arrive: update `side_white.svg` scale / build script, rerun, and set print-area start distances.

**Admin prototype:** https://claude.ai/artifact/KTSQYRRyRygFv3ndfmtDGc (Home with setup checklist + "needs attention", Customizable list, 6-step Oversized Tee setup wizard incl. 15-area print gallery, customer area picker). User liked the direction; asked why a to-do Home (explained) — keep sales numbers as a smaller strip.

## 0. Current focus (client decision, 9 Oct 2026)
**Only the Oversized Tee for now** — customizable (240 GSM Cotton and French Terry, XS–3XL, 12 colours) plus ready-made oversized tees. Polo and other garments/categories come later "when needed": keep the system multi-garment capable, but build, test and set up only the Oversized Tee; hide other categories from the storefront. Polo print sizes were requested from the print team (`docs/print-requests/IDENTEE_Polo_Print_Area_Request.pdf`) — not needed now.

Admin redesign was agreed in principle and prototyped (Claude artifact "IDENTEE Admin Prototype": Home with setup checklist + "needs attention", Customizable list, 6-step garment setup wizard with a 15-area print-area gallery, customer "Where do you want to print?" picker). Next build steps: merge customizer Part A → real admin menu + Home → Oversized Tee setup wizard (incl. 15-area gallery, 6 offered) → customer area picker (Part B) → size × qty (Part C) → print files (Part D).

## 1. Project in one paragraph
IDENTEE is a custom-apparel e-commerce web app (client project at Quindl): customers design their own T-shirts (customizer) or buy ready-made products; admins manage catalog, orders, banners, etc. Stack: **React 19 + Vite + Redux Toolkit** (`frontend/`), **Node + Express (ESM) + MongoDB/Mongoose 9** (`server/`), **Razorpay** (test keys) + COD, **Cloudinary** for all uploads (account `vy728xfe`), Gmail SMTP for emails. Original spec = "AI-Powered Custom Apparel E-commerce Platform" (AI design, 360° try-on, print-operator panel — mostly not built yet).

## 2. Repo, branches, how to run
- Folder: `E:\AI CUSTOMIZATION\Identee` (Windows, user "Vinith B"). Git remote `origin` = **https://github.com/vinith-codes/Identee** (public, user's own); `upstream` = old team repo `devipriya-code/Identee` (read-only, don't push).
- `main` = all merged work (login, ordering, addresses, categories, Cloudinary uploads).
- **`feature-customizer-part-a`** = customizer Part A, pushed, **NOT merged yet** (waiting for user test → "merge" = `git switch main && git merge --ff-only feature-customizer-part-a && git push origin main`).
- Workflow agreed: one feature branch per piece of work → test → user says "merge" → fast-forward `main` → push. Never force-push `main`; undo with `git revert`.
- Uncommitted on purpose: root `package-lock.json` (one line, not ours — leave it).
- Run: `cd server && npm run dev` (port 3001, nodemon) and `cd frontend && npm run dev` (http://localhost:5173, `VITE_API_URL=http://localhost:3001` in `frontend/.env.local`).
- `server/.env` holds MONGO_URI (Atlas, shared team DB — **ask before writing to it**), JWT_SECRET, EMAIL_USER/PASS, RAZORPAY_KEY_ID/SECRET (rzp_test_), CLOUDINARY_NAME/APIKEY/SECRETKEY (user's own account). Never print secrets.
- The Claude terminal panel doesn't work on this machine (space in user path) — start servers with background Bash instead.
- Testing pattern used: throwaway local MongoDB (`mongod --port 27099`, data dir in the scratchpad) + server on port 5099 with `MONGO_URI=mongodb://127.0.0.1:27099/identee_test`, temporary `_tmp_*.mjs` test scripts in `server/` (deleted after), browser checks on 5173/5174.

## 3. Done (see PHASE1_PROGRESS.md for details)
1. **Email OTP login** (no passwords; phone OTP built but OFF via `PHONE_LOGIN_ENABLED`); `lastLoginAt`; user `vvinith040@gmail.com` is **admin** in the real DB (granted by request).
2. **Ordering security**: server-side pricing (`server/services/checkoutService.js`), Razorpay verify + webhook + PendingCheckout, one order per payment, atomic stock, coupons validated, admin/owner checks, status rules + CANCELLED. Real test payment passed (Netbanking → order VF-2026-0021).
3. **Address validation** + "Use my current location" (OpenStreetMap) + PIN autofill (India Post API).
4. **Categories**: admin-managed `Category` model (styles list links products/garments), home tiles, category page with filters; 5 launch categories created via `server/scripts/migrateCategories.js --apply` (check if user ran it on real DB).
5. **All uploads → Cloudinary** (`server/multer/multer.js` + `server/utils/imageStorage.js`, frontend `utils/imageUrl.js`). Old files: 152 DB references point to files on a teammate's laptop → run `server/scripts/migrateUploadsToCloudinary.js` (dry run, then `--apply`) after getting that `server/uploads` folder.
6. **Customizer Part A** (branch above): real print positions & cm sizes from the PDF (`server/data/printPositions.js`), layout v2 (element coords in % of its print box), position chips + size range, Google Fonts loaded, real arc text, login required to upload/save, server validation, autosave to localStorage. Box placement: `frontend/src/utils/printLayout.js` (main box = admin print area from Garment Photos if set).

## 4. Next (agreed plan)
- **Customizer Part B**: mobile/touch (pointer events, rotate + corner handles, Done/Delete like the phone-app reels the user shared), server drafts + reopen by `?design=<id>`, "Saved projects".
- **Part C**: size × quantity picker per design (BuyNow already supports items[]; server `checkoutService` currently prices one size for customizations — extend), Add to Cart for custom designs (cart model needs a customization ref).
- **Part D**: print-ready PNG per used side at 300 DPI using real cm (e.g. Full Back M = 38×42 cm), rendered server-side (Puppeteer is installed), + mockup preview; Admin → Orders "Download print files". Stored in Cloudinary `identee/print-files`.
- **Part E (later)**: realistic 3D preview (needs a better .glb with body/collar/sleeve parts), background colour, export mockup image. AI try-on / AI design = Phase 2 (paid AI APIs).
- Other Phase 1 leftovers: navbar search; product page fixes (kids sizes hidden, pending reviews leak, sellers edit others' products); GarmentVisual shows blank instead of outline when a photo 404s; broken sidebar links (Banners, Enquiries, Delivery); Upload Product shipping fields → optional; one "Pay online" button; remove obsolete change-password form; video upload size cap.
- Before go-live: Brevo + domain email (codes land in spam), HTTPS + deploy to Quindl server, `TRUST_PROXY=1`, Razorpay webhook + live keys, run user-index migration (`scripts/migrateUserAuthIndexes.js`).

## 5. Decisions & open questions
- **Prices: NOT decided** — user said "don't think about cost now". Keep current pricing (garment basePrice + art prices). PDF print prices (₹10/7/40/78) are probably cost prices.
- Launch print positions = the 6 with sizes; sizes named XS, S, M, L, XL, 2XL, 3XL.
- MOQ 3 pcs (from PDF) and blank-garment stock tracking: deferred.
- Guests can design; login required to upload artwork / save / order.
- Garment photos in DB are test images (tshirt/white has a lion print). The generated Oversized Tee images (above) replace them once approved.
- **Focus: Oversized Tee only** (client decision). Other categories (Polos, Hoodies, Sweatshirts, Kids' Wear) exist in code/DB but should be hidden until needed.
- **Print boxes must be size-accurate** (user requirement): the preview changes with the chosen size, using the PDF size chart as the ruler. 15 print areas exist in the guide; 6 have sizes (offered), 9 "size not set". Exact print start positions (cm below collar etc.) are unknown — currently ~10 cm below the shoulder line; requested from the client.
- Python tooling is fine for offline asset generation; the web app stays Node/React.

## 6. How the user likes to work
- Vinith is learning (asked about git branching, revert, Cloudinary limits) → explain in plain words, step by step, with tables; give exact commands in separate code blocks.
- Wants things tested before merge and documented in `docs/`; asks "is it saved in DB?" — verify with read-only DB queries.
- Confirm before writing to the shared Atlas DB, before pushing to GitHub for the first time on a new target, and before anything irreversible.
