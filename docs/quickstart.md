# Blue Agent Quickstart

## Install

```bash
cd blue-agent
npm install
```

## Run web app

```bash
npm run dev --workspace apps/web
```

## Build / verify

Run the gate from `apps/web`, all three, before any push:

```bash
cd apps/web
npx tsc --noEmit && npm test && npm run verify:build
```

⚠️ **Use `verify:build`, never plain `npm run build`.** `verify:build` writes to
`.next-verify/` via `NEXT_DIST_DIR`, so a running `next dev` keeps its own `.next/`. Plain
`next build` shares `.next/` with the dev server and corrupts it into a fullscreen-logomark
page — that has happened four times. Same reason: never `rm -rf .next` while dev is running.

The gate also needs `packages/skill/dist`, which no checkout contains (gitignored). Build it
once from the repo root: `npm run build:skill`. Do **not** wire that into a `prepare` script —
it has twice put CI and production deploys red, because Vercel runs root hooks but never
installs `packages/*`.

## Environment variables

Copy `.env.example` to `.env` and fill in. The one that is genuinely required:
- `VIRTUALS_API_KEY` — the only LLM gateway (`compute.virtuals.io/v1`)
- `BASESCAN_API_KEY` — on-chain reads

`.env.example` is the live list. Note that quoting matters: one unmatched `"` makes the file
silently skip every variable after that line.

## What to check

- `/chat` — Blue Chat, the wallet → credit → chat core
- `/hub` — the x402 tool catalog
- `/track` — Blue Hood arrow scoreboard

Routes named in earlier versions of this file (`/code`, `/market`, `/rewards`) no longer
exist. `ls apps/web/src/app` is the current answer.
