# Shop your IDENTEE: easy "Add a tee" plan (admin side)

**Written:** 25 Nov 2026. This is a plan only. Nothing is built yet.

**Goal:** an admin with no design or coding skills can put a new tee in the shop in about 2 minutes. They put an existing tee on a new style in one click, and add a whole new style without a developer.

**For customers:** the shop looks and works the same as today.

---

## 1. What the admin does today, and what goes wrong

| Job | Today | Problem |
|---|---|---|
| Add one tee | Studio → design by hand → take pictures → fill the publish form | Many steps, and the publish form has about 15 boxes |
| Add many tees (a collection) | Write a list file, then "Add tees from a list" | A list file is hard for a non-technical admin |
| Same tee in Oversized + Round Neck | Make each one separately | It is joined only by its name, so a typo breaks it |
| Add a new style (Polo) | A developer changes about 10 files | It can't be done without coding |
| Add a product | Upload finished photos for every colour | The admin must make the photos themselves |

---

## 2. What the admin will have (4 simple screens)

All 4 are in **Admin → Shop your IDENTEE → Manage the shop**.

| Screen | Used for | How often |
|---|---|---|
| **A. Add a tee** | One new tee: pictures in, styles ticked, done | Every new design |
| **B. Add many tees** | A whole collection at once, by dropping pictures in | New collections |
| **C. Check and show** | Look at the new tees big, then put them in the shop | After A or B |
| **D. Styles** | Turn a style on for the shop and set its rules | Once per new style |

Plus small things on the **tee list** that already exists: style chips, "+ Add to a style", edit, hide and delete.

**Add a product stays** for shelf stock and combos only (see section 8).

---

## 3. Screen A: Add a tee (step by step, as the admin sees it)

One page, top to bottom. Every box already has a good answer filled in, so the admin only changes what they want.

**Step 1: Collection and name**
- Pick a collection from a list (Ayyappa, GTA, SCENE…) or press **+ New collection**.
- Type the tee's name, e.g. "Tiger Saranam".
- The full name "Ayyappa · Tiger Saranam" is made by the website.

**Step 2: Pictures**
- Two boxes: **Front picture** and **Back picture**. Either one may be left empty.
- Drag in a picture or tap to pick one. It is uploaded full size and never shrunk.
- Checks happen right away:
  - **Too small to print sharp?** A yellow warning, using the same rule as today's small-photo warning.
  - **White or plain background on a dark tee?** A **Remove background** button (free, runs in the browser).

**Step 3: Where it prints**

You tap a picture of the spot, not a word.

| Front choices | Back choices |
|---|---|
| Small logo on the chest (left) | Big on the back (Full Back) |
| Centre of the chest | Top of the back (under the collar) |
| Big on the front (Full Front) | Nothing on the back |
| Nothing on the front | |

- The collection can have a default. For example, GTA = logo locked on the front and the picture on the back, as today.
- **Fine-tune in the Studio** (optional link): opens the tee in the Studio to move or resize by hand. Most tees won't need it.

**Step 4: Styles**
- Ticks for every style that's switched on in Screen D: ☑ Oversized ☑ Round Neck Men's ☑ Round Neck Women's ☐ Polo.
- One tee is made for each tick.

**Step 5: Colours**
- Each ticked style shows its shop colours, already ticked (from Screen D).
- Untick any colour you don't want for this tee.
- A live preview at the top shows the tee in the colour you tap, front and back.

**Step 6: Price and sizes**
- Filled in from each style: ₹699 Oversized, ₹499 Round Neck, the old price struck through, and all sizes XS–5XL.
- Change only if this tee needs a special price.

**Step 7: More details** (folded away, all optional)
- Description (a ready line is written for you; edit if you like), fabric, wash care, "show on the home page".

**Step 8: Press "Make 3 tees"**
- A progress line: "Making Oversized… Round Neck Men's… done".
- The pictures are made for every colour on the hanger photos. This is free, with no AI.
- The tees are saved as **drafts** and go to Screen C.

**Time for the admin:** pick, type, drop 2 pictures, tap 2 spots, press. About 2 minutes.

---

## 4. Screen B: Add many tees (a whole collection)

This replaces the list file.

1. Pick the collection, and the styles + print spots for **all** of them (once).
2. **Drop all the pictures in at once**, e.g. 40 files.
3. The website pairs them into tees:
   - Files named `tiger-front.png` + `tiger-back.png` become one tee called "Tiger".
   - Pictures it can't pair are shown in a row, and the admin drags them onto a tee.
4. A table shows one row per tee: small front | small back | name (editable) | ✓ ready / ⚠ small picture.
5. Press **Make 40 tees**. It shows a progress bar, a **Stop** button and makes one tee at a time. If stopped, pressing again makes only what is missing.
6. Everything goes to Screen C as drafts.

---

## 5. Screen C: Check and show

- A grid of the new drafts. Click one to see it big, front and back (the TeeViewer, which already exists).
- On each tee: ✓ **Looks good**, ✎ **Fix** (opens Screen A for that tee) or 🗑 **Throw away**.
- At the top: **Show all good ones in the shop**.
- Nothing reaches customers until this button is pressed.

---

## 6. Screen D: Styles (once per new style)

A list of the garments, each with a **Sell in Shop your IDENTEE** switch and its rules:

| Setting | Example (Oversized) | Example (Round Neck) |
|---|---|---|
| Sell in the shop | on | on |
| Name in the shop | Oversized | Round Neck |
| Tab order | 1 | 2 |
| Who it's for | Unisex | Men's + Women's |
| Shop colours | dark ones + White | the same, no Royal Blue |
| Tee page shows | Front + back only | All 4 sides |

- On the first day these are filled in to match today exactly. Nothing changes on screen.
- **Adding a new style:**
  1. Set up the garment in Garment Setup as today (2 photos of the white garment on a hanger, front and back; sizes; size chart; print areas; price).
  2. Turn on "Sell in the shop" here.
  3. Use "+ Add to a style" or Screen B to put existing tees on it.

  No developer is needed.

---

## 7. The tee list (Manage the shop, already there) gets:

- **Style chips** on each tee: `Oversized ✓  Round Neck ✓  Polo (draft)  + Add to a style`.
- **+ Add to a style**: puts this tee on another style using the same pictures and spots. Its pictures are made, and it waits as a draft.
- **+ Add a style to all**: the same for a whole collection.
- **Edit**: opens Screen A filled in. Saving changes all its styles together, unless you untick one.
- **Hide** and **delete for good**: same as today.

---

## 8. Add a product (the old screen)

- **Kept**, but renamed **"Add a stock item"** and moved lower in the menu.
- Used only for things with real stock per size, combos, or items not printed by IDENTEE.
- Old products and orders are untouched.

---

## 9. What happens behind the screens (for the developer)

| Part | Change |
|---|---|
| Style rules | Move from code (`shopRules.js` `LIGHT_COLOURS` / `HIDDEN_IN_STYLE`, `shopTwins.js` `STYLE_ORDER`, `frontBackOnly` in `ReadyDesignPage.jsx`) to a new `shop` section on each garment (Screen D) |
| One design, many styles | A `family` id on each shop tee joins its styles. The shop and the tee page use it instead of name matching (`versionsOf`, `twinKeys`) |
| Making a tee | One server step: "make tee for style X" = place the pictures in that garment's print areas per size, then the pictures on the hanger photo (`MockupCamera` / `hangerPhoto.js`), then `syncStudioProduct` as today. It reuses what "Add tees from a list" does now (`shopTeeMaker.js`, `trendTee.js`) |
| Print spots | Screen A's spot choices map to print area keys (`left-chest`, `centre-front`, `full-front`, `full-back`, `back-neck`). Each is fitted to the size, so the size-accurate rule stays |
| Old tees | A one-time script gives the live tees a family (by today's name matching). It prints the list for the owner to check first, keeps an undo file, and is run on the laptop copy first |
| Customer side | No change: shop pages, Customize, cart, checkout, print files |

---

## 10. Build order and releases

| # | What | What the admin sees when it's live | Time |
|---|---|---|---|
| 1 | Screen D (style rules into the admin), filled in the same as today | A new Styles screen. The shop is unchanged | 1 session |
| 2 | Families for the old tees (after you check the list) | Nothing changes | ½ session |
| 3 | Screen A + Screen C | **Add a tee** works | 1½ sessions |
| 4 | Screen B + the tee-list chips / Add to a style | Collections in one go, and new styles on old tees | 1 session |
| 5 | Rename Add a product → Add a stock item | Menu tidy | small |

**About 4 sessions in all.** It's built on a new branch (`feature/shop-simple`) and tested on the laptop copy:
- A pretend "Test Polo" style is added through the admin only, to prove no code is needed. The test is recorded, with the browser pane showing.
- Every screen is checked at phone (375, 360) and laptop sizes.
- Each release gets the Linux checklist and goes live by your hand.

---

## 11. Questions before building

1. **Front spot choices:** are the 4 front choices and 3 back choices in Step 3 enough, or do you want more (sleeve, lower corner…)?
2. **Bulk file names:** is `name-front` / `name-back` OK for pairing in Screen B?
3. **First new style** for the test: Polo, Hoodie or another?
4. **Model photos** (a person wearing the tee, AI, costs money): leave them out of Add a tee, or add an optional tick?

## 12. What was built (25 Nov 2026, branch feature/shop-simple — not committed, not live)

Answers to section 11: front places = small chest logo / centre chest / big front / none; back = big back / under the
collar / none; Add many pairs files by `name-front` / `name-back`; no AI model photos.

| Part | Where |
|---|---|
| Styles settings (one place for style name, Men/Women/Unisex, order, colours, sides, fit words) | `server/utils/shopStyles.js`, `GarmentType.shop`, `server/controllers/shopStylesController.js`, `GET/PUT /api/studio/shop/styles`; shop, collection and twin pages read it (`shopController`, `categoryController`, `readyDesignController`, `shopTwins`) |
| Same shop on day one | `server/tests/shopStyles.test.mjs` proves the new rules equal the old ones, in memory and as the DB query |
| Families (one design's tees in every style) | `ReadyDesign.family`, `server/utils/shopFamily.js`; new Studio tees get one; older tees: `server/scripts/fillShopFamilies.mjs` (look / `--write undo.json` / `--undo undo.json`); until then the same name still joins them |
| A Add a tee | `frontend/src/pages/admin/shop/ShopAddPage.jsx` (`/admin/shop-add`) |
| B Add many tees | `ShopAddManyPage.jsx` (`/admin/shop-add-many`); pairing in `shopAddUtils.js` `pairPictures` |
| C Check and show | `ShopDraftsPage.jsx` (`/admin/shop-drafts`) |
| D Styles | `ShopStylesPage.jsx` (`/admin/shop-styles`) |
| + Add to a style | Manage the shop: "+ style" on each tee and "+ Add to a style…" for ticked tees (`AddToStyle.jsx`); copies the front and back pictures and their places; other prints are listed as "press Fix" |
| Shared maker | `useTeeMaker.jsx` (upload once full size → place → pictures per colour → save as draft; skips tees already made), `frontend/src/studio/shopTeeBuilder.js` |
| Add a product | menu now "Add a stock item" (same page) |

Still to do: test it all on the laptop copy (with the owner watching), then run the family script on the live
database (owner's yes), then a release.

### Laptop test (25 Nov 2026, owner watching)
Old code (main b4204ea) and new code asked the same 120 shop questions on the same laptop database: all the same
(after keeping the old A–Z order for styles never set up). Then, in the browser: Kids Round Neck made live in Create
your IDENTEE → switched on in Styles as "Kids Tee" → Add a tee (4 styles) → Check and show (look big, Throw away, Show)
→ + style in Manage the shop → Add many tees (pairing, loose tray, rename, Make all) → customer collection tabs and
tee page Style row. Phone 375/360 checked. Fixed during the test: a garment without size M (kids) failed; a tee
tried again got a new family; the preview pictures were broken; Make vanished after a failure; "testshop" in the
trail; Kids guessed as "Round Neck"; big view colour buttons cut off; list name squeezed on phones; colour dots
past the card edge in Manage the shop.
Open question for the owner: a "Kids" choice in "Who it's for" (a kids tee now says "Unisex · made to fit men and women").
