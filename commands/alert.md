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
- Bankr command to activate real-time delivery

## Storage

Alert configs are saved to `~/.blue-agent/alerts.json`.

## Notes

- Alert config is local; real-time delivery requires connecting to a live listener or Bankr agent
- Pair with `blue watch <target>` to configure what to monitor first
