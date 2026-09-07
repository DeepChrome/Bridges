# Stress feedback: feasibility (ROADMAP P7.1) — 2026-09-07

Could Bridges tell a learner they stressed the wrong syllable? One page, so the
owner can decide whether to spend the two to four weeks Phase 7 would take.

## What "stress correct" would mean

96.3 % of the forms in the lexicon carry an expected stress position in
`paradigm.accented` (the combining acute). So for almost every word the learner
says there is an answer key: which vowel should carry the stress. The question is
only whether the phone can hear which vowel *did*.

## What the recogniser gives us today

Nothing about stress. On-device recognition returns a transcript, not timings or
pitch. It normalises away exactly the thing we want to measure — a learner saying
«пи́сать» for «писа́ть» gets the same transcript.

## How it could be done

1. **Forced alignment + prosody.** Record the attempt (the app already has the
   audio while recognising; keeping it is a change of policy — today audio never
   leaves the device and is never stored). Send the clip and the target text to a
   server that aligns phonemes to time (a wav2vec2 CTC aligner, or WhisperX's
   alignment head), then measures per-vowel duration, energy and pitch with
   librosa. In Russian the stressed vowel is longer and louder and the unstressed
   ones reduce; a classifier over those three features per vowel picks the
   stressed one. Latency 2–4 s on a small CPU container. Runs on Fly.io or
   Railway (a Worker cannot do signal processing): $5–10 a month.
2. **Vowel-reduction heuristic without alignment.** Whisper with word timestamps
   gives word boundaries; within a word, an energy envelope's peak is a rough
   stress proxy. Cheaper, ~60–70 % on published attempts, not good enough for
   feedback that tells someone they are wrong.
3. **A dedicated model.** Train a stress classifier on the owner's own 13k
   recordings (each has a known stress from the lexicon). Real work; weeks; the
   payoff is on-device inference. Not for a spike.

## What would have to be true before starting

- The owner accepts audio leaving the device for this feature (opt-in, per
  attempt, labelled). Today's doctrine says it does not.
- Accuracy against his own judgment ≥ 80 % on 20 of his recordings (P7.2). Below
  that, feedback would be wrong one time in five — worse than no feedback.
- The verdict stays advisory: "stress may be on the wrong syllable" with the
  expected form shown, never a grade.

## Recommendation

Not now. The speaking feature's larger error sources (a dropped word, a wrong
ending) are what Say already catches, and Talk gives grammar feedback. Stress is
the next-order problem, and option 1 is a server, a policy change and two weeks
for a feature whose accuracy is unproven. Revisit after the owner has used Say
for a month and can say whether stress errors are what he actually makes.
