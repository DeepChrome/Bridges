# UI test: «Тетрадь» (the exercise book)

*Written for: the owner, judging a design direction for Bridges. A demo behind
Settings → UI test; switching it off restores the app exactly.*

## The brief, as understood

- **Subject:** Bridges, a Russian course built on the owner's own decks, told
  through Teddy and his family, every unit working towards a real video.
- **Audience:** an adult English speaker studying Russian on a phone, most
  days, a few minutes at a time.
- **Primary job:** get them into today's work quickly, and make progress feel
  like something they are filling in rather than a score being kept.

## Where the look comes from

Every Russian schoolchild writes in a **тетрадь**: a thin exercise book of
5 mm grid paper ("в клетку") with a red margin rule down the left, filled in
violet school ink. Each day's page starts the same way, written by hand at the
top: the date in words — «Тридцатое сентября» — and under it «Классная работа»,
class work. The teacher marks in red: ticks, a circled grade out of five, a
word of praise in the margin.

That is the design. Not a Russian-flavoured coat of paint (no onion domes,
no constructivist red-and-black, no matryoshkas) but the actual material a
learner of Russian would be handed on their first day in a Russian school.
It is also exactly what this app is: a place you fill in, a page a day.

Dark mode is the other thing in every Russian classroom: **the blackboard**
(школьная доска) — deep green, chalk white, yellow chalk for what matters.

## Tokens

### Colour — paper (light)

| name | hex | role |
|---|---|---|
| Paper | `#FAFBF8` | the page; a cool white, not cream |
| Клетка | `#DCE5EE` | the 5 mm grid, drawn faintly |
| Violet ink | `#3F3A9E` | school ink: the brand, primary actions, the handwriting |
| Red pen | `#C8243A` | the margin rule, the teacher's marks, wrong answers |
| Graphite | `#23262E` | body text |
| Pencil | `#646A76` | secondary text |

Correct answers stay a green (`#27704E`) — the red pen marks both, but on a
phone red and green are what "wrong" and "right" mean, and the app already
teaches that.

### Colour — board (dark)

| name | hex | role |
|---|---|---|
| Board | `#1D3A33` | the page |
| Board, worn | `#264A41` | raised surfaces |
| Chalk | `#EEF1E8` | text |
| Chalk, smudged | `#B9C6BC` | secondary text |
| Yellow chalk | `#F0D35A` | the brand, the handwriting |
| Pink chalk | `#F09AA6` | wrong answers, the margin rule |

### Type

- **PT Serif** (ParaType, 2010) for everything read: headings, body, the
  Russian. It was drawn for the Russian Federation's public type project, so
  its Cyrillic is the native half, not an afterthought: stress marks and ё
  sit properly. A serif also suits a book; body gets a looser line-height
  than the sans had.
- **Caveat** for the teacher's hand and nothing else: the date and «Классная
  работа» at the top of the path, the grade at the end of a lesson. Two
  families, clearly distinct, and the handwriting is rare enough to mean
  something when it appears.
- **No all-caps labels.** The app's tracked-out small capitals ("VERBS",
  "THE RULE") become sentence case in this skin; a school book labels things
  in words.

### Layout

```
 ┌─────────────────────────────────┐
 │ ┊  Тридцатое сентября            │  ← the date, in the teacher's hand
 │ ┊      Классная работа           │
 │ ┊                                │
 │ ┊  [ Continue: First Words ]     │  ← content hangs off the margin
 │ ┊   ○──○──○  the path            │
 │ ┊                                │
 └─────────────────────────────────┘
   ↑ red margin rule; grid under everything
```

Content is **left aligned against the red margin**, as writing in a тетрадь
is; the grid sits under every screen, faint enough that it reads as paper
rather than as a pattern. Surfaces are sheets laid on the page: paper-white,
a graphite hairline, a 4–6 px corner, **no drop shadow** — paper on paper
does not float. Controls keep the app's pressed-into-an-edge motion, in ink.

### Principles

1. **One memorable thing:** the handwritten date and «Классная работа» at the
   top of the path, in Russian, every day. It is also a lesson: after a month
   the learner can read every month's name and the ordinals to thirty-one.
2. **The teacher's red pen is rare.** It marks the margin, a wrong answer and
   a grade — nothing decorative.
3. **Paper, not cards.** No shadows, small corners, the grid showing through.
4. **Everything else stays quiet**: one serif, sentence case, the app's own
   layouts untouched.

## Review against the defaults

- *Cream + serif + terracotta (the commonest generated look).* The paper is a
  cool white `#FAFBF8`, and the accents are violet ink and a cold red pen —
  the colours of a real exercise book, not of a warm editorial page. **Changed
  from the first idea**, which was an off-white "aged paper": that is the
  cream tell with a story attached.
- *Broadsheet hairlines and zero radius.* The grid is the paper's own ruling,
  not column rules, and corners stay slightly rounded like a cut sheet.
- *SaaS card kit.* Shadows go entirely; radii drop to 4 (sheets) and 6
  (controls), so the two are told apart by more than colour.
- *Template chrome* — all-caps eyebrows, monospace labels. Removed across the
  skin rather than added.
- *A Russian theme in general* tends to reach for red-and-black
  constructivism or folk ornament. **Rejected**: a costume, not a material.
  The exercise book is what the learner would actually hold.

## Grades

A finished lesson gets a mark in red, circled, as a Russian teacher writes
it: **5** at 90 % or more, **4** at 75 %, **3** below. No 2 — a demo that
discourages somebody for trying is not one worth showing.
