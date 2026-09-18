# The running quote, where it is needed

Two changes from the six ideas parked in `docs/audit-2026-09-13.md`, chosen by
the dealer on 2026-09-18. Both answer the same complaint from different ends:
the quote's state was only ever visible somewhere you had to go and look.

## On a phone: the price and the Add button stay under the thumb

A door's sheet asks between three and a dozen questions. On a 390-wide screen
that runs well past the fold — the glass gallery alone is taller than the
viewport — so the price and the **Add to quote** button sat at the bottom of a
scroll nobody could see the end of. Answering the last question told you
nothing; you still had to scroll to find out what it cost and to act on it.

The price and the button are now pinned to the foot of the sheet while the
answers scroll behind them (`.addbar`, `position: sticky` inside `#detail`,
which is the scrolling element). The block above keeps everything that is not
those two things — the specification line, the part number, the quantity
stepper and the freight note — so nothing is said twice.

- It appears only once the answers resolve to a priced configuration, the same
  condition the block below uses. An unanswered sheet shows no bar.
- It shows the unit price, and the line total beneath it when the quantity is
  more than one.
- Its button calls the same handler as the one in the block, rather than
  repeating the code that builds a quote line, so the two can never disagree
  about what gets added.
- It is hidden from 768px up: on a desktop the whole sheet fits and a second
  price on screen would be noise.
- It carries `env(safe-area-inset-bottom)` so an iPhone's home indicator does
  not sit over the button.

## On a desktop: the quote is legible without opening the drawer

A sales person pricing a house works through a list of openings. The running
total lived in the drawer, and the header showed only a count — so seeing where
the job stood meant opening the drawer, reading it, and closing it again, on
every door.

`#quoteStrip` sits above the catalogue once the quote has at least one line:
the unit and line count, the tier the prices are at, the total, **Open quote**
and **Print quote**.

It is rendered inside the sticky filter bar rather than as a bar of its own.
That is deliberate: the filter section is already `sticky top-16`, and a third
sticky bar would need an offset recomputed every time the header wraps — which
it does, at `sm`. Riding inside the filter bar, it inherits an offset that is
correct by construction.

- Hidden below 768px. The phone already has `#mobileBar` pinned to the foot of
  the screen with the same count and total; two running totals on one small
  screen is noise rather than help.
- The total follows the mode and the tier, like every other price in the app —
  in cost view it reads "your cost" and shows cost.
- Lines the catalogue no longer offers are called out on the strip as well as
  in the drawer, so a stale quote cannot be printed from here without warning.
- **Print quote** calls `printDocument("quote")`, the same call the drawer
  makes, so printing from the strip spends a quote number exactly as printing
  from the drawer does. There is one route in, with two doors on it.
- The job details — who the quote is for — live in the drawer, and the strip
  can be reached without ever opening it. So while the quote has no customer
  name the button reads **Name this quote** and opens the drawer at that field
  instead of printing: an estimate addressed to nobody is not worth printing,
  and it is certainly not worth a quote number, which is spent on the print and
  counted on the device.

## One thing fixed along the way

The **Clavos & straps** row was unreadable on a phone. The picture, the
description, the Round/Square buttons and the quantity stepper were competing
for one 350px line, which left the description truncated to `1-5/16…` and its
price wrapping into a six-line sliver. The row now wraps, and the shape buttons
and the stepper travel together so they land on the second line as a pair.

Found in the screenshot taken to verify the pinned bar, on the same sheet, so
it was fixed rather than written down.

## Tests

`tests/stress-ui.mjs`, in the phone section and a new desktop section:

- the bar is pinned to the bottom edge of the viewport, and stays there when
  the sheet is scrolled back to its first question
- its button adds the same line the block's button does
- the strip is absent on a phone and the phone's own bar is present
- the pinned bar is absent on a desktop
- the strip appears only once there are lines, and goes away when the quote is
  cleared
- its total equals the drawer's total to the cent, and it names the tier
- it stays on screen as the catalogue scrolls
- **Open quote** opens the drawer
- an unnamed quote's button reads "Name this quote", opens the drawer at the
  customer field and prints nothing; once named it prints the same estimate the
  drawer prints
