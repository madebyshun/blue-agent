# Contributing to Blue Agent Collab Hub

How to contribute skills, schemas, bridge files, and sample exports.

---

## What you can contribute

| Type | Where | Label |
|---|---|---|
| New skill file | `skills/` | `skill` |
| Improved skill | `skills/` | `skill` |
| New project template | `templates/` | `template` |
| New bridge file | `collab/` | `collab` |
| Schema extension | `collab/shared-schemas.yml` | `schema` |
| Sample export | `collab/exports/` | `skill` |
| Command contract update | `commands/` | `cmd` |
| Eval / fixture | `collab/exports/` | `collab` |
| Docs improvement | `docs/` | `docs` |
| Bug fix | anywhere | `fix` |

---

## Schema versioning

`shared-schemas.yml` is versioned. Current version: `v1`.

### Rules

- **Additive changes** (new optional field) → no version bump needed, open PR with label `schema`
- **Breaking changes** (rename, remove, or change type of existing field) → bump version → `v1` → `v2`
- When bumping version: add a `changelog` block at the top of `shared-schemas.yml`

### Changelog format

```yaml
changelog:
  v2:
    date: 2026-06-01
    changes:
      - added: result.lesson (optional string)
      - changed: signal.confidence now required (was optional)
  v1:
    date: 2026-05-17
    changes:
      - initial release
```

### Agents consuming the schema

When schema version bumps, agents using the schema need to update. Pin your version:

```yaml
# in your bridge file
schema_version: v1
```

---

## How to contribute

### 1. Fork and branch

```bash
git clone https://github.com/madebyshun/blue-agent
cd blue-agent
git checkout -b <type>/<short-description>
```

Branch naming:
- `skill/add-uniswap-v4-patterns`
- `collab/miroshark-blueagent-bridge`
- `schema/add-result-lesson-field`
- `template/base-hardhat-agent`

### 2. Make your change

Keep changes small and focused — one thing per PR.

**For skill files:**
- Follow the format in existing `skills/*.md`
- Include: purpose, when to use, core concepts, patterns, examples
- No invented addresses, stats, or external claims without source
- Base-only scope

**For schema extensions:**
- Add new fields as optional unless there is a strong reason
- Include description and example for every field
- Update `changelog` block if bumping version

**For bridge files:**
- Use `aeon-blueagent.yml` as template
- Name format: `<youragent>-blueagent.yml`
- Must reference `shared-schemas.yml`

**For sample exports:**
- Follow format in `collab/exports/*.sample.md`
- Include: what it covers, when to use, core concepts, patterns
- Keep it concise — these are summaries, not full docs

### 3. Open a PR

```bash
git add .
git commit -m "<type>: <short description>"
git push origin <your-branch>
```

PR title format: `skill: add uniswap-v4-patterns` · `collab: add miroshark bridge` · `schema: add result.lesson field`

Include in PR description:
- What changed and why
- Any schema version impact
- How to test / verify

### 4. Labels

Add one of: `skill` `template` `collab` `schema` `cmd` `docs` `fix` `bounty`

---

## Rules

- Base-only scope — no Ethereum mainnet suggestions
- No invented addresses, partnerships, or stats
- Keep changes small and shippable — one PR, one thing
- If it touches payments, security, or signing — be explicit and grounded
- Do not add features beyond what the change requires

---

## Good first contributions

- Add a missing skill to `collab/exports/` as a `.sample.md`
- Improve an existing skill in `skills/` with better examples
- Add a new Base project template in `templates/`
- Fix stale instructions in `docs/`