# Nine simulated learners over the whole route — 2026-09-11

Method: `tools/simulate.mjs --lessons 168` at seeds 1, 3 and 5, three profiles
each — nine learners through all 168 lessons, every question from the real
generators, every review through the real FSRS scheduler, the real pass mark and
its relief. Raw output in `tools/sim/2026-09-11-seed{1,3,5}.{md,json}`.

**This is the simulator, not a person.** It answers questions with a fixed
probability per profile; it cannot tell whether a sentence is idiomatic, whether
a screen reads well, or whether a scenario's questions are answerable from its
audio. Those remain open (§30l).

## What the nine did

| | quick | steady | struggling |
|---|---|---|---|
| lessons passed (of 168) | 168, 168, 168 | 161, 160, 163 | 108, 120, 117 |
| on relief (70 % from the third try) | 15–25 | 44–51 | 71–85 |
| leeches at the end | 0 | 1–2 | 5–7 |
| reviews a day | 23.6 | 27.5 | 36–37.5 |
| worst single day | 40–43 | 47–50 | 58–61 |
| days with a backlog past the cap | 0 | 0 | 0–1 |
| structural problems | 0 | 0 | 0 |

Every word a unit teaches is asked again after it is taught, in all nine runs;
none is taught and never asked.

## Against the last recorded run

`tools/sim/2026-09-10-seed1` is the same seed and the same curriculum, but it
**predates the scenario rewrite** — its passages average five lines a scene
against thirteen now — so it is a comparison of two different listening
activities rather than of two builds. With that said, everything about load
improved and nothing about it got worse:

| seed 1 | before | now |
|---|---|---|
| quick: leeches | 41 | **0** |
| quick: reviews a day | 37.7 | **23.6** |
| steady: leeches | 58 | **2** |
| steady: worst day | 97 | **47** |
| steady: backlog days | 35 | **0** |
| struggling: leeches | 96 | **7** |
| struggling: reviews a day | 55.2 | **37.5** |
| struggling: backlog days | 83 | **0** |

The struggling learner's passes moved 121 → 108 on that seed, which reads as a
regression and is not one: seeds 3 and 5 give 120 and 117 on the same build, so
the spread is 108–120 and the old number sits inside it.

## What the numbers say

**1. The pass mark is above what even the quick learner scores.** Quiz accuracy
by chapter, quick profile: .86 .79 .83 .78 .81 .79 .76 .77 .76 .78 — a mean of
.79 against a pass mark of .80. So the strongest simulated learner passes fewer
than half their lessons first time (9 of 14 in chapter 1, 3 of 13 in chapter 10)
and takes 133 retakes over the route. The relief rule is not a safety net here;
it is the main way lessons are passed. Either the mark is a percentage point or
two too high, or the quizzes are harder than the mark assumes.

**2. The struggling learner never gets above .63, and slides.** .68 .62 .60 .57
.61 .63 .57 .58 .60 .56 — the trend is down, not up, and by chapter 8 fourteen
lessons in that chapter alone need three attempts. Sixty lessons of the 168 are
never passed. This is the same open problem §30i named, now measured across the
full route rather than the first forty lessons.

**3. A scenario reinforces far fewer words than the passages it replaced.** A
scene grades its content words only when four of the five questions are right
(§30l), and against the old per-sentence shape — where each sentence was graded
by its own question — the number of times a word is asked again fell 22 % for the
quick learner and 39 % for the steady one, with the median gap between two
sightings of a word rising from 8 questions to 10–11. That is the *cause* of
most of the load improvement above: fewer words graded means fewer words due,
fewer leeches and less punishment — and also less retrieval practice. It is a
trade, not a free win.

**4. Nothing is structurally broken.** Nine runs, zero structural problems: no
lesson without questions, no word taught and never asked, no unit that cannot
be completed.

## What I would change, in order

None of this is applied. Each one is a learning-design decision (§26) and
belongs to the owner, and each names the measurement that would say whether it
worked.

1. **Sweep the pass mark the way `REVIEW_FIRST` was swept** (§30i): run
   `--lessons 168` at 75 %, 78 % and 80 % across three seeds and read lessons
   passed, retakes and leeches. Finding 1 says 80 % is set above the curve the
   app itself produces; the sweep would say where it belongs.
2. **Let a scene grade on three of five rather than four**, and measure
   `askedAgain` and leeches. Finding 3 says the current bar costs a third of the
   reinforcement; a lower bar buys some of it back without going back to grading
   a word on a question that was never about it.
3. **For the struggling learner specifically**: the quiz already tops up with
   what is due or in trouble (`quizSteps`). Widening that top-up when accuracy
   over the last few quizzes is under, say, .65 would put the words they are
   failing in front of them more often. Measure: chapter accuracy for the
   struggling profile, which currently declines from .68 to .56.

## The pass mark, swept the same day

Finding 1 said the mark was set above the app's own curve. It was, and the sweep
said the consequence was not the one I predicted — `--pass-mark`, three marks ×
three seeds × 168 lessons:

| mark | quick passed | quick retakes | steady on relief | struggling passed |
|---|---|---|---|---|
| 74 | 168.0 | **54.7** | **2.0** | 111.3 |
| 77 | 167.3 | 127.7 | 44.0 | 108.3 |
| 80 | 167.3 | 122.7 | 44.3 | 112.0 |

**Who passes barely moves** — relief was already absorbing it. What moves is the
repetition on the way, and what relief *means*: at 80 the quick learner passed
16 lessons on a rule written for a learner who is drowning, and the steady one
44. Lowering the mark does not let anyone through who was not getting through; it
stops the safety net doing the everyday work.

**PASS_MARK is 75 now.** Leeches were unchanged within noise. Re-measured at 75
across the same three seeds: quick 168/168 with 0–3 on relief (was 15–25) and
50–58 retakes (was ~130); steady 162–166 with 1–4 on relief (was 44–51);
struggling 102–118, which is what finding 2 predicts — their limit is an accuracy
of .57, and no mark fixes that.

## Not covered

Whether the Russian is idiomatic. Whether a scenario's five questions can be
answered from its audio. Whether the screens read well. The simulator cannot
see any of it, and the first two are still the open items from §30l.
