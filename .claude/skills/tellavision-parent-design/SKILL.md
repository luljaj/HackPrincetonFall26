---
name: tellavision-parent-design
description: The visual design language of the Tellavision parent view (Figma file "dora-academy", frames "Not selected" and "Selected parent view"). Use this whenever designing, mocking up, wireframing, building or restyling anything for the parent side of Tellavision / Dora Academy — new Figma frames, parent dashboard pages in apps/web, progress or insights screens, cards, chips, stat tiles, empty states — even if the user only says "make another screen", "add a progress view", "match my frames" or "keep it consistent". Also use it to review a parent screen for consistency.
---

# Tellavision parent view design language

This captures the look of the two parent frames the designer built in Figma, so new screens look like they came from the same hand. The source of truth is the Figma file; this skill is a snapshot of it.

- Figma: `https://www.figma.com/design/0AM6nLa6FXud2qYt5dTM33/dora-academy` — "Not selected" is node `14:78`, "Selected parent view" is node `14:312`.
- Screenshots: `assets/not-selected.png`, `assets/selected.png`. Look at both before designing; they say more than the tables below.
- CSS tokens ready to paste: `references/tokens.css`.

If the Figma tools are available and the task is to add or change frames, re-read those two nodes first, because the designer keeps editing them. Where the file and this skill disagree, the file wins; say what changed.

## The feel

Calm, soft and a little playful: a near-white page, big pillowy grey cards with very round corners, one strong yellow, and chunky black headlines. It reads like a kids' streaming home screen that a parent happens to be looking at, not like an analytics dashboard. Keep that. Things that break it: thin grey borders everywhere, small radii, dense tables, more than one accent color, drop shadows with an offset.

## Tokens

### Color

| Role | Value | Used for |
|---|---|---|
| Page | `#FDFDFC` | Frame background |
| Yellow (the only accent) | `#FFDE36` | Play button, Parent View badge, top "Focused on" chip, selected outline |
| Ink | `#000000` | Headlines, body, chip text |
| Wordmark ink | `#161616` | "Tellavision" only |
| Badge text | `#696969` | Text on the yellow Parent View badge |
| Muted text | black at 44% | Section labels ("Previously watched"), stat labels |
| Faint text | black at 30% | Empty-state text, input placeholder |
| Card grey | `#D9D9D9` | Show cards |
| Panel grey, empty | `#D9D9D9` at 48% | Insights panel before a show is picked |
| Panel grey, selected | `#E7E7E7` | Insights panel after a show is picked |
| Tile | white at 50% | Stat tiles sitting on the panel |
| White | `#FFFFFF` | Chips, prompt bar |
| Hairline | black at 10%, 1px | Border on badge, chips, tiles, prompt bar, Play button (selected) |
| Divider | black at 6%, 1px | The short vertical rule inside chips |
| Icon blue | `#1B18E9` with a light periwinkle second tone (about `#9DB8FF`) | Duotone icons, sparkle |

Yellow means "this is the thing to press or the thing in focus". Blue appears only inside icons. Do not add red, green or amber status colors; state is shown with wording and icons.

The file also has a variable collection called "Little Planet · Foundations" (cream, orange, forest, lilac…). These frames do not use it. Ignore it unless the designer says otherwise.

### Type

Two families, both from Google Fonts. Line height is 135% everywhere, letter spacing 0.

| Style | Font | Size | Used for |
|---|---|---|---|
| Page title | Sora Bold | 36 | "Sam's Learning Moments" |
| Card title | Sora Bold | 32 | Show names on cards |
| Section title / stat number | Sora Bold | 24 | Title inside the panel, the big number in a tile |
| Wordmark | Sora Bold | 20 | "Tellavision" |
| Label large | Lexend Medium | 16 | "Parent View", "Focused on" |
| Body | Lexend Medium | 14 | Card meta, button text, section labels, empty state |
| Small | Lexend Medium | 12 | Chip subject, stat label |
| Tiny | Lexend Medium | 11 | Chip score |
| Placeholder | Lexend Regular | 14 | Prompt bar placeholder (the only Regular weight) |

Sora is for anything a parent should read first; Lexend is for everything else. No italics, no uppercase labels, no third family.

### Shape

| Radius | Used for |
|---|---|
| 48 | Show cards and the insights panel |
| 24 | Prompt bar (full pill at 40 tall) |
| 16 | Stat tiles |
| 14 | Play button |
| 11 | Parent View badge |
| 7 | "Focused on" chips |
| 3 | Tiny icon button (filter) |

Every corner uses Figma corner smoothing at 100% (the iOS squircle), except the Play button, which is a plain radius 14. In `apps/web` use the `sq` class with the Figma radius, e.g. `class="sq [--r:48px]"`; it falls back to a plain radius in browsers without `corner-shape`. The selected tab + panel outline is drawn by `app/parent/_components/tab-panel-outline.tsx`, whose curves are copied from the Figma "Union" node.

Radius scales with size: the bigger the object, the rounder. A new element takes the radius of the existing element closest to it in size.

### Shadow

All shadows are glows: offset 0,0, no spread.

| Shadow | Used for |
|---|---|
| `0 0 92.5px` black 10% | Cards and the panel (a wide, barely-there halo) |
| `0 0 13.7px` black 10% | Plain chip |
| `0 0 13.7px` yellow 100% / 55% | Rank 1 / rank 2 chip glow |
| `0 0 9.7px` black 10% | Play button when its card is selected |

### Layout

- Frame: 1280 × 832, desktop only. No phone frames.
- Side margin: about 40. Content spans 41 → 1251.
- Vertical rhythm on the home frame: brand block at y 41, page title at about 140, section label at 210, card row at 243, insights panel at 544 running to about 803.
- Cards sit 30 apart. Panel sits 18 below the card row.
- Inside a card: 28 left, 35 bottom, 37 right. Content hugs the bottom-left.
- Inside the panel: 34 from the left edge to content.

## Components

**Brand block** (top-left). "Tellavision" wordmark, then 10 below it the Parent View badge: yellow fill, hairline border, radius 11, padding 4/9, a 20px duotone family icon, and "Parent View" in Lexend Medium 16 `#696969`.

**"Focused on" list** (top-right, 136 wide). Right-aligned "Focused on" label, then chips stacked 7 apart, then a tiny filter icon button bottom-right (`#ECECEB`, hairline, radius 3). Each chip is 136 × 22, radius 7, hairline border, padding 2/7: subject icon (14–16) + subject name (12), a 6%-black vertical divider, a 12px lightning icon, and a score like `7/10` (11). Rank is shown by how yellow the chip is, strongest first:
1. solid yellow with a full yellow glow
2. white with a 23% yellow wash and a 55% yellow glow
3. plain white with the grey glow

**Show card.** Grey `#D9D9D9`, radius 48, halo shadow. The most recent show is wide (427 × 283) and has a Play button; older shows are square (283 × 283) with no button. Show name in Sora 32 with "Watched 1 day ago" in Lexend 14 directly under it, bottom-left. The grey is a placeholder for show artwork.

**Play button.** Yellow, radius 14, about 98 × 40, padding 10, "Play" in Lexend Medium 14 black, centered. This is the only filled button style. There is one per screen region at most.

**Insights panel, empty.** 1210 × 259, panel grey at 48%, hairline border, radius 48, halo. Centered: a 32px duotone icon, then 21 below it "Select a show to view insights" in Lexend 14 at 30% black. Reuse this exact recipe for any empty state: one icon, one short sentence, nothing else.

**Selected state.** Picking a show merges its card and the insights panel into one continuous shape: the card becomes a tab on top of the panel, joined with a concave curve, all wrapped in a single 4px yellow outline with fill `#E7E7E7`. The show's artwork fades in across the top of the tab. The card's text moves to the top of the tab, the Play button gains a hairline border and a small glow, and the other cards shrink to half height (283 × 141) so the panel can grow up beside them. Selection is never shown with a checkmark or a color change alone — it is shown by the shape joining up.

**Stat tile.** 160 × 82, white at 50%, hairline border, radius 16, padding 8/16, 18 gap. A 36px duotone icon on the left; on the right the number in Sora 24 over a two-line label in Lexend 12 at 44% black. Tiles stack vertically 8 apart. Existing ones: "Episodes watched", "Questions answered", "Answered after help".

**Prompt bar.** Bottom-right of the selected panel, 393 × 40, white, hairline border, radius 24, padding 8/16. Blue sparkle icon, placeholder in Lexend Regular 14 at 30% ("Make Sam learn more about addition..."), and an enter-arrow icon on the right.

**Icons.** Two kinds. Feature icons (family, chart, TV, speech bubbles, puzzled face) are chunky duotone in the icon blue and periwinkle, 20–36px. Utility icons (leaf, math, lightning, filter, enter arrow) are small solid black glyphs, 12–22px. Don't mix in outline icon sets.

## Designing a new screen

1. Start from the home frame's skeleton: brand block top-left, "Focused on" top-right, Sora 36 page title, a muted section label, then content.
2. Build content out of the existing pieces first — card, panel, tile, chip, prompt bar. Only invent a component when none fits, and derive it from the nearest one (same border, same radius family, same glow).
3. Put new detail inside the selected panel rather than on a new page where possible. The panel has a large empty area to the right of the stat tiles; that is where charts, timelines and per-subject progress belong.
4. Charts follow the same language: thick rounded strokes and bars, yellow for the highlighted series, the icon blue for a second series, black-at-10% gridlines used sparingly, labels in Lexend 12 at 44% black. No chart borders or legends in boxes.
5. Use one yellow action per region and keep every other control quiet (white with a hairline).
6. Write copy the way the frames do: the child's name in headings ("Sam's Learning Moments"), short plain phrases, sentence case.

In `apps/web`, build with the shadcn components in `components/ui` (Button, Badge, Card, Empty), which are already themed to this look through the semantic tokens (`bg-primary` is the yellow, `text-muted-foreground` is black at 44%); follow the `shadcn` skill's rules and add more components with `npx shadcn@latest add <name>`. Draw any new icon with the `flat-duotone-icons` skill (dark `#1B18E9`, light `#9DB8FF`); existing ones are in `app/parent/_components/tv-icons.tsx`. Never put a gradient or color wash where show artwork belongs: use the real image (`art` in `lib/parent/shows.ts`, files under the git-ignored `public/media/shows/`) or leave the plain grey card.

In Figma, build with auto layout and name layers by what they are (the existing frames are mostly "Frame 12"; don't copy that). In code, the app is `apps/web` with Tailwind v4 — put these values in the `@theme` block of `app/globals.css` (see `references/tokens.css`) rather than hard-coding hex values in components, and load Sora and Lexend with `next/font/google`.

## Before calling it done

Put the new screen next to `assets/selected.png` and check:

- Only Sora Bold and Lexend Medium (Regular only for placeholders), at sizes from the table.
- Yellow is the only accent, and it marks an action or the focused thing.
- Big surfaces have radius 48 and the wide halo; nothing has an offset shadow.
- Borders are black-at-10% hairlines, never solid grey lines.
- It still reads as a calm home screen at arm's length, not a dashboard.
