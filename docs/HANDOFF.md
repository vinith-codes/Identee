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

## 8. How the user likes to work
- Vinith is learning → plain words, step by step, tables; exact commands in separate code blocks.
- Wants things tested before merge and documented in `docs/`; asks "is it saved in DB?" → verify with read-only queries.
- Confirm before writing to the shared Atlas DB, before anything irreversible; keep backups before deleting data.
