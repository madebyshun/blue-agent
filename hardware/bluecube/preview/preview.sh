#!/usr/bin/env bash
# BlueCube preview: every screen the cube can show, rendered on this machine
# by the firmware's own drawing code (../BlueCube/cube_render.cpp), from LIVE
# /api/cube feeds. Writes out/sheet.png (all screens, labelled) and one PNG
# per screen. Needs clang++ (or g++), curl, python3 with Pillow, and the
# Arduino libraries Adafruit GFX + ArduinoJson (Library Manager installs them
# into ~/Documents/Arduino/libraries; override with ARDUINO_LIBS).
#
#   ./preview.sh                       # against https://blueagent.dev
#   CUBE_API=http://localhost:3000/api/cube ./preview.sh
set -euo pipefail
cd "$(dirname "$0")"

LIBS="${ARDUINO_LIBS:-$HOME/Documents/Arduino/libraries}"
API="${CUBE_API:-https://blueagent.dev/api/cube}"
OUT="${OUT:-out}"
mkdir -p "$OUT/raw"
CXX="${CXX:-clang++}"

"$CXX" -std=c++17 -O1 -DARDUINO=200 \
  -DARDUINOJSON_ENABLE_ARDUINO_STRING=0 -DARDUINOJSON_ENABLE_ARDUINO_STREAM=0 \
  -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0 -DARDUINOJSON_ENABLE_PROGMEM=0 \
  -Ishim -I../BlueCube -I"$LIBS/Adafruit_GFX_Library" -I"$LIBS/ArduinoJson/src" \
  preview.cpp ../BlueCube/cube_render.cpp "$LIBS/Adafruit_GFX_Library/Adafruit_GFX.cpp" \
  -o "$OUT/cube-preview"
BIN="$OUT/cube-preview"

N=5   # modes the cube rotates through (crypto hood trending status buddy)
shots=()
shot() { local name="$1"; shift; "$BIN" "$OUT/raw/$name.ppm" "$@"; shots+=("$name"); }
feed() { curl -fsS "$API/$1" -o "$OUT/raw/$2.json"; }

feed "crypto"                         crypto;      shot crypto      feed "$OUT/raw/crypto.json" 0 $N
feed "crypto?pick=ethereum"           hero;        shot hero-1coin  feed "$OUT/raw/hero.json" 0 $N
feed "crypto?pick=ethereum,bitcoin"   duo;         shot duo-2coins  feed "$OUT/raw/duo.json" 0 $N
feed "hood"                           hood;        shot hood        feed "$OUT/raw/hood.json" 1 $N
feed "trending"                       trending;    shot trending    feed "$OUT/raw/trending.json" 2 $N
feed "status"                         status;      shot status      feed "$OUT/raw/status.json" 3 $N
feed "buddy"                          buddy;       shot "buddy-live" feed "$OUT/raw/buddy.json" 4 $N
# The buddy mode as the server drives it (mood → bot state)...
for pair in h:happy d:dance-up a:alarm w:worried s:sad; do
  shot "mood-${pair#*:}" feed "$OUT/raw/buddy.json" 4 $N --mood "${pair%%:*}" --ms 400
done
shot mood-asleep  feed "$OUT/raw/buddy.json" 4 $N --mood h --hour 3 --ms 800
# ...and every BlueBot state the cube can show, by index (cube_render.h Bot).
i=0
for st in idle working thinking searching approval question error finished rate-limit sleeping dizzy love proud annoyed happy; do
  shot "bot-$st" bot $i "$st" --ms 700
  i=$((i + 1))
done
shot card-trade   card "Trade confirmed" "0.1 ETH -> USDC on Base. Pre-trade check: pass." good
shot card-alert   card "Price alert fired" "NVDA on Base crossed \$240. Waiting for your signature in the Price alerts chat." warn
shot card-refused card "Trade refused by the pre-trade check" "Sell tax could not be read for this token." alert
shot pairing      pair "BCDF-GH23"
shot update       update "4821"

python3 - "$OUT" "${shots[@]}" <<'PY'
import sys
from PIL import Image, ImageDraw
out, names = sys.argv[1], sys.argv[2:]
S, PAD, COLS = 3, 16, 5
cell_w, cell_h = 128 * S + PAD, 128 * S + PAD + 18
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * cell_w + PAD, rows * cell_h + PAD), (24, 26, 32))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open(f"{out}/raw/{n}.ppm").resize((128 * S, 128 * S), Image.NEAREST)
    im.save(f"{out}/{n}.png")
    x, y = PAD + (i % COLS) * cell_w, PAD + (i // COLS) * cell_h
    sheet.paste(im, (x, y))
    d.text((x, y + 128 * S + 3), n, fill=(200, 205, 215))
sheet.save(f"{out}/sheet.png")
print(f"{out}/sheet.png  ({len(names)} screens)")
PY
