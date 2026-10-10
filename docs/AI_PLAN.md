# IDENTEE — AI plan (9 Oct 2026)

Full plan page (research, phases, costs, decisions): https://claude.ai/artifact/UpeRqE9MWNKmYyQJ3gsYbg

## Research summary — what other sites do
- **Printify:** text-to-image in the product creator (OpenAI since Aug 2024), style modifiers, "prompt enhancement",
  optional background removal, 1024 px images upscaled automatically for print, IP content rules, daily limit.
- **Printful:** guided prompt (subject → scene/background colour → mood → style); image upscaling/sharpening.
- **Rush Order Tees:** free AI Design Wizard, up to 30 designs/day. **Kittl:** AI text effects, background removal,
  upscaling, vectorizer, transparent exports. **Macmerise (India):** AI artwork in the customizer.
- **Trends:** photo → cartoon portraits (pets, family) on tees; selfie virtual try-on apps (costly, unproven for print).

## Phases
- **Phase 1 (now, free / near-free):** remove background · ideas (slogans) · guided idea builder · admin description writer.
- **Phase 2 (budget):** AI design generator (Gemini or OpenAI, swappable) · photo → art · print upscale ·
  admin copyright check.
- **Phase 3 (optional):** shopping helper chat · virtual try-on · vector export.
- Cost example for the generator (≈ ₹14 per try of 4 images): 100 customers × 2 tries ≈ ₹2,800/month;
  500 ≈ ₹14,000; 2,000 ≈ ₹56,000. Monthly cap + daily per-customer limit in Admin → Settings → AI.

Decisions (user, 9 Oct 2026): build **AI design generator**, **background remover** and **slogan & text ideas**.
Image service: **decide later** (build it swappable). Budget: **not approved yet → free parts first**; the paid
generator is built but stays **off** until there is a key and a budget.

## Principles
- AI keys live on the **server only** (`server/.env`), never in the browser.
- Every paid call needs a **login**, has a **per-customer daily limit**, and counts toward a **monthly cap** set in
  the admin. When the cap is reached the feature says "back tomorrow / next month" instead of spending.
- Everything AI makes is saved in **Cloudinary** (`identee/ai/…`) like other uploads, so designs, print files and
  orders keep working.
- With no key set, each feature either has a free version or hides itself — nothing breaks.

## 1. Background remover — FREE (build now)
- In the Design Room, on a selected uploaded photo: **Remove background** button.
- Runs **in the customer's browser** with Transformers.js (Apache-2.0) and an Apache-2.0 model (ORMBG or IS-Net
  general-use, quantized ≈ 40–45 MB). Downloaded only the first time someone taps the button, then cached by the
  browser. No server cost, the photo never leaves the customer's device until they use it.
- Result: PNG with a transparent background → uploaded to Cloudinary through the existing upload → replaces the
  photo on the tee. **Undo** brings the original back. Progress shown ("Preparing… 60%").
- Not used: `@imgly/background-removal` (AGPL licence — risky for a closed shop).
- Phones: works on modern phones; slow phones get a "this may take a moment" note.

## 2. Slogan & text ideas — FREE now, AI when a key exists (build now)
- Design Room → **Ideas** panel: occasion (Birthday, Team, Couple, Family trip, College, Business, Just for fun),
  names / details ("Arjun, 30"), tone (Fun, Classy, Bold). → 6 lines; tap one to put it on the tee as text.
- **Free version (default):** a curated list of lines per occasion and tone, with the names filled in.
- **AI version (when `ANTHROPIC_API_KEY` is set):** `POST /api/ai/slogans` (login, ~20 per day per customer) asks
  Claude (`claude-haiku-5-5`, fast and cheap — a fraction of a paisa per request) for 6 short, print-friendly lines;
  falls back to the free list on any error.

## 3. AI design generator — built, OFF until key + budget
- Design Room → **AI** tool: describe the idea, pick a style (Cartoon, Vintage, Minimal line art, Anime, Retro,
  Watercolour), the tee colour is added automatically → **4 options** → tap one to place it like an image.
- Server `POST /api/ai/images` with a **provider switch**: `AI_IMAGE_PROVIDER=gemini|openai` + its key in
  `server/.env`. Costs ≈ ₹3–4 per image (≈ ₹12–16 per request of 4); exact price depends on the service chosen.
- Limits: per-customer per day (default 3 requests = 12 images) + monthly cap in ₹ (admin); usage log
  (`AiUsage` collection: who, when, prompt, images, estimated cost).
- Safety: refuses requests for brand logos, film/cartoon characters and real people (simple list + the service's own
  safety filter); prompts ask for a single centred graphic on a plain background; the background remover (1) then
  makes it transparent.
- Print quality: AI images are ~1024 px ≈ 93 DPI at 28 cm — the print-quality meter warns; an **upscale** step
  (paid, ≈ ₹1 per image) can be added later.
- **Admin → Settings → AI:** on/off switch, provider shown (from the server), daily limit, monthly cap, this month's
  usage and cost. While off, the AI tool keeps showing "soon".

## Build order
1. Background remover (Design Room). 2. Ideas panel (free list + Claude when a key exists).
3. Generator server side + admin AI settings + usage log (off). 4. Generator panel in the Design Room (shown only
when switched on). Each on a feature branch, tested on a local copy, merged on "merge".

## Needed from the client later
- Budget for the image generator (and which service), then the key goes into `server/.env` on the server.
- Optional Anthropic key for AI slogans (tiny cost); without it the free list is used.
