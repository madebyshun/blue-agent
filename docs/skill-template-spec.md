# Blue Agent Skill + Template Spec

This file defines the shape of new skills and templates so Claude can build consistently.

## Skills

### Purpose
A skill is grounded knowledge for Blue Agent prompts and build tasks.

### Format
- Markdown file
- Base-specific only
- Practical, not promotional
- Should include:
  - What it covers
  - When to use it
  - Core concepts
  - Risks / pitfalls
  - Useful examples or patterns

### Good skill traits
- Helps `blue idea`, `blue build`, `blue audit`, or `blue ship`
- Written for builders, not tourists
- Short enough to read quickly, dense enough to be useful
- Matches the style of existing skill files

### Suggested skill structure
- Title
- Short intro
- Key concepts
- Patterns / examples
- Common mistakes
- Checklist

---

## Templates

### Purpose
A template is a starter project or scaffold for a common Base use case.

### Format
A template should be ready to clone and adapt.

### Suggested template contents
- `README.md`
- `package.json`
- `contracts/` if relevant
- `scripts/` if relevant
- `frontend/` if relevant
- `test/` or `tests/`
- `agent/` if relevant
- `blue-template.json`
- CI workflow if the template is production-oriented
- `env.example`

### Good template traits
- Clear purpose
- Opinionated but flexible
- Production-leaning
- Easy to install and understand
- Uses Base-native patterns

---

## Build rules
- Keep Base-only scope.
- Prefer existing repo conventions.
- Avoid unrelated refactors.
- Do not invent unsupported addresses or APIs.
- Keep assets discoverable from docs or registry files if needed.
