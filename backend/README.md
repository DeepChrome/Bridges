# The Bridges Worker

Model routes — `POST /v1/feedback`, `/v1/talk`, `/v1/translate`, `/v1/explain`
and `/v1/tutor` (CLAUDE.md §30d, §30f, §30ap, §30aw) — and `POST /v1/register`,
where an install gets its token. It holds the Anthropic key so the app never
does. (`/v1/task`, the chapter task, was removed on 2026-09-28.)

```
npm test                       # 56 checks in plain Node, fake KV, fake upstream
npx wrangler dev               # needs .dev.vars (copy .dev.vars.example)
npx wrangler deploy            # needs $env:CLOUDFLARE_API_TOKEN
node eval/run.js               # the feedback prompt against the real API
node eval/run_talk.js          # the conversation prompt
```

## Who may call it

Every model request carries `Authorization: Bearer <token>`. Three kinds of token:

- the owner's, the `APP_TOKEN` secret on the Worker (`wrangler secret bulk`);
- a per-user token (ROADMAP P8.4), a KV record `user:<token>` holding
  `{ id, caps: { feedback, talk }, created, revoked }`, minted by hand;
- an install's own (ROADMAP 13.39): the same record, minted by `POST /v1/register`
  with no token at all. A public build ships no token and asks here on first
  use. Caps are `REGISTERED_CAPS` in `src/index.js` (feedback 100, talk 60);
  registrations are limited to `REGISTER_IP_CAP` (5) an address a day and
  `REGISTER_DAILY_CAP` (100) a day, and every registered install together to
  `GLOBAL_DAILY_CAP` model calls a day (`wrangler.toml`, 1,500) — the owner's
  token is outside that ceiling. Ids are `app-<random>`, never a piece of the
  token.

```
node tools/user.mjs add ann --feedback 100 --talk 12   # prints her token once
node tools/user.mjs revoke <token>
node tools/user.mjs list
```

Counters are per user per UTC day (`count:<day>:<id>`, `talk:<day>:<id>`, and
`all:<day>` for the ceiling); a user's `caps` override `DAILY_CAP` and
`TALK_DAILY_CAP`. The token log carries the id. A revoked or deleted record
refuses with 401 from the next request — and an install answered 401 forgets its
token and registers again, so revoking a registered install only costs it a
round trip; the ceiling and the per-address limit are what bound a stranger.
Nothing else is stored about a user.
