# IDENTEE — Project Status & Phase 1 Progress

_Last updated: 8 Oct 2026 (after login, ordering and address work)_

IDENTEE is an AI-powered custom apparel e-commerce platform ("Your Style, Your Story, Your Identity"). Customers design their own T-shirts/hoodies/polos and order them; the admin team manages catalog, orders and fulfilment.

> **Status:** Phase 1 steps 1 (login) and 2 (ordering + addresses) are done and tested. Changes are **not committed to git yet** (working tree on `main`).

## At a glance — before vs now

| Area | Before | Now |
|---|---|---|
| Sign up / login | Email + password; separate Register page (email OTP only to verify signup); Forgot/Reset password pages | One **/login** page: email → 6-digit OTP → (new users: name) → logged in. No passwords. |
| Login security | OTP stored as plain text and printed to console; "temp" users with password `temp1234`; reset email linked to another company's site | OTP hashed, single use, 10-min expiry, attempt + resend limits, per-IP limit; old flows removed |
| Profile | Email (and password) could be changed without verification | Email read-only (verified identity); `lastLoginAt` recorded |
| Checkout prices | Sent by the browser and saved as-is | Computed on the server (price, GST, shipping, coupon) |
| Online payment | Order marked **paid** if the browser sent any payment id | Server verifies the payment with Razorpay, one order per payment, webhook backup, auto-refund if stock ran out |
| Order permissions | Any logged-in user could change status / mark paid / read others' orders | Admin-only changes, owner-only reading, delivery staff only on assigned orders, valid status transitions, new **Cancelled** status |
| Stock & coupons | Overselling possible; cart removal added stock; coupon expiry / per-user limits not enforced at payment | Atomic stock, cart bug fixed, coupons fully validated |
| Custom-design checkout | Crashed | Works (garment base price + art prices) |
| Categories | Free text in 3 places, test values on the live home page, images on one laptop | One admin-managed list, home tiles + category page with filters, images on Cloudinary |
| Image storage | Files on one developer laptop (`server/uploads`), full size, SVG allowed | All uploads on Cloudinary, auto-resized, old files deleted on replace, SVG blocked |
| Address entry | Only "required" + PIN/phone digit checks in the checkout form; city could be anything; Account form barely checked | Full validation (browser + server), **📍 Use my current location**, PIN → city/state autofill |
| Docs | Default Vite README only | This document |

---

## 1. Tech stack (as built)

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, Redux Toolkit, Tailwind CSS, React Router 7, three.js (3D garment viewer) |
| Backend | Node.js + Express (ES modules) |
| Database | **MongoDB** (Mongoose 9) + GridFS. _Note: the original spec says MySQL — the team is staying on MongoDB._ |
| Payments | Razorpay (UPI, cards, wallets) + Cash on Delivery |
| Email | Nodemailer over Gmail SMTP |
| Shipping | FedEx services (used by delivery routes) |
| Media | Local `server/uploads/`, Cloudinary dependency present |

Run locally:

```bash
cd server && npm run dev      # nodemon, port from server/.env (PORT=3001)
cd frontend && npm run dev    # Vite on http://localhost:5173 (VITE_API_URL in frontend/.env.local)
```

---

## 2. What already existed before Phase 1

### Customer side
- Landing/Home page with video banners, offer and category banners, client logos
- Product browsing: all products, category pages, single product page, favourites, reviews
- Customizer: choose garment → choose colour → design editor (text, fonts, text effects, art library, own image upload, layers, undo, front/back/sleeve views, 3D T-shirt viewer)
- Cart, Buy Now, 3-step checkout (address → summary → payment), order success, My Orders
- Account page (profile, avatar, addresses)
- About Us, Contact Us

### Admin panel (`/admin`)
- Dashboard, orders, users, reviews, transactions, sellers
- Products (single + Excel bulk upload), art designs & categories (+ bulk upload)
- Garment types and garment colour photos
- Banners (offer, video, category), offers/coupons
- Shipping rules, billing invoices (PDF), subscription plans & subscribers
- Settings: general, profile, security, appearance, maintenance mode

### Spec items NOT yet built (from the Identee spec PDF)
AI design generation (text/image → design), AI background removal (package installed, not wired), AI upscaling, DPI/print-quality checks, save design as draft/template, 360° AI virtual try-on, re-order, print-operator production panel, DTF print-file export / production queue, refunds, support tickets, role-based access beyond `isAdmin`, SMS/WhatsApp notifications.

---

## 3. Phase plan

**Phase 1 (current):** make these four flows production-ready:
1. Login (email OTP) ✅ **done**
2. Product & category browsing — ✅ **categories done** (see section 6); search & product-page fixes still open
3. Customization — 🟡 Part A (print positions) done, Parts B–D next
4. Ordering (cart → checkout → payment → order) ✅ **done** (security fixes + address validation; test payment passed)

Later phases: production/operator panel, AI features, try-on, phone/WhatsApp, analytics, etc.

---

## 4. Phase 1 — Step 1: OTP Login (DONE)

### 4.0 How login worked before
- **Register page:** name + email + password → email OTP to verify → account created. Requesting an OTP created a placeholder user named "temp" with password `temp1234`.
- **Login page:** email + password.
- **Forgot / Reset password pages:** OTP by email; the email linked to `viyavarfashions.com` (copied from another project).
- OTPs were stored in plain text on the user record and printed to the server console; no limits on attempts or resends.

### 4.1 What changed for users
- One page at **`/login`**: enter email → receive 6-digit code → enter code.
  - **Existing user** → logged straight in.
  - **New user** → asked for their name once → account created.
- **No passwords anymore.** `/register`, `/forgot-password`, `/reset-password` now redirect to `/login`.
- After login, users go back to the page they came from (e.g. checkout). Admins go to `/admin/dashboard`.
- Account page: email is shown **read-only** (it is the verified login identity).

### 4.2 API

| Method | Endpoint | Body | Result |
|---|---|---|---|
| POST | `/api/users/otp/request` | `{ identifier }` | Sends code. `{ message, channel, resendAfter }` |
| POST | `/api/users/otp/verify` | `{ identifier, otp }` | Existing user → user object + `token`. New user → `{ needsProfile: true, signupToken }` |
| POST | `/api/users/otp/complete` | `{ signupToken, name }` | Creates account → user object + `token` |

**Removed endpoints:** `POST /api/users` (register), `/login`, `/sendOtp`, `/verifyOtp`, `/forgotPassword`, `/resetPassword`.

### 4.3 Security rules
- Code: 6 digits, cryptographically random, valid **10 minutes**, **single use**, stored only as an HMAC hash (never plain text).
- Max **5 wrong attempts** per code, then a new code is required.
- Resend allowed after **30 s**; max **5 codes per 15 min** per email.
- Max **30 OTP requests per 15 min per IP** (in-memory limiter).
- Requesting a code never creates a user (pending codes live in a separate `otpchallenges` collection that auto-deletes after ~30 min).
- `signupToken` is a 15-minute JWT that only works for `/otp/complete`; it cannot access any other API.

### 4.4 What is saved in the database
- **`users` collection** — new users: `name`, `email` (lower-case), `isEmailVerified: true`, `lastLoginAt`, empty `addresses`, role flags false. No password.
- **Returning users** — `lastLoginAt` updated on every login; `isEmailVerified` set to true.
- Profile details (last name, gender, DOB, avatar, addresses) are saved later from the Account page.
- The login **token** is stored in the browser (`localStorage.userInfo`), valid 30 days. Logout removes it.
- Legacy half-finished "temp" users from the old signup flow are asked for their name on login and their old `temp1234` password is discarded.

### 4.5 Other fixes made along the way
| Problem found | Fix |
|---|---|
| Users could change their email from the profile API without verifying it (account-takeover risk) | Email/phone can no longer be changed via `PUT /api/users/profile`; password field ignored |
| Old signup created "temp" users with known password `temp1234` | Old flow removed; migration script cleans them up |
| Password-reset email linked to another company's site (viyavarfashions.com) with the OTP in the URL | Old reset flow removed; new branded IDENTEE email |
| OTP printed to server console and stored in plain text | Hashed; console only for dev mode without SMTP |
| Auth middleware logged every user's JWT; deleted users' tokens still worked | Log removed; token rejected if user no longer exists |
| Order emails would crash order placement for users without an email | `sendEmail` skips when there is no address |

### 4.6 Phone (mobile) OTP — built but switched OFF
Phone login is fully implemented and tested but disabled until an SMS provider is approved (Indian SMS requires DLT registration; no provider is free long-term).

To enable later:
```
# server/.env
PHONE_LOGIN_ENABLED=true
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=...
MSG91_OTP_TEMPLATE_ID=...      # DLT-approved template with variable "otp"

# frontend/.env.local
VITE_PHONE_LOGIN=true
```
`SMS_PROVIDER=console` (default) prints codes to the server console in development only. The MSG91 integration is written but untested until an account exists.

### 4.7 Files

**New**
- `server/models/otpChallengeModel.js` — pending codes + rate-limit counters
- `server/utils/otp.js` — normalise email/phone, generate/hash/compare codes, limits
- `server/services/otpSender.js` — email sender + pluggable SMS providers
- `server/middleware/rateLimit.js` — per-IP limiter
- `server/scripts/migrateUserAuthIndexes.js` — one-off DB migration

**Changed**
- `server/controllers/userControler.js` — new OTP handlers; old register/login/reset removed; profile update hardened
- `server/routes/userRoutes.js`, `server/models/userModel.js` (email optional+sparse, `phone`, `isPhoneVerified`, `lastLoginAt`, password optional)
- `server/middleware/authMiddleware.js`, `server/utils/sendEmail.js`, `server/server.js` (`TRUST_PROXY`)
- `frontend/src/pages/LoginPage.jsx` (rewritten), `App.jsx`, `components/Navbar.jsx`, `pages/Account.jsx`, `services/authService.js`, `redux/slices/authSlice.js`

**Deleted**
- `frontend/src/pages/RegisterPage.jsx`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx`
- `server/utils/registerEmailOtp.js`, `server/utils/resetEmailOtp.js`

### 4.8 Configuration

| Variable | Where | Purpose |
|---|---|---|
| `EMAIL_USER`, `EMAIL_PASS` | server/.env | Gmail account + app password used to send codes |
| `JWT_SECRET` | server/.env | Signs login tokens and hashes OTPs |
| `TRUST_PROXY=1` | server/.env | **Set in production behind nginx**, otherwise all visitors share one IP for rate limiting |
| `PHONE_LOGIN_ENABLED`, `SMS_PROVIDER`, `MSG91_*` | server/.env | Phone login (off) |
| `VITE_PHONE_LOGIN` | frontend/.env.local | Show phone option on login page (off) |

### 4.9 Deployment checklist for this step
1. Dry run the migration, then apply it:
   ```bash
   cd server && node scripts/migrateUserAuthIndexes.js
   cd server && node scripts/migrateUserAuthIndexes.js --apply --delete-temp
   ```
   (Lower-cases emails, replaces the old email index with a sparse one, creates the phone index, deletes "temp" users with no orders.)
2. Set `TRUST_PROXY=1` on the server.
3. ~~Remove the Razorpay debug `console.log` lines~~ — done in Step 2.

### 4.10 Testing done
- 18 automated API checks against a throwaway local MongoDB: new email/phone signup, returning user, mixed-case email, wrong code, lockout after 5 attempts, single-use code, resend cooldown, signup token can't access API, profile can't change email, old endpoints return 404, migration on simulated old data.
- Manual browser test of the full flow; manual test by the team with a real Gmail address ✅.

### 4.11 Known issues / to do
- **Emails land in spam (Gmail) or are blocked (college/company mail servers).** Cause: sent from a personal Gmail account with no domain authentication. **Fix before launch:** send from a domain address (e.g. `no-reply@identee.in`) via Brevo (300/day free) or Resend (3,000/month free) with SPF + DKIM DNS records. Needs: a domain with DNS access + a Brevo/Resend account.
- Users without an email (future phone users) get no order emails until an "add & verify email" option is added to the Account page.
- Admin **Settings → Security** "change password" form is now obsolete and should be removed.
- Rate limiter is in-memory — fine for one server; needs Redis if the API is scaled to multiple instances.

---

## 5. Phase 1 — Step 2: Ordering security (DONE)

### 5.1 What was wrong (before)
| Severity | Problem |
|---|---|
| Critical | Any logged-in user could create a **paid** order without paying — the server trusted any `paymentResult.id` from the browser. |
| Critical | Order items, prices, tax, shipping, total and coupon were **saved exactly as the browser sent them**. |
| Critical | Any logged-in user could change any order's status, mark any order paid, assign delivery, generate invoices, and read anyone's order (name, address, email). |
| High | Customized T-shirts couldn't be checked out (missing imports crashed the price calculation) and the order had no link to the design. |
| High | One payment could be replayed into many orders; a failed order after payment left money taken with no order. Webhook was never mounted. |
| High | Stock: checked after the order was saved, not atomic (overselling); removing a cart item **added** stock that was never taken. |
| Medium | Coupons: expiry/start date, per-user reuse and "0 = unlimited" not enforced at payment; coupon code used as a raw regex. |
| Medium | Razorpay secret key printed to the server log; error responses leaked stack traces; broken Stripe route. |

### 5.2 How checkout works now
All amounts are computed on the server (`server/services/checkoutService.js`). The browser only says **what** is bought and **where** to ship.

```
Request body (all checkout endpoints):
{ shippingAddress, couponCode,
  buyNow?: { productId, items: [{ size, qty }] }      // Buy Now product
         | { customizationId, qty, size } }          // custom design
  (no buyNow = the user's cart)
```

| Method | Endpoint | What it does |
|---|---|---|
| POST | `/api/orders/quote` | Price preview (subtotal, CGST/SGST 2.5% each, shipping by state, coupon, total). No side effects. |
| POST | `/api/orders` | **Cash on Delivery** — prices on server, takes stock, creates order (`CREATED`, unpaid). Rejects any non-COD payment method. |
| POST | `/api/orders/razorpay` | **Online** — prices on server, checks stock, creates the Razorpay order and stores a `PendingCheckout` snapshot (items + prices). |
| POST | `/api/orders/razorpay/verify` | Checks the signature, then **asks Razorpay** that the payment exists, belongs to this order, is the right amount and is captured (captures it if only authorized). Then creates the order (`CONFIRMED`, paid). |
| POST | `/api/orders/razorpay/webhook` | Same completion if the browser closes after paying. Needs `RAZORPAY_WEBHOOK_SECRET`. |

Guarantees:
- **One order per payment** — unique index on `Order.razorpayOrderId`; verify and webhook can both run safely.
- **Stock is taken atomically** at order time, for all items or none. If an item sells out while the customer is paying, the **payment is refunded automatically** and the customer sees why.
- **Coupons** re-validated at payment: active dates, total usage limit (0 = unlimited), one use per user; `usedCount`/`usedBy` updated when the order is placed.
- Cart is emptied (server + screen) only after a cart order succeeds.

### 5.3 Who can do what
| Action | Allowed |
|---|---|
| Read an order | Owner, any admin, or the assigned delivery person (others get 404) |
| Change status, mark paid, mark delivered, assign delivery, generate invoice | Admin only |
| Accept / reject / complete / return a delivery | Only the delivery person **assigned** to that order |
| Assign delivery | Only to users flagged as delivery persons, and only before the order ships |

### 5.4 Order status rules
`CREATED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED` (forward jumps allowed, never backwards)
- `DELIVERED → RETURN_APPROVED → RETURN_COMPLETED`
- **New: `CANCELLED`** from CREATED / CONFIRMED / PACKED — puts the stock back. For an order paid online the admin sees a reminder to refund it from the Razorpay dashboard (automatic refunds on cancel are a later step).
- COD orders are marked paid automatically when delivered.

### 5.5 Files
**New:** `server/services/checkoutService.js` (pricing, coupon, stock), `server/services/orderPlacement.js` (creates orders once), `server/models/pendingCheckoutModel.js`
**Changed:** `server/controllers/orderControler.js`, `server/routes/orderRoutes.js`, `server/models/orderModel.js` (custom-design items, `CANCELLED`, `cancelledAt`, unique `razorpayOrderId`), `server/middleware/authMiddleware.js` (`admin`), `server/middleware/errorMiddleware.js`, `server/server.js` (webhook with raw body, debug logs removed), `server/controllers/productControler.js` (cart stock bugs), `server/utils/sendEmail.js` (custom items in order email); frontend `components/checkout/PaymentStep.jsx`, `CheckoutFlow.jsx`, `services/checkoutService.js`, `pages/admin/AdminOrdersPage.jsx` (Cancelled status)
**Removed:** Stripe payment route (was broken).

### 5.6 Testing done
- 32 automated API checks on a throwaway local MongoDB with Razorpay **test** keys: server pricing, tampered client prices ignored, expired/reused/regex coupons, negative qty, custom-design pricing, COD order + stock + coupon + cart, oversell rejected with no partial stock change, all access-control rules, invalid status changes, cancel returns stock, Razorpay order amount from server, forged signature, someone else's checkout, signature-valid-but-unpaid, bad webhook signature.
- Browser: Buy Now → address → summary → payment showed the server total and opened Razorpay test checkout.
- **Team test (8 Oct 2026) ✅:** real test-mode payment via **Netbanking → Success** → order `VF-2026-0021` saved as CONFIRMED / paid / payment captured, amount matched, exactly one order for the payment.

### 5.7 Before go-live
1. ~~Do a test payment~~ ✅ done. Note: Razorpay checkout no longer offers "pay with UPI ID" (UPI collect was discontinued) — in test mode use **Netbanking → any bank → Success**, or a test card from Razorpay's docs.
2. Razorpay Dashboard → Webhooks → add `https://<api-domain>/api/orders/razorpay/webhook` with events `payment.captured` and `order.paid`; put its secret in `RAZORPAY_WEBHOOK_SECRET`.
3. Switch to live keys (`rzp_live_…`) only on the production server.

### 5.8 Known gaps (later)
- Cancelling a paid order doesn't refund automatically yet (manual from Razorpay dashboard).
- Sellers (`isSeller`) can still see the full admin order list — decide what sellers should see.
- Order number prefix is still `VF-` (left over from another project) — change to an IDENTEE prefix if wanted.
- Custom-design orders still lack a print-ready file and a garment size picker → Customization step.

### 5.9 Address validation & autofill (added)
- **Before:** checkout form only checked required fields, 6-digit PIN and 10-digit phone (any digits); city accepted anything (a test order was saved with city `" a,.v ,.fv"`); the Account form only required city/state/PIN; the server only checked the state.
- **Rules** (checkout, Account page and server): door no. required; street 3–100 chars; city letters only; state must be one we ship to; PIN = 6 digits not starting with 0; phone = 10-digit Indian mobile (starts 6–9). PIN/phone inputs accept digits only.
- **📍 Use my current location** button (checkout + Account): browser GPS → OpenStreetMap Nominatim reverse lookup → fills street, landmark, city, state, PIN. The user still checks it and adds the door number. Needs HTTPS in production (browsers block location on plain HTTP, except localhost).
- **PIN autofill**: typing a 6-digit PIN fills city + state via the free India Post API (`api.postalpincode.in`) and shows "Chennai, Tamil Nadu" or "We don't deliver to … yet".
- **Server** rejects invalid addresses at checkout (`Shipping address: … Please update the address.`) and when saving new/edited addresses on the profile. Old saved addresses aren't re-validated on profile save (so they don't block other edits) but can't be used at checkout until fixed.
- Files: `frontend/src/utils/address.js`, `frontend/src/utils/usePincodeAutofill.js`, `frontend/src/components/AddressAutofill.jsx`, `components/checkout/AddressStep.jsx`, `pages/Account.jsx`, `server/utils/address.js`, `server/services/checkoutService.js`, `server/controllers/userControler.js`.
- Note: Nominatim is free but limited to ~1 request/second and asks for fair use; if traffic grows, switch to a paid geocoder (Google Maps / MapmyIndia) — only `addressFromCurrentLocation()` needs to change.

---

## 6. Phase 1 — Step 3: Categories (DONE — needs live data step)

### 6.1 Before
- "Category" was free text in three unrelated places: product `garmentStyle`, Category Banner name, Garment Type `category`. Typos and test values (`re`, `pants`, `Blacers`, duplicate `tshirt`) showed on the live home page.
- Home showed one uneven "bento" banner per garment style; navbar loaded **every product** to build its menu; the category page flashed the previous category while loading and showed each colour as a separate product; no search/filter/sort/pagination.
- Category banner images were stored on one developer's disk (`server/uploads`, not in git) — missing on every other machine.
- Garment-type admin endpoints had **no login check** (anyone could create/delete them).

### 6.2 Now
- **One `Category` list managed in Admin → Categories** (replaces "Category Banner" in the sidebar): name, web address (`/category/t-shirts`), description, **styles**, tile image (4:5), optional banner image (16:5), display order (▲▼), **Visible / Customizable / Coming soon** switches.
- **How products join a category:** a product belongs to the category whose *styles* include its Garment Style (case-insensitive). Customizer garment types match the same way. Adding a style instantly brings matching products in — no product edits needed.
- **Launch categories:** T-Shirts (Round Neck, V-Neck, Oversized, Full Sleeve) · Polos (Polo, Full Sleeve Polo) · Hoodies (Hoodie, Zip Hoodie) · Sweatshirts (Sweatshirt) · Kids' Wear (Kids T-Shirt, Kids Hoodie — shop only).
- **Home page:** category tiles (5 across desktop, 3 tablet, 2 phone) with **Design your own** (customizable categories) and **Shop**; branded garment-outline placeholder when no photo; "Coming soon" tiles greyed out.
- **Category page:** header with banner, description and "Design your own"; **style chips**; **size filter** (in stock only); **sort** (newest, popular, price ↑/↓); one card per product with colour count; OUT OF STOCK / % OFF badges; **Load more**; empty and error states; old links like `/category/Round%20Neck` redirect to `/category/t-shirts?style=Round Neck`.
- **Navbar Products menu** and the **customizer's Choose a product page** (with category chips) are built from the same list.
- **Admin product form:** Category and Garment Style dropdowns come from the categories (grouped).
- **Images on Cloudinary** (account `vy728xfe`): uploaded via the admin page, auto-resized and served as WebP; JPG/PNG/WebP only (SVG blocked), max 5 MB; replaced/removed images are deleted from Cloudinary.
- Garment-type create/edit/delete now **require an admin login**.

### 6.3 API
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/categories` | Public — active categories in order, with product counts |
| GET | `/api/categories/:slug` | Public — one category (also resolves an old style name) |
| GET | `/api/categories/:slug/products?style=&size=&sort=&page=&limit=` | Public |
| GET | `/api/categories/:slug/garments` | Public — garment types for "Design your own" |
| GET | `/api/categories/admin/all` | Admin |
| POST / PUT / DELETE | `/api/categories`, `/api/categories/:id` (multipart: `image`, `bannerImage`) | Admin |
| PUT | `/api/categories/reorder` `{ ids }` | Admin |

### 6.4 Files
**New:** `server/models/categoryModel.js`, `server/controllers/categoryController.js`, `server/routes/categoryRoutes.js`, `server/middleware/imageUpload.js`, `server/utils/imageStorage.js`, `server/scripts/migrateCategories.js`; frontend `components/CategoryTile.jsx`, `pages/admin/CategoriesPage.jsx`, `redux/slices/categorySlice.js`, `services/categoryService.js`, `utils/imageUrl.js`
**Changed:** `server/server.js`, `server/routes/garmentTypeRoutes.js`; frontend `pages/Home.jsx`, `pages/CategoryProductsPage.jsx` (rewritten), `pages/ChooseProductPage.jsx`, `components/Navbar.jsx`, `components/AdminSidebar.jsx`, `App.jsx`, `redux/store.js`, `pages/admin/ProductUploadPage.jsx`, `services/garmentTypeService.js`
**Config:** `CLOUDINARY_NAME`, `CLOUDINARY_APIKEY`, `CLOUDINARY_SECRETKEY` in `server/.env` (IDENTEE's own account). Without them images fall back to `server/uploads/` (dev only).

### 6.5 Testing done
- 34 automated API checks on a throwaway DB incl. a real Cloudinary upload + delete: admin-only changes, SVG rejected, slugs, duplicate names, ordering, hidden categories, product grouping by colour, messy style text, style/size filters, sorting, pagination, no leakage of other styles, old-URL redirect, customizer garments, garment-type auth.
- Browser: home tiles, category page (redirect, chips, badges), admin Categories list + edit form.

### 6.6 To go live
1. Run on the real database (dry run first — already reviewed: 6 Round Neck → T-Shirts, 2 Polo → Polos, 2 Sweatshirt → Sweatshirts; Blacers/Jump Suits not shown):
   ```bash
   cd server && node scripts/migrateCategories.js --apply
   ```
2. Upload a tile photo per category in **Admin → Categories**.
3. ~~Product photos still in `server/uploads`~~ — all uploads now go to Cloudinary (section 6b); old files still need migrating.

---

## 6b. All uploads moved to Cloudinary (DONE — old files need migrating)

### Before
Every upload (products, garment photos, art, banners, videos, profile pictures, review photos, customer designs, logos) was written to `server/uploads/` on whichever computer ran the backend. That folder is not in git, so images were missing on every other machine and would be lost on redeploy. Images were served at full size; SVG uploads were accepted (can carry scripts); old files were often left behind.

### Now
- **One upload pipeline** (`server/multer/multer.js`): files are held in memory, stored by `server/utils/imageStorage.js` and the **Cloudinary URL** is saved in MongoDB. Same middleware names as before, so routes didn't change. Without Cloudinary keys it falls back to `server/uploads/` (dev only).
- **Cloudinary folders** (account `vy728xfe`, all under `identee/`): `products`, `size-charts`, `garments`, `art-categories`, `art-designs`, `banners/images`, `banners/videos`, `categories`, `profiles`, `reviews`, `designs`, `settings`.
- **Types:** JPG, PNG, WebP, AVIF, MP4/WebM/MOV videos, PDF size charts (stored as raw files). **SVG blocked.** Limits: images 10 MB (Cloudinary free plan), videos 100 MB.
- **Clean-up:** replacing or deleting a profile picture, banner, video, garment photo, art category/design or category image also **deletes the old file from Cloudinary**.
- **Bulk ZIP uploads** (products, art designs) upload each image to Cloudinary too.
- **Frontend:** all 24 places that built image addresses now use `utils/imageUrl.js`, which serves Cloudinary images resized + WebP and still understands old `uploads/...` paths. Review photos now display correctly (they used a broken relative path before).
- Removed the separate local-disk upload setups in the art, garment-photo and customizer routes (`middleware/uploadMiddleware.js` deleted).

### Existing files (migration)
`server/scripts/migrateUploadsToCloudinary.js` scans every collection for old `uploads/...` paths, uploads the file if it exists on this machine and swaps in the Cloudinary URL (dry run by default, `--apply` to do it; local files are never deleted).
Dry run on the real database (8 Oct): **154 references, only 2 files exist on this machine** — the rest (products 39, garments 44, banners 11, designs 9, art 7, profiles 3, settings 2, review 1, video 1) are on a teammate's computer.
To finish: copy the teammate's `server/uploads/` folder into `server/uploads/` here, then:
```bash
cd server && node scripts/migrateUploadsToCloudinary.js          # check "Missing here" is 0
cd server && node scripts/migrateUploadsToCloudinary.js --apply
```
Anything still missing must be re-uploaded in the admin panel.

### Testing done
12 end-to-end checks on a throwaway DB with real Cloudinary uploads: customer design, SVG rejected, art category (upload + delete removes file), garment photo (upload, replace deletes old, delete colour deletes photos), profile picture (upload, replace, remove), settings logo, nothing written to `server/uploads`. Test files were removed from Cloudinary afterwards. Frontend builds; lint has fewer problems than before.

---

## 6c. Customizer — Part A: real print positions (DONE on branch `feature-customizer-part-a`)

### Before
Element positions were % of the whole editor canvas; one hard-coded dashed box (same on every side) that constrained nothing; the admin's print area (Garment Photos) was never used; no real-world size anywhere; Google fonts in the font list were never loaded; "arc" text was a fake skew and the effect was dropped on save; design save / image upload needed no login; a refresh lost the design.

### Now
- **Print positions from the product spec** (`server/data/printPositions.js`, see `docs/PRODUCT_SPEC.md`): Centre Front, Left Chest, Right Chest (front) · Full Back · Left/Right Sleeve — with real cm sizes per size range (XS–S / M–XL / 2XL–3XL). Served at `GET /api/customizations/print-positions`.
- **Editor:** a "PRINT POSITION" chip row per side (e.g. *Centre Front · 28 × 32 cm*) + size-range selector; dashed box for each position, the active one labelled; new text/images go into the active position; elements are dragged/resized **inside their box**; EDIT panel can move an element to another position on the same side.
- **Where the boxes sit:** the main box per side (Centre Front, Full Back, sleeves) uses the admin's print area from **Admin → Garment Photos** when set (else a default), kept to the real cm proportions; chest boxes are placed and sized from the same cm scale (`frontend/src/utils/printLayout.js`). The garment photo now fills the 4:5 stage exactly like the admin page, so both line up.
- **Layout v2 saved designs:** each element stores its `position`, and x/y/width/height/fontSize as % of that print box — size-independent, so print files (Part D) can render any garment size from the same design. Older saves are `layoutVersion: 1`.
- **Text:** fonts load from Google Fonts; **Arc Up / Arc Down** drawn with real curved SVG text; effect and note are saved.
- **Security:** saving a design and uploading artwork require login (the editor sends you to login and brings you back); server validates positions, image sources (only IDENTEE Cloudinary / uploads), colours and sizes; only the owner or an admin can open a saved design.
- **Autosave:** the design is kept on the device per garment + colour, so a refresh or the login detour never loses it.
- Removed the unused, broken inch-based print-zone utils.

### Testing
15 server checks on a throwaway DB (positions + cm sizes, login required, layout v2 saved with effect, unknown position / external image / unknown garment rejected, side forced from position, owner/admin-only access, checkout pricing still works, someone else's design can't be bought). Browser: chips + size selector, fonts render, curved text added inside the Centre Front box, autosave.

### Still to do (next parts)
- **Admin calibration:** check each garment's print boxes on real blank photos (Admin → Garment Photos print area). The current test photos (tshirt/white) are not blank garments.
- **Part B:** touch/mobile, rotate handle, server drafts + reopen by link. **Part C:** size × quantity picker, cart. **Part D:** 300-DPI print files + mockup, admin download.

---

## 6d. Admin redesign — Part 1: new menu + Home (DONE on branch `feature-admin-redesign`)

**Before:** a 30-link sidebar in 7 technical groups ("Catalogue", "Commerce", "Logistics"…), 3 of them broken (Banners, Enquiries, Delivery), and a dashboard of charts with no guidance on what to do next.

**Now (as in the admin prototype):**

| Piece | What it does | Where |
|---|---|---|
| Menu | 8 plain sections — Home, Orders, Customizable, Ready-made, Design library, Storefront, Customers, Settings. Clicking a section opens its pages; the open section follows the page. Red badge = new orders. Folds to icons on small screens. Broken links removed; old URLs still work. | `frontend/src/utils/adminMenu.js`, `components/AdminSidebar.jsx` |
| Top bar | "Section › Page" so you always know where you are, ← Back, View website | `components/AdminTopbar.jsx` |
| Home | Greeting; **Set up your store** checklist (store details, Oversized Tee colours/photos/price, shipping rates, payments live/test, ready-made product — optional); **Needs your attention** (new orders to confirm, custom designs to print, reviews to approve, low stock ≤ 3); **Today** numbers; quick actions. The checklist card hides itself when all required steps are done. | `pages/admin/AdminHome.jsx` |
| Server | `GET /api/admin/home` (admin only) works all of this out from real data; `GET /api/admin/badges` for the menu badge. Payment step only reports test/live mode — never the key. | `server/controllers/adminHomeController.js`, `server/routes/adminRoutes.js` |
| Old dashboard | Kept at `/admin/reports` ("See sales report" on Home). | `App.jsx` |

**Next:** Oversized Tee setup wizard (fabrics, sizes, colours, photos, 15-area print gallery) to replace "Garment Types" + "Garment Photos" under Customizable.

## 6e. Admin redesign — Part 2: garment set-up wizard (DONE on branch `feature-garment-wizard`)

**Before:** setting up a customizable garment meant two separate pages (Garment Types for name/price/colours, Garment Photos for photos + one draggable box per colour per view), and the customizer always offered the same 6 print positions for every garment. The garment-photo upload/edit/delete endpoints had **no login check**.

**Now (as in the admin prototype):** Admin → **Customizable** lists every garment (Live / Draft, colours, photos, price) with **+ Add garment** (new ones start as drafts). Each garment opens a 6-step wizard at `/admin/customizable/<key>?step=N`:

| Step | What the admin does | Saved to |
|---|---|---|
| 1 Basics | Name, fit (oversized/regular), fabrics (240 GSM Cotton, French Terry — from the product sheet), starting price, which store category it appears in, description | `garmenttypes` (new fields: `fit`, `fabrics`, `description`) |
| 2 Sizes | Turn XS–3XL on/off; size chart (inches) pre-filled from the product sheet, editable | `sizes`, `sizeChart` |
| 3 Colours | The 12 product-sheet colours in one click, or add your own | `colors` |
| 4 Photos | Grid colour × front/back/left/right; click a box to upload/replace (saves straight to Cloudinary) | `garmentcolorimages` |
| 5 Print areas | All **15** areas from the print guide, grouped by side. Click one to see it on the photo; give it a size (cm, M–XL; XS–S −4, 2XL–3XL +4) and turn it on. Drag the blue print zone (or its corner) to line it up — saved for every colour at once | `printAreas` (+ `printArea` on each colour doc) |
| 6 Publish | Checklist with Edit links; Publish is blocked until fabrics, price, size chart, colours, all photos and ≥1 area are done; Unpublish hides it again | `isActive` |

**Customer side:** `GET /api/customizations/print-positions?garment=<key>` now returns that garment's offered areas, and the customizer shows only those (e.g. a Full Front chip appears once offered). Saving a design rejects areas the garment doesn't offer. Positions of the 9 new areas are estimates (`place` in `server/data/printPositions.js`) until the print team sends start distances.

**Security fix:** `/api/garment-images` upload, print-area and delete now require an admin login.

**Files:** `server/data/printPositions.js` (15-area catalog), `models/garmentTypeModel.js`, `controllers/garmentTypeController.js` (`updateGarmentType`, `adminGetGarmentTypes`, `adminGetGarmentType`), `controllers/garmentColorImageController.js` (`updatePrintAreaAllColours`), `controllers/customizationController.js`; frontend `pages/admin/CustomizableListPage.jsx`, `pages/admin/GarmentSetupWizard.jsx`, `pages/admin/garmentSetup/*`, `utils/productSheet.js`, `utils/printLayout.js`.

**Tested** on a local copy of the data (ports 5099/5174): every step saved, Full Front offered → appears in the customizer, zone drag saved for 12 colours, unauthenticated writes → 401, drafts hidden from the public list.

## 6f. Size-accurate print boxes (DONE on branch `feature-size-accurate-prints`)

**Before:** the customizer showed one print box size for everyone (a "Sizes M–XL" range picker only changed the cm label), so a design looked the same on an XS and a 3XL.

**Now:** the customer picks **their size** (XS–3XL, only the sizes the garment comes in; remembered in the browser). The preview is drawn to scale for that size:

- **Print size** comes from the print guide for the size range (e.g. Centre Front XS–S 24×28, M–XL 28×32, 2XL–3XL 32×36 cm).
- **Photo scale** comes from the garment's **photo ruler** (Admin → Customizable → wizard step 5: two red lines on the front photo — shoulder top and hem) and the size chart length: `cm-per-% = (hem − top) ÷ 0.8 ÷ (length″ × 2.54)`. Example Oversized Tee: M (30″) Centre Front = 29.40 % of the photo width, XS (28″, 24 cm print) = 27.00 %, 3XL (34″, 32 cm print) = 29.64 %. Within one range a longer size shows the same print a little smaller — as in real life.
- Garments without a ruler fall back to the old scale (the print zone).
- The customizer shows "M: chest 46″ · length 30″ · preview to scale".
- The chosen size is saved on the design (`customizations.size`, validated against the garment's sizes) and passed to Buy Now; checkout uses the size picked there, else the design's size, and rejects sizes the garment doesn't come in.

**To switch it on for the real Oversized Tee:** Admin → Customizable → Oversized Tee → step 5 → **Save photo ruler** (the default lines already match the generated photos: 23.6 % / 87.6 %).

**Files:** `frontend/src/utils/printLayout.js` (`rulerPerCm`, `resolvePrintBoxes(..., { group, perCm })`), `pages/CustomizePage.jsx`, `pages/admin/garmentSetup/PrintAreasStep.jsx`; server `models/garmentTypeModel.js` (`photoRuler`), `models/customizationModel.js` (`size`), `controllers/garmentTypeController.js`, `controllers/customizationController.js`, `services/checkoutService.js`.

**Tested** on a local copy: ruler saved; box widths per size match the formula in both the wizard and the customizer; design saved with size 3XL; quote line size = 3XL when "Custom", L when L chosen; 5XL / 9XL rejected.

## 6g. Admin fixes after a full page check (DONE on branch `fix-admin-pages`)

Every admin page was opened and checked. Fixed:

| Problem | Fix |
|---|---|
| **Invoices, Shipping rates, Reviews crashed** (blank page) — they called a `useTheme()` helper that doesn't exist | Use the shared `THEME` palette directly |
| Settings → **Security** (change password) — useless, login is email-code only | Removed |
| Settings → **Appearance** (light/dark) — never wired up | Removed |
| Settings opened on Profile | Opens on **Store Branding** (where Home's "Store details" step points) |
| Menu showed **Payments** and **Sellers**, which are empty placeholders | Hidden from the menu (URLs still exist) until built |
| Add a product **forced shipping weight/size/pickup address** | Optional (model + form); only the unused FedEx code needs them and now says so clearly |

Still open (bigger, later): Payments + Sellers pages, ready-made product pages redesign (and sellers can edit other sellers' products), print-file download in Orders (customizer Part D).

## 6h. Home page: two ways to shop — Customizable and Ready-made (DONE on branch `feature-home-two-sections`)

**Before:** one "Shop by Category" grid; each tile had both "Design your own" and "Shop" buttons, mixing the two ways to buy.

**Now:** the home page asks **"How would you like to shop?"** with two big cards:

| Card | Opens | What that page shows |
|---|---|---|
| **Customizable — Design your own** ("1 garment · from ₹899", Oversized Tee photo) | `/customizable` | Every live, sellable customizable garment (Admin → Customizable), **grouped by store category** (T-Shirts → Oversized Tee; later Polos → Polo …). Each card: photo, colour dots, price, sizes, fabrics, **Start designing →**; plus a "How it works" panel. `?category=<slug>` shows one category. |
| **Ready-made — Shop ready-made** ("6 categories · 11 products") | `/ready-made` | The categories the admin added (Admin → Storefront → Categories), each with its product count and **Shop now**. |

Each page links to the other ("Shop ready-made instead →"). The old `/customize/choose-product` page was replaced by `/customizable` (old links redirect, `?category=` kept). Only garments with a price and at least one colour photo show.

Files: `components/ShopChoices.jsx`, `components/ShopPageHeader.jsx`, `components/CustomizableGarments.jsx`, `components/CategoryTile.jsx`, `pages/CustomizablePage.jsx`, `pages/ReadyMadePage.jsx`, `utils/garments.js`, `pages/Home.jsx`, `App.jsx`.

**Data clean-up (same day, user's request):** deleted the 5 old test garments (jump-suits, tshirt, round-neck, blacers, sweatshirt), their 9 photo docs, 8 Cloudinary test photos and 17 test designs on them (none in orders/carts). Backup: `identee-private-assets/backup-2026-10-09-removed-garments/`.

## 7. Phase 1 — remaining steps (audit findings)

### Step 3: Customization
- Design is lost on page reload (no draft saving).
- No print-ready output: only % positions are saved — no high-res file per side, no real-world size, no preview image.
- Garment size hard-coded to "Custom"; text effect not saved; no touch support on mobile; design can go outside the print area.
- Uploads: no auth, SVG allowed (XSS risk), extension-only type check.

### Step 4: Products & categories
- No real Category model (three free-text strings that drift apart).
- Navbar search does nothing; no filter/sort UI; no pagination; same product shown once per colour.
- Kids' sizes hidden on product page; pending/rejected reviews leak publicly; ~~garment-type admin routes unauthenticated~~ (fixed); sellers can edit each other's products.

---

## 8. Agreed ideas / proposals (not built yet)

### 8.1 After login
Current behaviour: users return to the page they came from (e.g. checkout); otherwise Home; admins → `/admin/dashboard`.
Proposed:
- **Welcome step (new users only, ~30 s, skippable):** "What are you here for?" (design my own / buy ready-made / team or event order) + usual size → buttons "Start designing" / "Browse products".
- **Personalised strip on Home (logged-in):** "Hi <name>", latest order status + Track, "Continue your design" (needs draft saving from Step 3), later "Picked for you".
- Later: "My Designs" gallery, team-order shortcut, profile-completion nudge.

### 8.2 Home-page categories (Step 4)
Current data is test-quality: category banners include `re`, `pants`, `tshirt` (duplicate of Round Neck), `Blacers` (typo); only Round Neck has colours; the customizer supports 6 garments (Round Neck, Oversized, V-Neck, Polo, Hoodie, Crew Sweatshirt).
Proposed launch categories (DTF-friendly):
- **Phase 1:** T-Shirts (round, V-neck, oversized, full sleeve), Polo T-Shirts, Hoodies (pullover, zip), Sweatshirts — plus **Jackets** tile marked "Coming soon".
- **Phase 2:** Jackets, Kids' T-Shirts, Tank Tops, Sports Jerseys, Uniform Shirts.
- **Phase 3:** Caps, Tote Bags, Aprons.
- Hide Blazers and Jump Suits.
Plan: real `Category` model (name, image, order, active, customizable) managed from admin; link garment types/products to it; clean test data (list shown to the team before deleting); category tiles on Home with "Design your own" / "Shop ready-made".

### 8.3 Differentiators discussed (later phases)
Group order links for schools/companies, brand-kit lock + approval for corporate clients, QR/NFC "smart garments", school uniform programmes, print-aware AI design checks, price/print-method comparison, bulk size predictor, WhatsApp ordering, photo of the real print before dispatch, AR try-on.

### 8.4 Small UI clean-ups noted
- Payment step shows separate "UPI" and "Card" options that both open the same Razorpay popup → replace with one "Pay online" option.
- Remove the obsolete admin **Settings → Security → change password** form.
