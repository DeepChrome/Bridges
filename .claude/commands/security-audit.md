---
description: Audit what a stranger could do to the app, the Worker and the bill
---

Audit $ARGUMENTS (default: the whole product) as a security engineer would
before strangers get the app. Read CLAUDE.md §30d and §30be first.

Bridges has no accounts and no server-side learner data; the attack surface
is small and specific. Look at what is actually there:

- **The Worker** (`backend/`): every route's auth, what an unauthenticated
  caller can do (`/v1/register`), whether a token can raise its own caps or
  plan, whether the per-install, per-address and global caps bound the
  Anthropic bill, and whether a failure refunds or double-charges. Check
  `BETA_SELF_PLAN` and say plainly whether it is still on.
- **Prompt injection**: learner text and model replies reach other prompts
  (the tutor's notes, `st.misses`). Can a learner make the Worker spend
  more, leak its system prompt, or return something the app renders badly?
- **The APK**: secrets compiled in (`EXPO_PUBLIC_*`, tokens, keys), debug
  flags, permissions beyond what is used, and what `release_check.mjs` says.
- **The repo**: anything secret tracked or in history (`git log -p` for key
  patterns), `.gitignore` coverage of `.env`, `.dev.vars`, keystores.
- **Data on the phone**: backups and exported files — what they contain and
  where they go.

Rate each finding by what it costs if exploited (money, the owner's data,
the store listing, nothing much), with a realistic way it would happen. Do
not report theory with no path to harm. Never print a secret's value; name
where it is.

Report first, most severe at the top. Fix only what the owner approves,
without breaking existing behaviour, and run the Worker tests (`cd backend
&& npm test`) after any change there.
