#!/usr/bin/env bash
# Blue Agent installer — idempotent. Target: ready in < 2 minutes.
# usage: curl -fsSL https://blueagent.dev/setup.sh | bash

set -euo pipefail

CYAN="$(printf '\033[36m')"
GOOD="$(printf '\033[32m')"
WARN="$(printf '\033[33m')"
BAD="$(printf '\033[31m')"
BOLD="$(printf '\033[1m')"
END="$(printf '\033[0m')"
DIM="$(printf '\033[2m')"

say()  { printf "  ${CYAN}●${END} %s\n" "$*"; }
ok()   { printf "  ${GOOD}✓${END} %s\n" "$*"; }
warn() { printf "  ${WARN}✗${END} %s\n" "$*"; }
bail() { printf "  ${BAD}✗${END} %s\n" "$*" >&2; exit 1; }
hdr()  { printf "\n${BOLD}%s${END}  ${DIM}%s${END}\n" "$1" "$2"; }

hdr "blue agent" "idea · build · audit · ship · raise"

# --- 1. node -----------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "node $(node -v)"
  else
    bail "node >= 18 required (found $(node -v)). install via nvm: https://nvm.sh"
  fi
else
  bail "node not found. install node >= 18 via nvm (https://nvm.sh) and re-run."
fi

# --- 2. install @blueagent/cli -----------------------------------------------
say "installing @blueagent/cli"
if command -v pnpm >/dev/null 2>&1; then
  pnpm add -g @blueagent/cli >/dev/null
elif command -v npm >/dev/null 2>&1; then
  npm install -g @blueagent/cli >/dev/null
else
  bail "npm not found."
fi
ok "@blueagent/cli installed  →  blue (CLI) + blueagent (TUI)"

# --- 3. blue init (install skills) -------------------------------------------
say "installing 34 skill files"
if blue init >/dev/null 2>&1; then
  ok "34 skills installed to ~/.blue-agent/skills/"
else
  warn "could not install skills. run 'blue init' manually."
fi

# --- 4. config ---------------------------------------------------------------
CFG_DIR="$HOME/.blue-agent"
CFG_FILE="$CFG_DIR/config.toml"
mkdir -p "$CFG_DIR"
if [ ! -f "$CFG_FILE" ]; then
  cat > "$CFG_FILE" <<'TOML'
# Blue Agent config — edit to taste.
# Never commit this file.
bankr_api_key    = ""
chain            = "base"
treasury_wallet  = ""
TOML
  ok "wrote $CFG_FILE (add your BANKR_API_KEY to get started)"
else
  ok "config $CFG_FILE already exists"
fi

# --- 5. doctor ---------------------------------------------------------------
hdr "doctor" "verifying setup"
if blue doctor; then
  ok "setup complete"
else
  warn "doctor reported issues. run 'blue doctor' to fix."
fi

printf "\n${BOLD}ready.${END}\n"
printf "  TUI → ${CYAN}blueagent${END}\n"
printf "  CLI → ${CYAN}blue idea \"your project\"${END}\n\n"
