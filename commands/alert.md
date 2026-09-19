# blue alert

Configure and manage alerts for Base activity.

## Usage

```
blue alert               # list all alerts
blue alert add           # interactive setup
blue alert remove <id>   # remove an alert
```

## Interactive setup fields

- Watch target (address / handle / token)
- Condition (e.g. "transfer >1000 USDC", ">5% price move")
- Channel: telegram / webhook / log
- Destination: Telegram @channel or webhook URL

## Required output (on add)

- Alert ID
- Target and condition summary
- Channel configuration
- A plain statement that nothing delivers yet

## Storage

Alert configs are saved to `~/.blue-agent/alerts.json`.

## Notes

- **This command records an intent; it does not deliver anything.** There is no listener
  in this CLI. `add` must say so rather than implying the alert is armed.
- The output used to end by suggesting `bankr agent prompt "..."` as the way to activate
  delivery. Bankr 403-bans this project on every write verb, so that command failed for
  every user who followed it. Removed 2026-09-18 rather than re-pointed, because there is
  no replacement endpoint that does this today.
- To act on the file, wire your own listener against `~/.blue-agent/alerts.json`.
