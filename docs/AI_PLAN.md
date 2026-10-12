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

## Built so far (10 Oct 2026, branch `feature-design-room-two-step`)

- **Design assistant** (Design Room → What to add → Assistant): guided chat, scripted and free (`studio/Assistant.jsx`, `assistantScript.js`). Slogans by occasion with Add to tee; points to art library / upload. The Ideas tab was removed.
- **Background remover** (select an uploaded picture → Remove background): `studio/removeBackground.js`, runs in the browser. Flat-colour backgrounds are cleared directly; photos use ORMBG (`onnx-community/ormbg-ONNX`, Apache-2.0, q8, ~44 MB first download) through `@huggingface/transformers`. The cut-out is uploaded like any design image; Undo restores the original. IS-Net's ONNX build on Hugging Face is AGPL — not used.
- Not built: made-to-order designs, AI slogans (need a paid key and the client's budget).

## Decision (10 Oct 2026): image service = Google Gemini "Nano Banana" standard

- Chosen by the user over FLUX.2 pro: better at words inside designs and at chat-style edits ("make it angrier"); price gap is tiny.
- Prices checked 10 Oct 2026: Nano Banana 2.1 (`gemini-nano-banana-2.1`) $0.0336 per 1K image (~Rs 2.90); FLUX.2 pro ~$0.03, FLUX.2 klein ~$0.014; Claude Haiku 5.5 $0.10 / $0.50 per million tokens (a chat message ~Rs 0.01-0.02).
- Keep `AI_IMAGE_PROVIDER` as a switch (gemini default; FLUX / OpenAI possible later). Before launch, compare ~10 real tee prompts by eye.
- Needs from the client: a Google AI (Gemini API) key with billing, a monthly cap, and (optional, almost free) an Anthropic key for the assistant's text.

## Assistant behaviour agreed (10 Oct 2026)

- When the assistant offers 2-4 designs or slogans, **all of them stay usable**: tapping another one swaps it on the tee (the chosen one shows "On tee"). Nothing is disabled after the first pick. Generated pictures are already paid for, so the customer should be able to try each.
- Walkthrough prototype (team tee by chat): https://claude.ai/artifact/5NuXtHtrY1gpxdbyLgLaCL
- Each suggested design has **Add to tee** (goes to the suggested/current print area and replaces what the assistant put there) and **Other area** (pick any print area), so the customer can (1) swap a design they no longer like and (2) use different designs on different areas, e.g. chest and back. The card shows where it is ("On Left Chest").

## Stage A built (10 Oct 2026) — free assistant features

All scripted, no AI call. Files in `frontend/src/studio/`: `assistantScript.js` (what it says: `replyTo(text, ctx, state)`), `assistantSlogans.js`, `designTemplates.js`, `designCheck.js`, `Assistant.jsx`.
- **Slogans**: 12 occasions x 4 tones (funny, bold, emotional, simple), Show more, Add a name or year, Change tone; typed requests are understood by keywords ("funny line for my cricket team").
- **Templates**: Team jersey, Birthday squad, Class of, Couple tee, Trip tee, Minimal brand. One tap places the texts in free print areas (letter sizes in cm); asks Start fresh / Add to my design when the tee is not empty.
- **Design check**: blurry picture (< 100 DPI), letters under 0.8 cm, ink too close to the tee colour, item hanging over the area's edge; each with a one-tap fix. Runs from the chat and once automatically when Review is pressed (Review again or "Continue to review" goes on).
- **Colour help** (inks that stand out on the tee colour; tap recolours the text on the open area), **Where to print** (opens the suggested area), **Size help** (oversized-fit advice, sets the size).
- Stage B (text key) replaces `replyTo` with Claude; the message shapes and page actions (`assistantAct`) stay.

## "Make a design" built (11 Oct 2026, branch `feature-ai-designs`)

- **Server**: `POST /api/ai/design` (login) -> `services/aiImageService.js` (Gemini Interactions API, model
  `gemini-nano-banana-2.1`, 1K PNG, aspect ratio nearest to the print area) -> pictures stored in `identee/ai-designs`
  -> `{ images, left }`. `GET /api/ai/status`, `GET/PUT /api/ai/admin`. Usage rows in `AiUsage`.
- **Key**: `IDENTEE_GEMINI_API_KEY` in `server/.env` (`GEMINI_API_KEY` also works, but a system-wide one on the PC wins over .env) (never sent to the browser). `AI_IMAGE_MODEL` optional.
  `AI_IMAGE_PROVIDER=mock` draws a sample picture without calling anyone (use it for testing; it costs nothing).
- **Limits** (Admin -> Settings -> AI designs; stored as `ai.*` settings): on/off, requests per customer per day (5),
  pictures per request (3), monthly cap in rupees (2000; the feature pauses past it), price per picture (2.9, for the
  figures only). Also 6 requests a minute per address. Brand / character / real-person requests are refused on both sides.
- **Prompt**: plain white background for light tees, plain black for dark ones, so the Design Room's flat-colour
  background remover can cut the design out when it is added to the tee.
- **Chat** (`assistantScript.js`, `Assistant.jsx`): Make a design -> what should it show -> style -> pictures. Each
  picture: Add to tee (replaces the AI design on that area), Other area, Change (next message is the change).
  "Make more" repeats the last request. A typed description with a picture word ("draw a lion...") skips to the style.
- **Tested** with the mock provider on a local copy: new design, change, replace, other area, limits, cap, admin page.
  Real Gemini API tested 12 Oct 2026: one picture (bold-mascot lion, 1024 px JPEG, 22 s) came back and cut out cleanly on a dark tee. Google only returns JPEG. The full path through the server (Cloudinary + usage row) with the real key is still to be tried from the site.

## Decision (12 Oct 2026): no subject restrictions in "Make a design"

The user asked for customers to be able to generate any image. Our own word list and the "no brand logos / trademarked
characters / real people" line in the prompt were removed (server and assistant). I advised against it: designs are
printed and sold, so famous characters, brands and real people's faces are a copyright / trademark risk that falls on
the shop. What remains: the image AI's own rules (it may still refuse), and a line in the Review step — "By ordering,
you confirm you have the right to print everything in this design." Whether the client (Quindl) has agreed to this is
not recorded; raise it before go-live, and consider a tick-box and a line in the Terms page.

## AI slogans built (12 Oct 2026)

`POST /api/ai/slogans` (`services/aiTextService.js`): Gemini text model (`gemini-flash-lite-latest`, or `AI_TEXT_MODEL`)
with the same key as the image maker — no Anthropic key needed. No login; 20 a minute per address; costs a fraction of a
paisa, so it is not counted against the picture limits or logged. In the assistant, when `status.text` is true: any typed
request for words ("a slogan about my mother") or the Slogan ideas chip goes to the AI; Show more avoids lines already
shown (`st.said`); Change tone re-asks. Answers in the customer's language (Tanglish tested). Without a key the built-in
library (12 occasions x 4 tones) still answers.

## Edit by chat + photo to art built (12 Oct 2026)

- **Edit by chat** — `POST /api/ai/edit` (`aiTextService.planEdit`): the text AI gets a small description of the design
  (`studio/aiOps.js describeDesign`) and the typed message, and returns `{ reply, ops }`. `applyAiOps` checks and applies
  the ops (update / move / delete / duplicate / add_text) as one Undo step; unknown ids, areas, fonts or values are skipped.
  Routing (`assistantScript.js`): typed text with an edit word (`EDIT_WORDS`) when the tee has a design; tapped chips never
  go to the AI; any other typed message the script does not recognise is also sent there, so the AI answers it. The prompt
  forbids inventing shop facts (it had made up a "30-day return policy" before that line was added).
- **Photo to art** — `POST /api/ai/design` with `{ photoUrl, artStyle }`: the customer's uploaded photo is resized, redrawn
  in Cartoon / Sketch / Sticker / Watercolour / Pop art (two versions), cut out and returned like any AI design. Counts as
  one daily request; usage kind `photo`. Chat: "Photo to art" (under More help) or typed ("turn my photo into a cartoon")
  -> Upload a photo / Use the picture on my tee -> style.
- Tested: edit by chat on the real site with the real text AI (colour + curve, delete, add text, move to sleeve, a shop
  question). Photo to art only with the mock provider — **not yet with a real photo through Gemini**.

## One sentence for the whole tee (12 Oct 2026)

A typed message of 7+ words that mentions front / back / sleeve / chest / t-shirt goes to `planEdit` even on an empty
tee. Two more ops: `set_tee_colour` (a name from the garment's colours) and `make_picture` (area, subject, style; at most
3). `chatEdit` in `DesignRoomPage.jsx` changes the colour, applies the text ops, then asks `/api/ai/design` once per
picture with `count: 2`, puts the first result on that area and shows both in the chat. Each picture op uses one of the
customer's daily requests (about Rs 7). Tested with the real text AI and mock pictures: "I want a tiger image on front
side and back side use a tree image in black color t-shirt" -> Black tee, a picture on Centre Front and Full Back.
