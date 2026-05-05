# Blue Agent

Blue Agent is the Base-native founder console for building, launching, and monetizing agents and apps with Bankr.

## Product surfaces

- `/code` — founder console (idea / build / audit / ship / raise)
- `/chat` — model picker + paid compute
- `/launch` — launch wizard for agents
- `/market` — marketplace for agents, prompts, and skills

## Workspace layout

- `apps/web` — Next.js app
- `apps/api` — x402 services
- `packages/core` — shared command schemas + pricing
- `packages/payments` — x402 helpers
- `packages/bankr` — Bankr LLM client
- `agents/blue-agent` — agent runtime config and tasks
- `commands/` — command contracts
- `docs/` — product brief and roadmap

## Core workflow

- `blue idea`
- `blue build`
- `blue audit`
- `blue ship`
- `blue raise`

## Later layers

- model picker chat
- credits / USDC payments
- agent launch + publish
- marketplace monetization

## Repo rule

This repo is the single source of truth for Blue Agent.
Keep business logic in shared packages. Keep UI thin.
