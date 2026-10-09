# IDENTEE Design Studio — Plan (draft for review, 9 Oct 2026)

The "Start designing" page (`/customize/:garment?color=`) is where customers create and buy. This plan covers
what it must do, what's wrong today, and the order to build it in. **Nothing here is built yet** — decisions
marked ❓ need the user/client.

---

## 1. Goal (one sentence)

A customer on a **phone or computer** can design an Oversized Tee in a few minutes, see it **true to size**,
order **any mix of sizes and quantities**, and the print team receives a **print-ready file** for every
print position — with no back-and-forth.

## 2. Who uses it

| User | Needs |
|---|---|
| Customer on a phone (most traffic) | Big touch targets, drag/pinch/rotate with fingers, simple steps |
| Customer on a computer | Precise placement, keyboard shortcuts, more tools visible |
| Bulk buyer (team / event, MOQ 3 from the product sheet) | One design, many sizes, quantities per size |
| Print team / admin | Exact print size in cm per position and size, 300-DPI files, a mockup to check against |

## 3. Where we are today (audit, 9 Oct)

Works: garment + 12 colours, 4 views (front/back/left/right photos), 6 print positions with real cm sizes,
**size-accurate preview** (size picker + photo ruler), text (26 fonts, colour, bold/italic/underline, align,
arc up/down), image upload (login required, Cloudinary), art library with prices, layers list, undo/redo,
autosave in the browser, server validation of saved designs, checkout with server-side price.

Problems:

| Area | Problem |
|---|---|
| Phones | Mouse-only events → **cannot move/resize anything by touch**; tiny 14 px handle; top bar wraps to 3 rows; tools stack below the canvas |
| Editing | One resize corner, no rotate handle (±15° buttons only), no aspect lock for images, no snapping / centre guides, text size/align/curve can't be changed after placing |
| Save | "Save" = "Order" (both go to checkout); no drafts, no "My designs", can't reopen a design; Share copies only the garment link |
| Quality | No check that an uploaded photo is sharp enough for its printed size; no background removal; upload limit text wrong (says 20 MB, real 10 MB; server also accepts videos/PDFs) |
| 3D | Can't be rotated (pointer events blocked), redraws ~30×/s, ignores curved text — slows the page |
| Ordering | One size per order, qty only on checkout, **custom designs can't go in the cart**, no design preview at checkout / in orders |
| Production | Admin can't see the design or download print files |
| Code | One 3,137-line file, inline styles, dead code, 7 lint errors; art-library add/delete routes have **no login check** |

## 4. The customer journey we want

```
Customizable page ─► Studio
  1. Garment & colour      (already chosen from the card; can change in the studio)
  2. Your size             (sets the true-to-size preview; can change any time)
  3. Design                front · back · left sleeve · right sleeve
       + Text  + Upload  + Art library  (+ Templates, later)
       drag / pinch / rotate, snap to centre, quality warnings
  4. Review                all sides as mockups, print sizes, quality check, price
  5. Sizes & quantity      e.g.  S×2  M×3  L×1   (price per piece × total)
  6. Add to cart / Buy now ─► checkout (existing)
Saved automatically as a draft (account) → "My designs" → reopen / duplicate / share link
```

### Screen layout

**Phone (≤ 768 px)** — canvas first, tools as a bottom bar:

```
┌──────────────────────────────┐
│ ←  Oversized Tee · Black  ⋯  │  top: back, name, menu (save, share, help)
│ [Front][Back][L][R]   Size M▾│  side tabs + size
│                              │
│        ┌──────────┐          │
│        │  canvas  │          │  pinch-zoom the garment, drag elements
│        └──────────┘          │
│  Centre Front · 28 × 32 cm   │  print position chip (tap to change)
│ ─────────────────────────────│
│ [Text] [Upload] [Art] [Layers]│  bottom tool bar → opens a bottom sheet
│ ₹899 · Next: Review →        │  price + main button
└──────────────────────────────┘
```

Selected element → a small floating bar above it: **Edit · Duplicate · Front/Back · Delete**, plus on-canvas
handles: corner (resize, keeps proportions), top circle (rotate).

**Computer** — three columns: tools left · canvas centre · side thumbnails + selected-element settings +
layers right; price and **Review →** fixed in the top bar.

## 5. Features, by phase

Priorities: **P1** = needed to launch, **P2** = soon after, **P3** = later / paid services.

### Phase B — Editor rebuild (the heart) · P1
| # | Feature |
|---|---|
| B1 | Split the studio into small files (canvas, tools, panels, state store) |
| B2 | **Touch + mouse**: drag, pinch-to-resize, two-finger rotate, on-canvas resize (aspect-locked) and rotate handles |
| B3 | Snap to print-box centre lines and edges, show guides; keep elements inside the print area (warn when outside) |
| B4 | Text: edit everything after placing (text, font, size, colour, align, curve amount slider, letter spacing, outline) |
| B5 | Image upload: JPG/PNG/WebP only, real size limit shown, **print-quality meter** (effective DPI at the chosen size: good ≥ 150 · ok 100–150 · low < 100) |
| B6 | Keyboard: Delete, arrows (nudge), Ctrl/Cmd+Z / Y, Ctrl+D duplicate |
| B7 | Undo/redo capped (50 steps), reset when garment changes |
| B8 | Phone layout (bottom tool bar + bottom sheets), desktop 3-column layout |
| B9 | Remove broken 3D view for now (keep the flat 4-side views); fix art-library route security |

### Phase C — Save, review, order · P1
| # | Feature |
|---|---|
| C1 | **Drafts on the server** (auto-save every few seconds when logged in; browser copy for guests) |
| C2 | **My designs** page (Account): reopen, duplicate, delete; `/customize/<garment>?design=<id>` |
| C3 | **Review step**: mockup of each used side, print sizes in cm for the chosen size, quality check, price breakdown |
| C4 | **Sizes × quantity** table (S×2, M×3 …), no minimum, price × total |
| C5 | **Add to cart** for custom designs (cart supports a design + size + qty) as well as Buy now |
| C6 | Design preview image saved with the design → shown in cart, checkout, order emails, My orders |

### Phase D — Production · P1 (before taking real orders)
| # | Feature |
|---|---|
| D1 | Server renders **print files**: one PNG per used print position, **300 DPI at the real cm size for each ordered size** (e.g. Centre Front M = 28 × 32 cm = 3307 × 3780 px), transparent background |
| D2 | Admin → Orders: design mockups, sizes/quantities, print positions, **Download print files (ZIP)** |
| D3 | Lock the design once ordered (later edits make a new copy) |

### Phase E — Nice to have · P2/P3
Share link (read-only copy others can open) · design templates (birthday, team, couple …) · name/number
for teams (one design, different names per shirt) · background removal (paid API) · AI design ideas (paid,
Phase 2 of the spec) · realistic 3D preview (needs a better model) · save colours/fonts used recently.

## 6. Technical approach

- **Editor engine (decided)** — **Konva (`react-konva`)**, a canvas library with built-in touch, drag,
  resize/rotate handles (Transformer), snapping hooks, and **export to high-resolution PNG** — the same engine
  can draw the on-screen editor and the 300-DPI print files. Alternative: keep our own HTML/DOM editor and add
  touch + handles by hand (more code, harder to export print files).
- **Design data stays "layout v2"**: every element in % of its print box, so it scales to any garment size and
  to print resolution. Add `version: 3` only if fields change (curve amount, spacing, outline).
- **Print files** rendered on the server (Node canvas or Puppeteer, already installed) from the saved design,
  so customers can't tamper with them; stored in Cloudinary `identee/print-files`.
- **Pricing** stays on the server: garment base price + art, per piece (decided). Per-print-position prices later.
- Fonts: same Google Fonts on screen and in print rendering (server downloads the font files).

## 7. Decisions

Decided by the user (9 Oct 2026):

| # | Question | Decision |
|---|---|---|
| 1 | Editor engine | **Konva (`react-konva`)** — touch, handles, high-res export for print files |
| 2 | 3D view | **Hidden for now**; flat 4-side views + Review mockups. 3D later with a proper oversized-tee model |
| 3 | Quantity | **Many sizes per design, no minimum** (sizes × quantity table; 1 piece allowed) |
| 4 | Pricing | **One price per tee + paid art** (current rule); per-side pricing later when the client decides |

Still open ❓:

5. **Guests**: design without login (current); login needed to upload, save to server or order — keep?
6. **Build order**: B → C → D as above?

## 8. How we'll build and test

One feature branch per phase (`feature-studio-b`, …), tested on a local copy of the data, checked on a
real phone size (375 px) and desktop, then "merge". Each phase ends with a short demo checklist for the user.
