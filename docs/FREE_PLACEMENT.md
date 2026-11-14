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
