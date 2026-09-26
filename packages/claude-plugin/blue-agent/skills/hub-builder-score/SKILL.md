---
name: Blue Hub — Builder Score (retired name)
description: Do not invoke. Historical pointer only, kept so the retired name `hub_builder_score` resolves to an explanation instead of failing silently. For a real builder score use the "Blue Agent — Score" skill.
version: 2.0.0
---

# hub_builder_score — retired name, never a real tool

**There is no `hub_builder_score` on any surface, and there never was.**

This is not a casualty of the 2026-09-26 MCP cut. Verified against the previous
version of the server's `HUB_MAP`: the name was absent there too. It is one of the
seven ids the published `@blueagent/skill` package advertises that resolve to
`toolId`s present in **neither** `HANDLERS` **nor** `AGENT_TOOLS`.

Two things this file used to claim, both false:

| Claim | Reality |
|---|---|
| `hub_builder_score(handle)` is callable | No such tool. `/api/x402/builder-score` answers **501** — `builder-score` is deliberately not registered in the catalog. |
| "$0.001 per call" | It has never had a price. There is no paywall here to pay. |

It also claimed a split from `blue_score` — that `hub_builder_score` took an
X/Twitter handle while `blue_score` took GitHub/Farcaster/wallet. That split was
not real either. Both names described one free route, `/api/builder-score`, whose
handler reads `handle` / `repo` / `address` and does not care which surface asked.

## What to use instead

The **"Blue Agent — Score"** skill (`blue-score/`). It documents the one real
endpoint, its inputs, its `degraded: true` self-degrade behaviour, and its
first-party-only guard.

## Why this file still exists

Deleting it would be reasonable. It is kept for one release so that an agent or
user carrying the old name — from the published package, a cached manifest, or an
older conversation — lands on this explanation rather than on a tool call that
fails with no reason given, and so nobody re-adds the name later believing it was
dropped by mistake.

Its `description` above is deliberately written so Claude will **not** match it to
a user asking for a builder score; that phrasing belongs to `blue-score`. Two
skills answering the same trigger, one of them dead, is worse than either alone.
