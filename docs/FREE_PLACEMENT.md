# Free placement — phase 1: more places to print (14 Nov 2026)

A note for the owner. Branch `feature/free-placement`. Nothing here is live until you release it **and** switch the
new places on in the admin (steps at the end).

## What a customer gets

- **Eight more places on the Oversized tee**: five new ones (Chest Line, Mid Front, Front Left Vertical, Back Neck,
  Mid Back) and three that were in the list before but had no size, so they could never be offered (Lower Left,
  Lower Right, Lower Back).
- **"Where to print" reads better with up to 11 front places.** Front / Back / Sleeves as before. In each group the
  main print comes first, then the other big prints, then the chest prints, bands and strips, and the small prints
  (Lower Left / Right, Back Neck) come last. The same order is used in "Where should it go?" (My pictures).
- **A card that can't be used says why.** It used to fade out with a line through the name. Now it shows the
  reason in brown under the little tee, for example **"Not with Centre Front"**, or **"Not with Centre Front +1"**
  when two prints are in the way. The words stay easy to read. (The admin Design Studio's cards look as before.)
- **Every place has a short hint**, for example "Small mark just under the back collar". It shows when you point at
  a card on a laptop, in the screen reader's words, and on each row of "Where should it go?". Those rows no longer
  add "small, for a logo" next to it (it said the wrong thing for Chest Line, a strip for words), so most rows fit
  on one line on a phone.
- **The card drawings are to scale.** The little tee on each card is now drawn in the 3D tee's real proportions, so
  Back Neck sits under the collar and Lower Left / Lower Back sit near the hem, where they really are.
- **Phone:** the Front / Back / Sleeves tabs over the cards are now 44 px tall (a finger's width). Checked at 360 and
  375 px wide: three cards per row, nothing cut, no sideways scrolling. On a laptop, pointing at a card still lights
  up its spot on the 3D tee.
- **The AI understands the places in plain words.** In the chat, the Assistant and photo requests, words like "on
  the nape", "back of the neck", "write my name across the chest", "on the belly", "middle of the back", "lower
  back" and "bottom left" all find the right place, but only if the tee offers it. Otherwise the design goes to the
  biggest free place on that side. "A lion across the chest" still means the big chest print, not the thin Chest
  Line. Each AI request now carries up to 40 places (it was 20 to 30), so none are cut off.
- **New words start at a size that suits the place.** "Add a heading" on Chest Line (26 × 7 cm) now starts with
  3.1 cm letters in the middle of the strip (it was 0.8 cm letters near the top), Top Back 4.2 cm (was 1.2 cm), and
  "Add a small line" on Back Neck 5 mm (was 3 mm). Tall places (Centre Front, Full Back, the chests, the strips,
  the sleeves) start exactly as before (studio/textStart.js; checked in the browser 14 Nov).
- **The admin's step list counts only places customers really get.** "Print areas · N offered" now matches the
  Print areas step (an old saved "offered" with no size on Lower Left / Right does not count).
- **Assistant designs go to a new place only when they suit it.** One drawn picture goes on Back Neck or Lower Left
  only when it is a small mark (a logo, initials), and on a strip (Chest Line, Lower Back) only when it is words.
  A picture with more in it ("a roaring lion with KINGS XI on the chest line", "a phoenix, the name small at the
  nape") stays on the main front or back print, as before.

## The new places (all sizes are our ESTIMATES until the print team measures them)

Sizes are width × height in cm, in our size groups XS–S / M–XL / 2XL–3XL. "From collar" is how far the top of the
print sits below the collar seam. The print team measures it the same way, and the job card shows it as TOP.

| Place | Where | XS–S | M–XL | 2XL–3XL | From collar |
|---|---|---|---|---|---|
| Chest Line | one line of words across the chest | 22 × 6 | 26 × 7 | 30 × 8 | XS–M 6, L–XL 7, 2XL–3XL 8 (same start as Full Front) |
| Mid Front | across the belly, under the chest | 22 × 12 | 26 × 14 | 30 × 16 | 28 / 30 / 32 |
| Front Left Vertical | tall strip down the left side | 10 × 52 | 10 × 52 | 10 × 54 | 6 / 7 / 8. Exact mirror of the print team's Front Right Vertical, 8 cm from the centre |
| Lower Left / Lower Right | small print low on the front | 10 × 10 | 10 × 10 | 10 × 10 | XS 42, S 44, M 46, L 48, XL 50.5, 2XL 52.5, 3XL 54.5. 6 cm from the centre line |
| Back Neck | small mark just under the back collar | 7 × 4 | 7 × 4 | 7 × 4 | 2.5 on every size (so it ends 6.5 cm under the collar) |
| Mid Back | middle of the back | 26 × 18 | 30 × 20 | 34 × 22 | 19 / 21 / 23 |
| Lower Back | wide strip near the bottom of the back | 26 × 9 | 30 × 10 | 34 × 11 | XS 51.5, S 54, M 55, L 57.5, XL 60, 2XL 61.5, 3XL 64 |

Two places differ from the first plan:
- **Lower Left / Right sit 6 cm from the centre line** (the plan said about 8). On a real Oversized tee that still
  leaves 10 cm or more to the side seam. But the 3D tee's body is narrower than the real tee (about 37 cm across at
  XS, against 53 cm on the size chart), and at 8 cm the print sat on the edge of the 3D body and wrapped round its
  side in the preview. At 6 cm it stays on the front, and it doesn't clash with Vertical Front.
- **Back Neck is 7 × 4 cm** (the plan said 7 × 6). At 6 cm tall it ran into the top of Full Back (about 7 cm under
  the collar) and, on S–M, 5 mm into Top Back / Centre Back / Vertical Back (8 cm). At 4 cm tall it ends 6.5 cm under
  the collar on every size, so a small nape mark can go with any big back print and the two never touch.

The low places (Lower Left / Right, Lower Back) move down a little with every size, because longer tees have their
hem lower. Kids' sizes and 4XL / 5XL get sizes the same way as the other places: 4XL / 5XL use the 3XL size, and a
kids' size is scaled down by its chest. The start line and the print file's size work the same way for the new
places, so the print file is the size the customer designed on. Older places, and every design and order already
made on them, are unchanged.

**Which places can't share a tee** (they overlap):
- Chest Line: Centre Front, Left / Right Chest, Full Front, Vertical Front, either Front Vertical
- Mid Front: Centre Front, Full Front, Vertical Front, either Front Vertical
- Front Left Vertical: Centre Front, Left Chest, Full Front, Chest Line, Mid Front, Lower Left
- Lower Left (and Lower Right, on its side): Full Front, that side's Front Vertical
- Back Neck: none. It can be used with every back print, Full Back included.
- Mid Back: Full Back, Centre Back, Vertical Back
- Lower Back: Centre Back, Vertical Back

### Checked on the Oversized tee

Every new box was placed at sizes XS, M and 3XL. The rule: at least 2.5 cm below the collar, 4 cm above the hem and
5 cm in from the side seams of the real tee (half the chest on the size chart). We also checked the 3D preview: each
box stays at least 2 cm inside the 3D tee's outline, so it shows on the front or back and doesn't wrap round the
side. The numbers are cm from the collar / the hem / the real side seam / the 3D outline:

| Place | XS | M | 3XL |
|---|---|---|---|
| Chest Line | 6 / 47.3 / 15.7 / 8.0 | 6 / 50.5 / 16.2 / 7.4 | 8 / 56.0 / 19.3 / 8.1 |
| Mid Front | 28 / 19.3 / 15.7 / 7.8 | 30 / 19.5 / 16.2 / 7.1 | 32 / 24.0 / 19.3 / 7.8 |
| Lower Left / Right | 42 / 7.3 / 10.7 / 2.4 | 46 / 7.5 / 13.2 / 3.7 | 54.5 / 7.5 / 18.3 / 6.3 |
| Back Neck | 2.5 / 61.1 / 23.2 / 15.5 | 2.5 / 65.9 / 25.7 / 16.9 | 2.5 / 75.6 / 30.8 / 19.6 |
| Mid Back | 19 / 30.6 / 13.7 / 5.9 | 21 / 31.4 / 14.2 / 5.3 | 23 / 37.1 / 17.3 / 6.0 |
| Lower Back | 51.5 / 7.1 / 13.7 / 5.2 | 55 / 7.4 / 14.2 / 4.5 | 64 / 7.1 / 17.3 / 5.1 |

Front Left Vertical is the exception. It copies the print team's own Front Right Vertical: 8.7 cm or more from the
real side seam, but at XS both strips end only 1.3 cm above the hem (M 5.5, 3XL 10) and touch the 3D outline. XS is
not sold on the Oversized tee today. Please ask the print team to check this strip on a small tee.

## The print files

- The order ZIP's print file for each new place is made at the size in the table, as for the other places.
- On the job card, TOP is measured from the collar seam and SIDE from the centre line. For example, Lower Left at M
  shows TOP 46 cm and SIDE 11 cm to the wearer's LEFT (the middle of the print: 6 cm gap + half of 10 cm).
- The tee drawing on the job card now gets longer when a print sits low on a big size (Lower Back at 3XL), so the
  print stays inside the drawing. Every other job card looks the same as before.

## Before the release: one check (2 minutes)

The new rules leave every garment as it is, with one thing to look at. In **identee.co.in/admin → Customizable**,
open each live garment's **Print areas** step and see whether **Lower Left, Lower Right or Lower Back** says
**Offered**. Before this change those three could only be offered after typing a size by hand. If one of them is
offered on a garment, tell me before the release: designs made there would move to the new position.

(The girls', boys' and kids' round necks have an old "offered" mark saved on Lower Left / Right with no size. It
never did anything, and it still doesn't: those places stay off there, and the admin page shows them as Off.)

## After the release: switch the new places on (admin)

New places stay **off** on every garment until you switch them on, so nothing changes for customers on release day.

1. Open **identee.co.in/admin**, then **Customizable**. On the **Oversized Tee** card click **"Edit set-up →"**,
   then click step **5. Print areas** in the steps bar at the top.
2. The list now shows all the places. The new ones say **"· estimate"**. Click one, for example **Back Neck**. The
   card on the right shows its size for every tee size, the words customers will see, and "Estimate: … until the
   print team measures this place".
3. Click **"Offer this area"**. Repeat for each place you want: Chest Line, Mid Front, Front Left Vertical, Lower
   Left, Lower Right, Back Neck, Mid Back, Lower Back.
4. Check the size boxes. If the print team has given you real sizes, type them in here.
5. Click **"Save and continue →"**. The sizes are saved with the tee at that moment. Changing the list in the code
   later does not move them; change them here instead.
6. Open the design room on the shop as a customer (Test as a customer) and look at "Where to print" on a phone and
   on a laptop.

Please send the print team the table above and ask them to confirm or correct the sizes and positions. They are
especially needed for Front Left Vertical, the Lower places and Back Neck (and how close to the collar rib they
press). Until they reply, the places are marked "estimate" in the admin.

---

# Free placement — phase 2: prints at any place, behind the scenes (14 Nov 2026)

Same branch, `feature/free-placement`. There are **no new buttons for customers** in this phase. It teaches every part
of the website to handle a print that sits at **any place** on the tee, measured in centimetres. Phase 3 then adds the
part customers see: dragging a print anywhere on the 3D tee.

## What a "free place" is

A print in a free place is called a **spot** in the code. Customers and the print team see its name, for example
**"Front 1"**, **"Back 1"** or **"Left sleeve 1"**. They never see "spot-1".

Each spot stores six things, all in cm, measured on the tee size it was designed on (the "base" size):

- how far its top edge is **below the collar seam** (on a sleeve: below the **shoulder seam**),
- how far its middle is **from the centre line** (to the wearer's left or right),
- its **width and height**,
- whether it **grows** with the tee size (a big print: smaller on S, bigger on 2XL) or **stays the same cm** (a logo),
- the print area it started from, if any (for example "moved from Left Chest").

A growing print gets **one size for each size group** (XS–S, M–XL, 2XL–3XL). So the print team gets **at most 3
print files** per print, as today. It grows by how much wider the tee is (the size chart's chest).

### Example: the test design (Oversized tee, made on size M)

| Print | XS–S | M–XL | 2XL–3XL |
|---|---|---|---|
| Front 1, logo (same cm) | 9 x 9 cm, 8 cm down, 9 cm to the wearer's left | the same | the same |
| Front 2, "IDENTEE" (grows) | 23 x 5.7 cm, 38.3 cm down, centred | 24 x 6 cm, 40 cm down | 27.1 x 6.8 cm, 45.2 cm down |
| Back 1, picture (grows) | 28.7 x 36.3 cm, 9.6 cm down | 30 x 38 cm, 10 cm down | 33.9 x 43 cm, 11.3 cm down |
| Left sleeve 1, words (same cm) | 8 x 6 cm, 4 cm below the shoulder seam | the same | the same |

"Down" means below the collar seam at the centre line.

## The safe zone and the biggest print (our ESTIMATES until the print team answers)

A print must keep clear of the seams. A print too close to a seam on one size is **moved in** or **shrunk** on that size only, and the design check tells the customer.

- **Collar seam:** 3 cm. **Side seams:** 5 cm. **Hem:** 4 cm.
- **Sleeve:** 2.5 cm from the shoulder seam, the sleeve's hem and its sides.
- **Biggest print:** the print team's Full Front / Centre Back, which is 35 x 52 cm (37 x 54 at 2XL–3XL).
- **Biggest sleeve print:** 10 x 10 cm (13 x 14 at 2XL–3XL).
- **Sleeve prints only on garments that print on the sleeves.** If every sleeve print area of a garment is
  switched off in Admin, a print in a free place on its sleeve is refused too (and the same for the front or back).

The owner's answers file suggested 30 x 40 cm as a safe biggest print. This phase uses the print team's 35 x 52,
which the biggest print follows (the Full Front / Centre Back sizes in **Admin → Print areas**). **Do not change those
sizes while orders are open:** that changes the print pages of every unprinted Full Front / Centre Back order, and it
shrinks prints in free places too (see "Two things to know for later").

The 3D tee's body is narrower than the real tee, so a print also keeps 1 cm inside the 3D tee's outline. On M the
widest print that fits is 35.8 cm. On a sleeve it also keeps 1 cm inside the 3D sleeve's hem: the regular round-neck
tee's 3D sleeve is short, so a sleeve print there is at most about 7 cm tall. The crop tops keep their full sleeve
(cropping the body doesn't shorten the sleeve). Prints in their usual print areas are never moved or shrunk.

On the 3D tee a sleeve print is placed by its drop straight down from the shoulder; the print team measures along the
sloping sleeve. On a long sleeve print the preview can sit up to about 1 cm lower than the pressed print. The job
card's number is the one to follow.

## What is checked when a design is saved (the server)

- At most **8** prints in free places per tee.
- Each one inside the safe zone and no bigger than the biggest print. A refusal names it, for example: "Front 1: it
  is too near the side seam (keep 5 cm clear). Please move or shrink it."
- No two prints overlap on **any** size the tee comes in. This covers a print in a free place and one in a print area
  too. A print area without the print team's start line (Centre Front, the chests, Full Back) is checked both where
  our usual start line puts it and where the 3D tee draws it (lower on the big sizes), so they never overlap on either.
- Each print in a free place has its own name. A name already used by another print (or a print area's name, like
  "Full Front") becomes the next free one, for example "Front 3".
- Only garments with a 3D design room. The flat page has no free places.

## What the print team sees

- Each print in a free place gets **its own page** in the order ZIP, at its size for each size group.
- The job card's **TOP** is measured from the **collar seam** (on a sleeve: **"cm below shoulder seam"**). **SIDE**
  is measured from the centre line; less than 0.5 cm off it is "centred" on the job card, the tee drawing, the day
  sheets and the order sheet alike. There is no "*" mark, because nothing is measured from "your usual start line".
- The tee drawing on the job card shows it where it really goes.
- The order sheet gets **one extra line per print**, for example
  `1 Front 2 (M, L, XL) · 24 x 6 cm · top 40 cm below collar seam · centred`.
- The day sheets' tags say "below the shoulder seam" for a sleeve print.

## Old designs and old orders

They are **not changed in any way**. A design without free places is saved, checked, shown on the 3D tee and printed exactly as before. The tests prove it:

- every print area on every size is placed on the 3D tee and on the job card exactly as before,
- made-up old designs give exactly the same print data as before, down to the last character.

## Two things to know for later

- **Only the size it was made on is stored.** A print in a free place stores its box in cm on the size it was
  designed on (for example M). Its size and place on the other sizes are **worked out when the print files are made**,
  from the garment's size chart, the sizes it is sold in and the biggest print (the Full Front / Centre Back sizes).
  So changing any of those later changes the print pages of orders not yet printed — even on the size it was made on,
  if the biggest print gets smaller. Print areas work the same way today. Until the cm per size are frozen on each
  order (a later phase), any change to the size chart, the sizes sold or the print-area sizes must be versioned (a
  new key or a dated note) and made only when no such order is waiting to print, never edited in place.
- **The admin's Studio** (hand-made shop tees) has no free places in this phase. Its print check and "Enlarge for
  print" only see print areas (planned for phase 6). For customer orders, "Prepare for print" works on prints in
  free places like any other print. It takes the print's width from its own page.
- **Phones without 3D:** the flat page never opens a saved design (this was true before too). A design with free
  places can only be opened in the 3D design room.

## For testing on the laptop

`free-placement-plan/work/phase2/seed-three-spot.mjs <userId>` saves the test design above into a **local** test
database through the website's own save check. It only works with a database on the laptop. It prints the address
that opens the design in the design room.

# Free placement — phase 3: drag anywhere (15 Nov 2026)

Customers can now put a print **anywhere** on the front, the back or a sleeve, not only in the fixed print areas.
It works in the 3D design room only. Phones without 3D get the flat page, which is unchanged.

## How a customer does it

- **"Whole front / back / sleeve"** (the button above the editor) opens the **panel**: that whole side of the tee drawn
  flat, at the tee size on screen. The safe zone is plain; the strips where nothing may go are hatched. The print
  areas are dashed outlines (on a phone, only while dragging).
- **Drag** a thing anywhere on the panel. A chip under it says its size and place in a shopper's words, for example
  "9 × 9 cm · 8 cm below the collar · 9 cm to your left"; when it is pushed against a line it says so ("Can't go nearer the collar"). **Left and right are always as worn.** On the front, the
  screen's left is the wearer's right.
- **Snapping:** within 1.5 cm of the centre line or a print area's top line, it snaps there, and a tag names the line.
- **Let go:** a thing still fully inside its print area stays there, exactly as before. Otherwise it becomes a print
  of its own ("Front 2"), boxed tightly round it. If it comes within 1 cm of another print (or overlaps it on any tee
  size), the two join and are pressed as one piece. A toast says so, with **Undo**: one drop is one Undo.
- **Phone:** pinch or the + / − buttons to zoom ("Whole" shows the side again); two fingers only zoom, they never move
  a print. Smaller / Bigger in the bottom bar stop at the same limits as dragging. **Laptop:** the arrow keys move the
  chosen thing 0.5 cm (with Shift, 2 cm), and Esc closes the panel.
- **"Anywhere on the tee"** (a card in "Where to print", and a row in the Upload / Art / My pictures sheet): tap the
  3D tee where you want it, and a new print starts there. It starts as a 10 x 10 cm box; close to another print it
  tries 8 cm, then 6 cm, then a 6 cm and a 4 cm box moved away from that print (the tapped point still inside, near
  its edge), so a tap a few cm from a print still works. If even that meets a print, that print opens instead (and the
  message says when it only meets on the bigger sizes). A drag that turns the tee never starts a print; a tap on a
  co-ord set's shorts says where to tap.
- In a print's own editor, a thing held against the edge offers **"Move anywhere →"**, which opens the panel.

## The limits (the same ones the server checks)

- **8 separate prints** at most on a tee. A 9th is refused and the thing goes back. Joining it to another print is fine.
- A print's box must stay inside the **safe zone**, and no bigger than the **biggest print** (phase 2). The panel stops
  a thing at the safe line, so the print files never have to move it. A sleeve print stays on the sleeve's centre
  line, so on a sleeve the biggest print's width (10 cm) also limits how far off the line a thing can go. The print's
  own editor keeps to the same limit, so dragging a thing to its edge again and again cannot grow the print past it.
- **Every tee size:** the panel's lines are the tightest over all the sizes the tee comes in (for a print that grows on
  the bigger sizes, as it grows), so a print let go at a line is pressed where it is on every size, not only on the
  one on screen. Resizing and turning stop at the same lines. A nudge on a size that holds a print in keeps the
  print's own measurements.
- **The print's own editor** lets go through the same rule as the panel (its things stay one print): grown past the
  biggest print it goes back with the reason; within 1 cm of another print it joins, with Undo.
- A joined print bigger than the biggest print is refused, with the reason.
- **Players' names:** a print holding the player's name keeps at least 30 cm wide (or the safe width, if less), so
  long names stay big, as in a print area. Let go off the centre, the name stays where it was let go and its box
  moves in round it.

## Speed on phones

Each print in a free place is a picture on the 3D tee. It is at most **1024 px** on its long side on a phone and
**2048 px** on a laptop (print areas keep their sizes). Eight prints at full size have run iPhones out of memory before.
This only changes the 3D picture, not the print files.

## Old designs and old orders

They are unchanged. A thing that stays in its print area is saved exactly as before. The tests check that old designs
show on the panel where the 3D tee shows them, and that nothing about them changes.

## Not done in this phase

- The flat page (phones without 3D) has no panel and no free places, as in phase 2.
- The admin's Studio has no free places (planned for phase 6).
