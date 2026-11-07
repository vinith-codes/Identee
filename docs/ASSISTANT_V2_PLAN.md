# IDENTEE Assistant v2 — "type anything, get a design" (plan, 7 Nov 2026)

## Why

Customers who tried the Assistant said it is hard to work with. They compared it with ChatGPT and Gemini:
one box, type what you want, pictures come back, say "3, 6 and 9", say "more", say "make it darker", done.
One customer's own example: *"create t-shirt designs for identee with front back and sleeve print"* → ChatGPT showed
three whole-tee concept mockups, then twelve, and let them pick by number.

Our Assistant answers well (tested 7 Nov: a natural sentence got three good concepts in text), but everything
around the answer stops the customer: an example wall to scroll past, "Log in to draw" in the middle, a plan card
(style + area) before every picture, one artwork at a time, and on a phone the tee is hidden behind the chat.

Decision (7 Nov, the user): **guests get nothing** — the Assistant works only after sign-in.

## The goal in one line

Any message a customer types gets a useful answer, and when the message is about a design the answer is **pictures**,
numbered, that they can pick, develop and change with plain words — with no menus, plan cards or tool choices.

## Principles

1. **Chat first.** One message box. No example wall (one greeting line + three small suggestion chips). No plan cards.
2. **Pictures are the answer.** A design request returns pictures, not descriptions of pictures.
3. **Everything is numbered.** Every concept and picture carries a number. "3 and 6", "the second one", "more like 2",
   "put 1 on the back" all work.
4. **One brain decides.** Google's text AI reads the message, the tee as it is now, the chat so far and the facts, and
   chooses what to do. The customer never picks a tool. All of today's abilities stay underneath (slogans, photo → art,
   change by words, team list, templates, size/colour help, design check, art library, my pictures).
5. **The tee is always in view.** On a phone a live strip of the tee sits above the chat; a tap opens it full.
6. **Never stuck.** Every wait has Stop, every failure has Try again, every question has a way back. (Kept from the
   15 Oct "no dead ends" work.)
7. **Money stays capped.** Daily pictures per customer, monthly cap for Google, Grok backup — all as today, in Admin → Settings → AI designs.

## What happens for each kind of message

| The customer types… | What they get |
|---|---|
| "create t-shirt designs for identee with front back and sleeve print" (any brief, any occasion) | A **concept sheet**: one picture with 3 numbered whole tees (front, back, sleeve views) in their chosen tee colour and garment, plus one line. ~₹4. Chips: *More options · 1 · 2 · 3 · Different style* |
| "more" / "more options" / "show me 12" | The next sheet(s): concepts 4–6, 7–9, 10–12. ~₹4 each |
| "3, 6 and 9 suit me" / "the second one" / "develop 2" | For each pick, the real artwork pieces are drawn from that concept (front, back, sleeve as the concept had them), cleaned, and put on the tee at print size. ~₹3 per piece. The first pick goes on the tee; the others wait as "My pictures" with *Use this* |
| "draw a lion holding a cricket bat" | Drawn **straight away** on the best free area, in the style that fits the words (no plan card). ~₹3. Chips: *Different style · Put it on the back · Bigger · Another one* |
| "make the text gold and curved", "move it up", "change the tee to black", "delete the sleeve print" | Changed on the tee at once (today's edit-by-chat) |
| "a slogan for my mother", "funny caption about Monday" | Slogans in the chat, tap one to put it on the tee (today's slogans) |
| a photo attached + "make me a cartoon" / "put this on the tee" / "something like this" | Photo → art, copy, or inspired design, directly (today's photo flows, without the question chips) |
| "Arun 7 L, Karthik 10 XL…" / "team order" | The team list (today's) |
| "what size am I", "how much is it", "which colours print well" | Answered from the facts; the size finder / colour help opens when useful |
| "when will it reach Madurai", "can I return it" | Pointed to the Shipping / Refunds / Contact pages (never guessed) |
| Tamil, Tanglish, spelling mistakes, short forms | Answered in the same language (today's) |
| anything unclear | One short question with 2–3 suggested answers as chips |
| anything off topic | One kind sentence and back to the tee |

## It thinks first, acts in steps, and asks when it needs to (added 7 Nov, the user's wish)

- **Reads everything before moving:** the exact words, the tee as it is now (every print, its area, size, colours,
  fonts), the whole chat and its memory note, the tee colour and size, the pictures already made.
- **Does all of it, in order:** one message may mean several moves (a sheet, then pieces, then text on the back, then a
  sleeve name). The reply is a short list of steps the page runs one after another, the room updating as it goes, and
  one line at the end saying what was done. "Undo" takes the last move back.
- **Asks like ChatGPT does — only for what it really needs.** Rules the brain follows:
  - If the brief is enough to make something, make it first and ask after ("Want your club name on the back too?").
  - If a fact it cannot guess is missing — a name or number to print, a date, which of two pictures to replace, whose
    photo — ask **before** spending a picture. One question at a time, or at most 2–3 short ones together, each with
    suggested answers as chips and the box open for a typed answer. Never a form.
  - Never ask what it already knows from the chat, the memory note or the tee ("you said black earlier — keeping black").
  - When the customer answers, it continues the plan from where it stopped; "skip" or "you decide" lets it choose.
  - If the customer changes their mind mid-way ("no, on the sleeve"), it re-reads and fixes only that part.
- Examples: "a tee for my college fest" → "Nice — what's the fest called, and should the club name go on the back? (Just
  the front is fine too.)" then the sheet. "put my name on it" with no name known → "What name should I print?" first.
  "make it look better" on a tee with grey art on black → no question; two concrete fixes shown as pictures.

## Sign-in

- The Assistant opens only for a signed-in customer. For a guest, "Design with the Assistant" goes to sign-in and
  comes straight back to the room with the chat open. The start card shows one line under the button: "Sign in to
  design with the Assistant (free to chat; pictures count towards your daily limit)".
- Nothing is spent on guests. No concept sheets, no drawings, no slogans, no smart chat for guests.

## Costs and limits

- A concept sheet is one Google picture: ₹3 at 1K, ₹4.20 at 2K (recommended: three tees on one picture need the detail).
- Developing a concept: one picture per piece, ₹3 each (front + back + sleeve ≈ ₹9).
- A typical session: 2 sheets + 1 developed concept ≈ ₹17; a heavy one: 4 sheets + 3 concepts ≈ ₹44.
- Today's daily limit is 5 requests per customer. Sheets and pieces both count, so the default should rise (recommended
  **20 pictures per day**) — changeable in Admin → Settings → AI designs. The monthly Google cap stays.
- The chat shows "N pictures left today" quietly under the box once fewer than 5 remain, and says so kindly when they're used up.
- Google's cheaper "Lite" picture model costs the same per picture (checked 7 Nov), so there is no cheap-preview trick.

## How it is built

### Phase 1 — the brain (server, 3 days)
- `/api/ai/chat` answers with a **list of steps** (not one action): **ask** (a question + suggested answers), **concepts**
  (make a sheet), **develop** (picks → pieces), **draw now** (immediate picture, style and area chosen by the AI),
  plus today's edit / slogans / menu. The text model runs with a medium thinking level (~₹0.30 a message).
  The prompt is rewritten around "answer with pictures when it is about a design; never ask what you can decide yourself".
- A **concept-sheet picture prompt**: "a product sheet with three numbered t-shirt concepts (1, 2, 3), each showing the
  front, the back and the sleeve of a {garment} in {colour}, for {the brief}; clean studio background; large legible numbers".
- **Develop**: the sheet is sent back as the reference picture with "draw the front artwork of concept 3 exactly as shown,
  alone on a plain background" (the same reference-picture path as today's "copy a design from a photo"), then today's
  cut-out and placement pipeline.
- Picks by number are resolved on the server (the chat keeps which sheet is which).
- The mock provider (`AI_CHAT_PROVIDER=mock`, `AI_IMAGE_PROVIDER=mock`) gets the new actions so the whole room can be
  tested without spending.
- Usage counting: sheets and pieces count as pictures; the admin usage page shows them as "concept sheets" and "pieces".

### Phase 2 — the chat (website, 4–5 days)
- New first screen: greeting line, three suggestion chips, the message box focused.
- Picture replies in the chat: the sheet with its numbers, chips *More · 1 · 2 · 3*; developed pieces shown small with
  *On the tee ✓ / Use this*; drawn pictures shown with *Different style · Another one · Put it on …*.
- Numbered picking by words, and by tapping a number on the sheet.
- "Draw now" replaces the plan card. The plan card and the Draw/Photo tabs stay in the code but hidden; the chat opens
  the photo flow itself when a photo is attached.
- Phone layout: tee strip above the chat (the live 3D tee, small), tap to open full; the chat keeps its place.
- Sign-in gate on the start card and on the Assistant button.
- Stop / Try again / "pictures left today" on every picture job.

### Phase 3 — polish (2 days)
- Tanglish and Tamil replies on the new flows; the memory note learns the picks ("liked concept 3: cosmic swirl").
- Speed: a sheet takes 15–25 s — the chat shows "Drawing three concepts…" with Stop; pieces are drawn in parallel.
- Chats list / New chat keep working; old chats open as before.

### Phase 4 — testing and release (2 days)
- Mock run: a scripted walk of ~60 message kinds (the table above, in English, Tamil and Tanglish), every reply checked
  for a picture or a clear next step, no dead ends.
- Real run with the user's OK: ~20 real messages and ~6 real sheets/pieces (~₹100), on the user's own account.
- Phone 375 and desktop. Then a release of the shop website + backend, with the usual checklist.

**Total: about two weeks of work.** Built on a feature branch; nothing changes live until the user has tried it.

## Decisions taken / recommended

- Guests get nothing (decided).
- Sheet size 2K (recommended; ₹4.20 instead of ₹3, worth it for three tees on one picture).
- Daily limit 20 pictures per customer (recommended; changeable).
- The first developed concept goes straight on the tee; the others wait as "My pictures" (recommended; one tap to swap).
- Draw/Photo tabs hidden, not deleted (recommended; the chat opens them itself).

## Risks, said plainly

- A concept sheet is one picture of three tees, so each tee is small; "develop" redraws the artwork from it, so the final
  piece is **based on** the concept, not pixel-identical. The chat says "made from concept 3".
- Google refuses real, named people and some protected characters (Marvel, Disney…). Grok takes over automatically, as
  today: it can draw a sheet from words and edit a picture, so sheets, pieces and "develop from a sheet" all have a backup;
  Grok's sheets are a little less polished than Google's.
- Cost per customer rises (more pictures per session). The caps keep the total in hand; watch the admin AI page the first two weeks.
- Two weeks of work on the most complex part of the site: the mock walk and the real run before release are not optional.

## Code map for the build (checked 7 Nov 2026)

- Typed message → `studio/Assistant.jsx` `say()` (:166) → `smartCanAnswer()` (`assistantScript.js:154`) → `{type:"smart"}` → `DesignRoomPage.jsx` `chatSmart` (:1204) → `aiService.chat` (POST `/api/ai/chat`, body `{message, history, earlier, memory, design, facts, areas}`) → `server/services/aiChatService.js` `chatReply`/`buildPrompt`/`cleanChatAnswer`. Reply `do.tool`: edit→`chatEdit` (:1279), draw→`smartPlan()` plan card (:1256), slogans→`writeSlogans`, menu. New actions (concepts / develop / draw now / picks) are added here on both sides.
- Pictures: `drawPlan` (`DesignRoomPage.jsx:1458`) → `aiService.design` (POST `/api/ai/design`, `{subject, style, teeColour, teeIsDark, ratio, banner?}`) → `server/controllers/aiController.js` `makeAiDesign` (:273; modes: new / change / photo / inspired / copy / fix; daily limit `usedToday`, monthly cap `whyOff`) → `aiImageService.generateImage` (one picture; optional reference image; ratio; 1K/4K). Placement: `aiElement()` (:1558), `mergeAiChanges` (:89), `aiPlaced` per area. A concept sheet = a new mode of `makeAiDesign` (or a sibling `makeConcepts`), "develop" = the inspired/copy path with the sheet as the reference picture.
- Login: guests may chat (`/api/ai/chat` is optionalAuth) but drawing is blocked in `chatSmart` (:1258), `chatEdit` (:1316), `drawPlan` (:1462); "Log in to draw" chips → `goToLogin` (:1086). v2 moves the gate to the Assistant button / start card (`isLoggedIn` :115) and makes `/api/ai/chat` protect-only.
- Phone layout: `narrow` (<760, :327), `assist` (:194), `assistSmall` (localStorage `identee:assistSmall`, :82/:204), "Show the tee / Make it big" button (:2836), CSS `designRoom.css:665-669`, `Room3D still=` (:2686). v2: a tee strip above the chat instead of the toggle.
- First screen: `firstMessages()` (`assistantScript.js:124`), `EXAMPLES` (:110) rendered in `Assistant.jsx:466-490`; chips `.dr-chatchips` (:339). v2 replaces the examples block with three suggestion chips.
- Chats: `studio/chatStore.js` (local for guests, server `/api/chats` for users), autosave in `DesignRoomPage.jsx:551-598`, `newChat` :644, `openChat` :650.

## Progress

- **Phase 1 built — 7 Nov 2026** (branch `feature/assistant-v2`, not yet committed): `services/assistantBrain.js`
  (the v2 brain: steps, asking rule, picks by number, mock), `services/conceptSheets.js` (sheet + develop prompts,
  stand-in sheet), `controllers/assistantController.js` (`POST /api/ai/assist`, `/concepts`, `/develop`, login only),
  routes, usage kinds `sheet` / `develop`, 2K pictures, optional `AI_CHAT_THINKING`, daily-limit default 5 → 20.
  Tests: 57 server tests pass (14 new). End to end on a throwaway DB with the mock AI: brief → sheet → "more options" →
  sheet 4–6 → "2 and 5 suit me" → pieces drawn, cut out, stored, counted; the daily limit; a guest gets 401.
  The current page is untouched (`/api/ai/chat` still serves it). Not yet tried with the real Google key.
- **Phase 2 built — 7 Nov 2026** (same branch, not yet committed): `studio/assistantV2.js` (first screen, sheets in a
  chat, picks by number, piece → print area), `studio/SheetCard.jsx` (the sheet in the chat: numbered buttons, More
  options, tap to enlarge), `Assistant.jsx` (typed messages → `/api/ai/assist`; a bare pick skips the brain; the
  sign-in gate), `DesignRoomPage.jsx` (`chatAssist` runs the steps: ask / concepts / develop / draw / edit / slogans /
  menu / undo; `makeSheet`; `developPicks` puts the first pick on the tee piece by piece, the rest wait with Add to
  tee; the v2 start when the status says v2; a guest's Assistant button goes to sign-in; the tee in view by default on
  phones), `aiService.js` (assist / concepts / develop), CSS, server `ai.assistantV2` switch (Admin → Settings → AI
  designs) and `v2` in `/api/ai/status`. Tests: 115 website (5 new), 57 server. Checked on screen with the mock AI at
  375 px and 1280 px: guest → sign-in; signed in: the new start, brief → sheet 1–3, "more options" → 4–6, tap 2 →
  pieces on Centre Front + Full Back (price +₹100), "5 and 3" typed → 5 on the tee, 3 with Add to tee, a missing name
  → question + chips, undo; the chat with its sheets survives a reload. Still to do: Phase 3 polish (Tanglish on the
  new flows, memory of picks, speed/Stop on sheets, Chats list), Phase 4 (the 60-message mock walk, the real Google run
  with the user's OK), release.
- **Phase 3 (part) — 7 Nov 2026:** a concept sheet stopped mid-way is still shown (it was counted); a question is not
  repeated under the brain's reply; number chips are not repeated under a sheet card. `server/scripts/assistantWalk.mjs`
  walks the brain through 60 kinds of customer messages (English, Tamil, Tanglish; briefs, picks, edits, questions,
  off-topic) and prints what it would do: `--direct` for the stand-in brain (free), `--url … --token …` for the real
  brain (~₹0.30 a message, nothing drawn). The stand-in only knows keywords, so Tamil/Tanglish and nuanced lines are
  for the real run. Still to do: the real Google run (user's OK), Tanglish check on the new flows, release.
- **Decision, 7 Nov 2026 (the user): choices first.** Any design OR picture request ("a lion on the front") gets a sheet
  of three takes to pick from (₹4.20), then the pick is made real (₹2.90). A single drawing straight onto the tee is
  the shortcut only when asked ("just draw it", "quickly", "another one", lettering). After a single drawing the chips
  offer "Show me 3 options". Built into the brain's instructions and the stand-in; the walk script expects it.
- **Real Google + Grok run — 7 Nov 2026, evening** (laptop, throwaway DB, real keys, as a new customer on a phone;
  recording: `identee-release/assistant-v2-demo/assistant-v2-demo.gif` + the sheets and pieces). Brief "cafe Brew & Co,
  coffee theme front, name on the back" → in ~40 s a sheet of three black tees, front + back, "BREW & CO" on the backs
  (Retro Roastery Badge / Minimal Line Espresso / Vintage Hand-Drawn Emblem). Tapped 3 → in ~50 s the emblem drawn from
  the sheet on Centre Front + the back print, ₹799. "make the front logo a bit bigger, and on the back add the name
  Priya under the cafe name" → both edits in one go. Tanglish "sleeve la oru small coffee cup venum, options kaatunga"
  → Tanglish reply + sheet 4–6 of sleeve cups; typed "5" → the mug on the Left Sleeve. "6 tees ku total evlo aagum?
  delivery free ah?" → ₹4,794, free delivery over 3, IDENTEE10 — all correct. "Rajinikanth drinking coffee, options" →
  Google refused the sheet, Grok drew it (good: three Rajini coffee tees 7–9); "8" → Google refused the piece, Grok
  made it, on the front. Review step fine. Session cost ₹34 (3 sheets, 4 pieces, 5 messages). Timings: brain 10–12 s,
  sheet 38–44 s, piece 18 s, Grok sheet 44 s. Fixed after: "Option 1/2/3" chips no longer repeated under a sheet.
  Open: a picked piece replaces the AI picture already on that area (Undo brings it back) — fine for now.
- **Round 2 (1, 2, 3 of the improvement list) — 7 Nov 2026, evening:** (1) the brain's reply shows at once and the wait
  card lists the concept names while the sheet is drawn (`run.say` in Assistant.jsx; the develop card names the pieces);
  (2) the customer's own logo: 📎 + words → the brain (`photo` / `logoUrl` on `/api/ai/assist`), a concepts step may say
  `logo: true`, the sheet and the pieces get the logo as a reference picture (`generateImage` takes `images: []`;
  `logoUrl` on `/concepts` and `/develop`; the logo stays on file in the chat as `chatState.logo`); a photo meant as
  art goes to Photo to art; (3) the sheet card: tapping the picture ZOOMS (a full-screen view through a portal, above the
  room, scrollable at 2×, a Make button under each tee); making is always a button — the numbered ones or Make N in the
  zoom (the user: a tap on a picture must not start drawing). Also: "N but with …" → develop with `change` (the pieces
  are drawn with it); "variations of N" → a new sheet; after making, plain words edit the tee. Real run: the logo sheet
  came back with the exact "BREW & CO · EST. 2026" logo in three layouts; concept 8 made with the logo on the front and
  sleeve; first "9 but with the text in gold" went to an edit step instead of develop.change (fixed in the brain's
  instructions: a change inside the artwork is change ONLY). Tests: 59 server, 116 website.
  Second real check after the fix: "make 7 but with the badge in gold" → develop 7 with change ("Concept 7: Classic
  Chest & Back — the badge in gold" in the usage row), the back badge came back gold. The brain's own wait is now 40 s
  (a long chat with sheets and a thinking level went past the text service's 20 s once → "couldn't answer"; Try again
  worked). Round 2 real pictures: ₹33. Demo folder has the logo sheet (sheet-4-with-logo.jpg) and the gold pieces.
- **Round 3 (5, 6, 7, 8, 10) — 7 Nov 2026, night:** (5) "Share my tee" on the Review step: `studio/shareTee.js` makes one
  picture of the front and back with an IDENTEE line and uses the phone's share sheet (WhatsApp …), else saves the file;
  (6) 🎤 in the composer: the browser's own speech recognition (`studio/voiceInput.js`, en-IN; Tanglish works, Tamil may
  come back in Tamil script), words land in the box, Send sends; shown only where the browser has it; (7) the first
  suggestion chip follows the month (`suggestionsFor` in assistantV2.js: Pongal, Valentine's, fests, farewell, summer
  trip, cricket, office, Independence Day, Onam, Diwali, café staff, New Year); (8) Admin → Settings → AI designs shows
  "Concept sheets": sheets, concepts picked, pick rate (picks ÷ concepts shown), styles picked most — all time and this
  month (`conceptSummary` in conceptSheets.js, `concepts` on GET /api/ai/admin); (10) when a made concept takes the place
  of an AI print already on an area, the chat says so and offers Undo / "put the old one on the back". (9, Tamil on the
  tee) NOT done: the room has no Tamil font (FONTS in studio/fonts.js) and the print pipeline makes words into vector
  shapes from the font files, so Tamil words would need a font added to the room AND to the print files — a separate
  job; AI-drawn Tamil lettering in pictures is also often misspelt. Checked on screen with the stand-in AI. Tests: 60
  server, 117 website.
