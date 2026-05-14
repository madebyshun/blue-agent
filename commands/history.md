# blue history

Show the activity timeline for a builder, agent, or project.

## Usage

```
blue history @handle
blue history npm:@package
blue history github.com/owner/repo
```

## Required output

- Timeline entries (6–10, most recent first)
- Date (YYYY-MM or YYYY-MM-DD)
- Event description
- Event type: launch / post / build / collab / milestone
- Impact (optional — reach or outcome)

## Notes

- History is LLM-grounded — based on publicly observable activity
- Best used for builders with significant public presence
- Dates marked "estimated" when exact timing is uncertain
- Follow up with: `blue score @handle` or `blue compare @a @b`
