# blue watch

Watch a wallet address, builder handle, or token for onchain/social activity.

## Usage

```
blue watch <target>
blue watch 0xabc...          # wallet address
blue watch @handle           # X/Twitter builder
blue watch USDC              # token
blue watch --list            # list all configured watches
```

## Required output

- Target and type (address / handle / token)
- List of signals to monitor (transfers, swaps, posts, price moves, etc.)
- Suggested alerting threshold
- Bankr command to activate real-time monitoring

## Storage

Watch configs are saved to `~/.blue-agent/watches.json`.

## Notes

- `blue watch --list` shows all saved watches
- Pair with `blue alert add` to configure delivery (Telegram, webhook, log)
- Real-time delivery requires Bankr agent integration
