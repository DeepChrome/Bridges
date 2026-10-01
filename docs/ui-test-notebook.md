# UI test: ink on paper

*Written for: the owner, judging a design direction for Bridges. A demo behind
Settings → UI test; switching it off restores the app exactly.*

## The brief, as understood

- **Subject:** Bridges, a Russian course built on the owner's own decks, told
  through Teddy and his family, every unit working towards a real video.
- **Audience:** an adult English speaker studying Russian on a phone, most
  days, a few minutes at a time.
- **Primary job:** get them into today's work quickly, and make progress feel
  like something they are filling in rather than a score being kept.

## Round two (2026-09-30)

The first round was «Тетрадь», the Russian school exercise book: 5 mm grid
paper, a red margin rule, violet school ink, the teacher's handwriting, and a
green blackboard in dark mode. The owner's verdict on his phone:

- the grid squares made the background ugly, and the margin rule read as a
  stray pink line down the left of every screen;
- the handwriting at the top of the path was very hard to read;
- the colours were "not awful, but maybe not good", and the blackboard green
  "a little too vomity";
- **the contrast was nice, and the text — the serif — was nice.**

So the costume came off and what he liked stayed. What is left of the
exercise book is its **ink on plain paper**, the date at the top of the page,
and the teacher's red mark at the end of a lesson.

## Tokens

### Colour — paper (light)

| name | hex | role |
|---|---|---|
| Page | `#F5F5F2` | a neutral off-white, deliberately not cream |
| Sheet | `#FFFFFF` | grouped surfaces |
| Ink | `#233A8B` | dark blue school ink: the brand, primary actions |
| Red pen | `#C42B3B` | wrong answers, the mark out of five |
| Text | `#1C1D22` | body |
| Pencil | `#5F626B` | secondary text |

### Colour — night (dark)

| name | hex | role |
|---|---|---|
| Night | `#12151D` | ink-dark blue page, not green |
| Sheet | `#1A1E28` | grouped surfaces |
| Lamp | `#F2C14E` | warm gold: the brand, primary actions |
| Text | `#F0F1F4` | body |
| Pencil | `#A2A7B5` | secondary text |
| Red pen | `#F28B96` | wrong answers, the mark |

Every pair clears its minimum: text 4.5:1 on the surface it sits on, accents
3:1 (night's lamp gold is 10.9:1 on the page).

### Type

**PT Serif** (ParaType, 2010) for everything: drawn for the Russian
Federation's public type project, so its Cyrillic is the native half, and
stress marks and ё sit properly. One family; hierarchy is size and weight.
Labels are written in sentence case rather than tracked-out capitals.

### Layout

The app's own layouts, unchanged: this is a skin, not a redesign of any
screen. No shadows (paper on paper does not float), small corners (4 for a
sheet, 6 for a control), so a control and a container differ in shape as well
as colour.

### The one loud thing

The top of the path is headed as a Russian pupil heads each day's page — the
date in words, «Тридцатое сентября», and under it «Классная работа» (class
work) — now set in the serif rather than a handwriting face, with the English
date small beneath. A press reads it aloud. A month of it and every month's
name and the ordinals to thirty-one are read without trying.

At the end of a scored lesson the result is a mark out of five in red pen,
circled by hand: **5** at 90 %, **4** at 75 %, **3** below — never a 2.

## Review against the defaults

- *Cream + serif + warm accent.* The page is a neutral `#F5F5F2`, the accent a
  cold dark-blue ink; no terracotta.
- *Near-black with one acid accent.* The night page is a blue ink-dark, not
  `#111`, and its gold is a warm lamp rather than a neon.
- *SaaS card kit.* No shadows; two radii by role.
- *Template chrome.* All-caps eyebrows are removed across the skin.
