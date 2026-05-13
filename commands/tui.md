# blue tui

Open the Blue Agent full terminal UI.

## Usage

```
blue tui             # open TUI main menu
blue tui open        # same as blue tui
blue tui market      # open TUI (navigate to marketplace from menu)
blue tui watch       # open TUI (navigate to watch/discovery from menu)
blue tui launch      # open TUI (navigate to launch from menu)
```

All `blue tui *` subcommands open the same full TUI — in-menu navigation
to a specific category is not yet implemented as a deep-link. Use arrow keys
to navigate after launch.

## Requirements

The TUI requires `@blueagent/cli` to be installed globally:

```bash
npm install -g @blueagent/cli
```

Or use the `blueagent` command directly.

## Notes

- The TUI runs on top of Ink (React for terminals)
- Keyboard nav: ↑↓ to move, Enter to select, Esc to go back, Ctrl+C to quit
- All categories and tools from the CLI are available in the TUI
- Bankr wallet operations display as commands to run (no direct execution from TUI)
- If `blueagent` is not installed, `blue tui` exits with a clear install instruction
