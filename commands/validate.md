# blue validate

Project health check — verifies your local project is ready to build and deploy.

## Usage

```bash
blue validate          # check current directory
blue validate ./myapp  # check a specific directory
```

## What it checks

| Check | Pass condition |
|---|---|
| Node.js version | v18 or higher |
| package.json | exists and is valid JSON |
| tsconfig.json | exists |
| BANKR_API_KEY | set in environment or found in .env / .env.local |
| src/ folder | exists and non-empty |
| node_modules | exists (npm install has been run) |
| git | initialized (warning only if missing) |

## Output format

```
──────────────────────────────────────────────────
  🔍 blue validate — Project Health Check
  Path: /your/project
──────────────────────────────────────────────────

✅ Node.js v22.1.0 (required: v18+)
✅ package.json found and valid
❌ tsconfig.json missing
✅ BANKR_API_KEY set (environment variable)
✅ src/ folder found (3 items)
❌ node_modules missing
⚠️  git not initialized

Next steps:
  1. run: npx tsc --init
  2. run: npm install
  3. run: git init && git add . && git commit -m 'init'

──────────────────────────────────────────────────
  ❌ 2 issues found, 1 warning.
```

## Exit codes

- `0` — all checks pass (warnings allowed)
- `1` — one or more hard failures

## Notes

- Warnings (⚠️) don't cause a non-zero exit
- Designed to run before `blue build` or CI deploy steps
- Complements `blue doctor` (which checks the Blue Agent global install, not your project)
