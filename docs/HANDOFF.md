# IDENTEE — Handoff for the next chat

_Last updated: 9 Oct 2026. Read this first, then `docs/PHASE1_PROGRESS.md` (full before/after history) and `docs/PRODUCT_SPEC.md` (products, sizes, print positions)._

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
- Garment photos in DB are test images (tshirt/white has a lion print); real blank photos of the Oversized Tee (Cotton + French Terry, 12 colours) are needed, and print areas calibrated in Admin → Garment Photos.
- Categories for launch: T-Shirts, Polos, Hoodies, Sweatshirts, Kids' Wear.

## 6. How the user likes to work
- Vinith is learning (asked about git branching, revert, Cloudinary limits) → explain in plain words, step by step, with tables; give exact commands in separate code blocks.
- Wants things tested before merge and documented in `docs/`; asks "is it saved in DB?" — verify with read-only DB queries.
- Confirm before writing to the shared Atlas DB, before pushing to GitHub for the first time on a new target, and before anything irreversible.
