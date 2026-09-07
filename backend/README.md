# The Bridges Worker

Two routes, `POST /v1/feedback` and `POST /v1/talk` (CLAUDE.md §30d, §30f). It holds
the Anthropic key so the app never does.

```
npm test                       # 34 checks in plain Node, fake KV, fake upstream
npx wrangler dev               # needs .dev.vars (copy .dev.vars.example)
npx wrangler deploy            # needs $env:CLOUDFLARE_API_TOKEN
node eval/run.js               # the feedback prompt against the real API
node eval/run_talk.js          # the conversation prompt
```

## Who may call it

Every request carries `Authorization: Bearer <token>`. Two kinds of token:

- the owner's, the `APP_TOKEN` secret on the Worker (`wrangler secret bulk`);
- a per-user token (ROADMAP P8.4), a KV record `user:<token>` holding
  `{ id, caps: { feedback, talk }, created, revoked }`.

```
node tools/user.mjs add ann --feedback 100 --talk 12   # prints her token once
node tools/user.mjs revoke <token>
node tools/user.mjs list
```

Counters are per user per UTC day (`count:<day>:<id>`, `talk:<day>:<id>`); a user's
`caps` override `DAILY_CAP` and `TALK_DAILY_CAP`. The token log carries the id. A
revoked or deleted record refuses with 401 from the next request. Nothing else is
stored about a user.
