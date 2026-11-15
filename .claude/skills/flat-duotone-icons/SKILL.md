---
name: "flat-duotone-icons"
description: "Create original SVG icons in a soft, squircle-based two-tone flat style (light body + dark accent on a 14px grid). Use whenever the user asks for an icon, icon set, glyph, or UI pictogram in a flat/duotone/squircle look, or wants new icons matching an existing soft two-tone set."
---

# Flat duotone squircle icons

Draw original icons in a soft two-tone flat style: a light-coloured silhouette carries the object, a dark colour carries the details that make it readable. Bodies are squircles (superellipse-like shapes whose sides swell gently and flow into the corners), not rectangles with a corner radius. Nothing is outlined. The style reads as friendly and fluid and works best at 24px and up.

Draw every icon from scratch from the concept. Do not trace, copy or recreate icons from a commercial icon library, even when the user points at one as the style reference; the style is the reference, the individual drawings are not.

## Squircles, not rounded rectangles

A rounded rectangle is straight edge, then circular arc, then straight edge; the join is visible and the shape looks mechanical. A squircle has continuous curvature: the curve starts well before the corner and the edges are never quite flat. This is the signature of the style, so:

- Do not use `<rect rx>` or circular-arc (`A`) corners for bodies, tiles, screens, cards, buttons, badges or inner panels. Draw them as squircle paths.
- Circles stay circles (lenses, dots, discs, rings). Pills and full-round ends are fine for small line-like parts.
- Organic objects (drops, bells, hearts, leaves) use smooth cubic curves with the same swelling feel.

Generate squircle paths with this helper rather than by hand, so every icon in a set has the same curvature:

```python
def squircle(x, y, w, h, c=None, k=0.75):
    """SVG path for a squircle in the box (x, y, w, h).
    c: how far each corner curve runs along the edges. Default = half the short side,
       which leaves no flat on the short side (fully squirly). Smaller c = flatter sides.
    k: corner tension. 0.55 = circular, 0.75 = squircle (default), 0.9 = boxy."""
    c = min(w, h) / 2 if c is None else min(c, w / 2, h / 2)
    j = c * (1 - k)
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    X, Y = x + w, y + h
    p = [("M", x + c, y), ("L", X - c, y), ("C", X - j, y, X, y + j, X, y + c),
         ("L", X, Y - c), ("C", X, Y - j, X - j, Y, X - c, Y),
         ("L", x + c, Y), ("C", x + j, Y, x, Y - j, x, Y - c),
         ("L", x, y + c), ("C", x, y + j, x + j, y, x + c, y)]
    return "".join(s[0] + " ".join(f(v) for v in s[1:]) for s in p) + "Z"
```

Usage guidance:
- Keep `k=0.75` for everything in a set. Changing it per icon breaks the family look.
- Leave `c` at the default for bodies up to about 1.6:1 aspect. For longer shapes (a wide bar, a tall remote) the default still works: the short side is fully curved and the long side keeps a short flat run.
- Inner dark panels, cells and badges are squircles too, with the same `k`.

## Other style rules

**Canvas**
- `viewBox="0 0 14 14"`. Design on this 14-unit grid and scale up with `width`/`height`; never redraw at another grid.
- Keep artwork inside 0.5-13.5. Large shapes should touch or nearly touch that boundary so icons in a set share the same optical size. A squircle looks slightly smaller than a rectangle of the same box, so do not add extra padding.
- Coordinates to 1-2 decimals. Snap box edges to 0.25 steps.

**Two colours, fixed roles**
- Light (default `#8FBFFA`): the main mass of the object. About 60-85% of the inked area.
- Dark (default `#2859C5`): accents only: a secondary part (lens, door, stand, screen), a line detail, a badge, a repeated pattern, or a status mark.
- No third colour, no gradients, shadows, opacity or outlines around fills. If the user gives brand colours, swap the two values and keep the roles; the pair needs clear lightness contrast with each other and with the background.
- Background showing through (a cutout) is allowed sparingly as a third tone.

**Shape language**
- No sharp geometric corners. The only points allowed are functional tips (pen nib, pin, speech-bubble tail, arrowhead), and even those get a tiny radius.
- One object per icon, drawn front-on and flat. No perspective.
- Compound objects are overlapping squircles in the same colour (a camera is a small squircle bump behind a large squircle body).

**Definition for objects that are not self-evident**
- Sort each icon before drawing. Some objects are recognisable from silhouette alone (heart, bell, drop, magnifier, envelope, speech bubble): give these one dark detail and stop. Others are just a box until their details appear (calendar, keyboard, calculator, building, remote, TV, server): a squircle softens the outline further, so these need more definition.
- For the second kind, repeat the identifying detail 2-5 times in dark so the pattern does the work: a calendar gets its two rings plus 3-5 day cells in a grid; a building gets 4 windows and a door; a calculator gets a display and two rows of keys; a remote gets a power dot, a ring and four buttons; a TV gets a stand, and antennae and knobs if retro.
- Repeated details are small dark squircles (about 2x2) or round dots, evenly spaced with gaps of at least 1, aligned to a shared grid, and inset at least 1.5 from the body edge.
- An incomplete last row (5 days rather than 6) reads more naturally than a perfect block.
- Check the result for accidental faces: two dots above a line or curve reads as eyes and a mouth. Add or move details until it no longer does. (Three dots in a row, as in a typing bubble, is safe.)
- This is the exception to the "fewer details" rule, not a licence for clutter: still one object, still two colours, and dark stays under roughly a third of the ink.

**Line details**
- Lines are the dark colour, `stroke-width="1.25"` (1 for dense icons), `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`. Use them for checkmarks, arrows, envelope flaps, stands, antennae, dashes, sparkles, text lines.
- A round dot is a zero-length line with the same attributes: `M7 6h.01`. Use this for eyes, buttons, typing dots and the dot of a question mark so every dot matches the line weight.
- Bend lines with curves rather than hard angles where the meaning allows.
- Line-only icons are fine: use light for the main path and dark for nodes/endpoints so both colours still appear.
- Keep at least 0.75 units between separate marks so gaps survive at small sizes.

**Recurring conventions** (keep identical across a set)
- Off / disabled / remove: a dark diagonal line from (1.4,1.4) to (12.6,12.6) over the light object.
- Add / badge: a small dark plus, check or dot in the bottom-right corner, overlapping the body.
- Selection / dashed bounds: dark dashed squircle line, dash about 1, gap about 1.25, round caps.
- Overlap: where two bodies overlap, the front one is dark and the back one light (two chat bubbles: back light, front dark).
- Motion or sparkle: 2-3 short dark ticks or a four-point curved star, never more.

## Reusable parts

All dark lines below use the line attributes above. `S(...)` means `squircle(...)`.

- **Question mark** centred on `cx`, top at `y` (about 3 wide, 6 tall): `M{cx-1.5} {y+1.5}a1.5 1.5 0 1 1 2.3 1.27c-.5.3-.8.65-.8 1.23` plus dot `M{cx} {y+5.6}h.01`.
- **Speech bubble**: light `S(.5, 1, 13, 10.5)` plus light tail `M3 10.5h4L3.6 13.2c-.3.25-.7 0-.65-.4z`. Content is centred on (7, 6.25).
- **Flat TV / monitor**: light screen `S(.5, 1.25, 13, 9.75)` plus dark stand line `M4.25 13h5.5M7 11v2`. Screen content is centred on (7, 6.1).
- **Play triangle** (dark fill, centred near (7.4, 6.25)): `M5.6 4.6c0-.6.65-.95 1.15-.65l2.9 1.75c.5.3.5 1 0 1.3l-2.9 1.75c-.5.3-1.15-.05-1.15-.65z`.
- **Face**: light squircle head; eyes are two dark dots about 3.5-5 apart, placed slightly above centre; the mouth is one short dark line whose shape sets the mood (upward curve = happy, slanted straight line = unsure, wave = confused, downward curve = sad). One brow arc over one eye adds scepticism. Keep to eyes + mouth + at most one extra mark.

## Examples

- Mail: light `S(.5, 2, 13, 10)`; dark line `M3.4 5.4 6.1 7.4c.55.4 1.25.4 1.8 0l2.7-2`.
- Camera: light `S(4.25, 1, 5.5, 4)` + light `S(.5, 2.75, 13, 10.5)`; dark lens `S(4.4, 5.4, 5.2, 5.2)`.
- Calendar: light `S(.5, 1.5, 13, 12)`; dark rings `M4 .75v2.25M10 .75v2.25`; five dark cells `S(x, y, 2, 2)` at (2.75,6), (6,6), (9.25,6), (2.75,9.25), (6,9.25).
- Building: light `S(2, .5, 10, 13)`; four dark windows `S(x, y, 1.8, 1.8)` at (4.1,3), (8.1,3), (4.1,6.2), (8.1,6.2); dark door `M5.75 13.5v-2a1.25 1.25 0 0 1 2.5 0v2z`.
- Face with question: light head `S(.5, 3.5, 10, 10)`; dark eyes `M3.75 7.75h.01M7.25 7.75h.01`; dark mouth `M4.4 10.7 6.6 10.2`; question mark at cx=11.5, y=.75.
- Confused face: light `S(.5, .5, 13, 13)`; eyes `M4.5 6.25h.01M9.5 6.25h.01`; brow `M8.3 3.9c.8-.5 1.7-.5 2.4 0`; wavy mouth `M4.6 9.9c.8-.6 1.6.6 2.4 0s1.6.6 2.4 0`.
- Chat bubble: speech bubble + dark lines `M4.25 5h5.5M4.25 7.5h3`.
- Typing bubble: speech bubble + dots `M4 6.25h.01M7 6.25h.01M10 6.25h.01`.
- Question bubble: speech bubble + question mark at cx=7, y=3.2.
- Two chat bubbles: light `S(.5, .5, 9.5, 7.75)` with light tail `M2 7h3.5L2.5 9.4c-.25.2-.6 0-.55-.35z`; dark `S(5, 5.5, 8.5, 6.75)` with dark tail `M12 11.5H8.6l2.9 1.9c.3.2.65-.05.6-.4z`.
- TV with play: flat TV + play triangle.
- TV casting: flat TV + dark `M2.75 8.75h.01M2.75 6.2A2.55 2.55 0 0 1 5.3 8.75M2.75 3.6A5.15 5.15 0 0 1 7.9 8.75`.
- TV off: flat TV + the off slash.
- Retro TV: light `S(.5, 4, 13, 9.5)`; dark antennae and knobs `M7 4 4.5 1M7 4l2.5-3M11.4 7.25h.01M11.4 10.25h.01`; dark screen `S(2.25, 5.75, 6.75, 6)`.
- Remote: light `S(3.75, .5, 6.5, 13)`; dark dots `M7 2.6h.01M5.9 9.5h.01M8.1 9.5h.01M5.9 11.4h.01M8.1 11.4h.01`; dark ring `circle cx=7 cy=6 r=1.5`, stroke only.

## Workflow

1. **Pin down the concept.** For each icon, name the object and what identifies it. Decide whether it is self-evident or box-like, which part is light (the mass) and which is dark (the identifying detail or pattern). For a set, list all icons first, group them into families (faces, bubbles, screens) and reuse the same base part within a family so they match. If a request is ambiguous ("question face"), draw the two most likely readings and say so.
2. **Draw** with a short Python script that includes the `squircle` helper and writes one SVG per icon. Light silhouette first, filling the grid; then dark accents.
3. **Render and look.** Build a contact sheet (each icon scaled about 3-4x on a `#F7F7F9` tile, about 6 per row), convert to PNG (`rsvg-convert` or `cairosvg`) and view it. Check:
   - bodies read as squircles: no visible straight-then-arc joins, no plain rounded rectangles;
   - recognisable at a glance with no label, and still readable at 24px; if you would need the filename to tell what it is, add definition;
   - no accidental faces, and intended faces show the intended mood;
   - same optical size, weight and corner tension as its neighbours;
   - no shape crossing the 0.5 margin, no gaps under 0.75;
   - both colours present, light clearly dominant.
   Fix and re-render until the sheet looks like one family.
4. **Deliver** one clean `.svg` per icon, named in kebab-case with the family first (`chat-question.svg`, `tv-off.svg`), zipped when there are more than a few, plus the preview sheet. List what each icon is, in sheet order, and name any that read weakly. If the user wants themeable icons, replace the two hex values with `currentColor` for dark and a CSS variable for light, and say so.

## Common mistakes

- Falling back to `<rect rx>` because it is quicker. It is the one thing that makes an icon look off-style.
- Mixing corner tensions (`k`) or mixing squircles with rounded rectangles in one set.
- Outlining the light shape with a dark stroke. Dark is for parts and details only.
- Too much dark. Past about a third of the ink, the icon turns heavy.
- Shrinking the drawing to be safe. Small artwork floating in the tile is the most visible inconsistency in a set.
- Under-defining box-like objects. A squircle with one dot is not a calendar; give it rings and several day cells.
- Over-detailing self-evident objects. For those, remove the extra detail and check whether the icon still reads; it usually does.
- A mouth that sets the wrong mood. A downward curve reads as sad, not puzzled; check faces against the intended expression.