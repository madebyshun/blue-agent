---
name: Schema Proposal
about: Propose an extension or change to shared-schemas.yml
title: "schema: <change-description>"
labels: schema
assignees: ''
---

## What you want to change

<!-- Describe the field or schema change -->

## Type of change

- [ ] Additive — new optional field (no version bump needed)
- [ ] Breaking — rename, remove, or change type of existing field (version bump required)

## Proposed field(s)

```yaml
# Add to which schema? (signal / scenario / forecast / action / result)
field_name:
  type: string
  description: What this field means
  example: "example value"
  required: false
```

## Why it's needed

<!-- What use case or integration requires this field? -->

## Agents affected

<!-- Which agents consume this schema and would need to update? -->

## Will you open a PR?

- [ ] Yes, I'll open a PR with the schema change + changelog entry
- [ ] No, I'm suggesting it for someone else to build
