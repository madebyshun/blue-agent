# base-hardhat-agent

## Purpose
Starter template for a Base-native agent project with contracts, scripts, tests, and an optional frontend.

## What it should include
- `contracts/`
- `scripts/`
- `test/`
- `agent/`
- `README.md`
- `blue-template.json`
- `hardhat.config.ts`
- `foundry.toml` if the template mixes Hardhat and Foundry workflows
- `.env.example`
- `.github/workflows/ci.yml`

## Default stack
- TypeScript
- Hardhat
- viem or ethers
- Base network config
- optional Bankr/x402 integration

## Build goals
- easy to clone
- easy to test
- easy to deploy
- clearly Base-native

## Acceptance
- project boots from a fresh install
- tests run
- Base config is correct
- template README explains the path from clone → build → deploy
