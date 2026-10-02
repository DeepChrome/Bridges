---
description: Review recent changes as a second engineer would, before a build goes to the phone
---

Review the changes in $ARGUMENTS (default: every commit since the last
`beta.N` commit — find it with `git log --oneline`). Act as a senior engineer
who did not write this code and has to maintain it.

Read CLAUDE.md first; Part III's traps are the checklist, not general advice.

For each change, check:

- **Does it do what the commit says?** Trace the real path, not the diff alone.
- **What else reads or writes the same thing?** A second place to keep a fact
  in step (§22), a route not registered on the stack it is called from (§23),
  a step or label the rest of the app names differently.
- **Learner state** (rule 20.4): could this lose, double or misread a review,
  a card or progress? A re-cut moving lesson indices? An updater run twice?
- **Async and audio**: an await a newer action can overtake; a player, timer
  or recognizer left running after its screen closes.
- **Tests**: does a test exercise the behaviour, and would it fail if the
  change were reverted? A mocked navigator or a sampled draw proves less
  than it looks.
- **Obsolete code** the change left behind, and copy over the cap (rule 20.7).

Run the suites §31 lists that the changes touch. Verify every finding against
the code before reporting it; drop what does not survive.

Report findings most severe first, each with the file and line, what goes
wrong, and the fix. Then fix the confirmed ones, rerun the suites and commit.
Do not refactor what works, do not rename for taste, and do not touch
anything the findings do not require.
