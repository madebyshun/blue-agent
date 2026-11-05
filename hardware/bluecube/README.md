# BlueCube

A 128×128 desk screen for Blue Agent. An ESP32-S3 pulls display-ready feeds
from `blueagent.dev/api/cube` and draws them. The cube computes nothing. The
server picks, formats and labels every number, so a new mode is a deploy and
never a reflash.

| Mode | What it shows | Source |
|---|---|---|
| `crypto` | Your coins, price + 24h. 1–2 coins: big number + 24h chart | CoinGecko |
| `hood` | Your tokenized stocks on Base, price + gap to the Chainlink oracle | `hood-live` tool |
| `trending` | Base trending tokens, each with a tax-read mark (never "safe to buy") | `safe-trending` tool |
| `status` | Whether each data source the tools read from is up | `blue-doctor` tool |
| `buddy` | The mascot (BlueBot's character: the Blue Agent mark with eyes) acting out a mood the server measured | `blue-doctor` + BTC 24h |

**Linked (optional).** Link the cube to your wallet from its control page. It
uses the same device link as BlueBot: the cube shows a code, you approve it at
`app.blueagent.dev/link`, and the cube gets a **read-only** token. A
read-only token can never sign anything or move funds. Once linked, the
mascot reacts to what your agent actually did, read from `/api/devices/feed`
every 3 minutes. Then a card shows the details:

| Event | Mascot |
|---|---|
| A trade confirms | *finished* (green, happy eyes, sparkles) |
| A price alert fires | *approval* (amber, "!" badge, bouncing) |
| A trade is refused or reverts | *error* (red, flat eyes, shaking) |
| Anything else on the timeline | *working* (blue, "…" badge) |

A cube does not mirror your chat while you type. You are already looking at
the chat, and polling for it would cost KV commands all day for nothing.

## Build one

| Part | Used here |
|---|---|
| Board | ESP32-S3 DevKit (any ESP32-S3 with 4 MB+ flash) |
| Screen | 1.44" ST7735 128×128 SPI (`INITR_144GREENTAB`) |
| Wiring | SCL→13, SDA→12, RES→8, DC→9, CS→10, BLK→14 (or 3.3V) |
| Button | The board's BOOT button (optional) |

1. Arduino IDE → Boards Manager → **esp32 by Espressif Systems** (3.x).
2. Library Manager → **WiFiManager** (tzapu), **ArduinoJson** 7,
   **Adafruit GFX**, **Adafruit ST7735 and ST7789**.
3. Open `BlueCube/BlueCube.ino`, board **ESP32S3 Dev Module**,
   **USB CDC On Boot: Enabled**, Upload.
4. The cube broadcasts `BlueCube-Setup`. Join it from a phone and pick your
   2.4 GHz WiFi.
5. Open `http://bluecube.local` (or the IP shown at boot) to choose modes,
   coins and stocks, link your wallet, or update the firmware.

## Firmware updates without a cable

Go to `bluecube.local` → **Update firmware**. The cube shows a 4-digit code.
Enter it, choose the `.bin` (Arduino IDE → Sketch → Export Compiled Binary),
and upload. The code proves you are standing at the cube, not merely on its
WiFi.

A new build stays on probation until it gets a good answer from blueagent.dev.
If it gets none within 3 minutes, it rolls back to the previous build. This
needs a bootloader with app rollback enabled. On a bootloader without it, the
update still works but there is no automatic rollback.

## Preview every screen without the hardware

```bash
./preview/preview.sh
```

This compiles the firmware's own drawing code (`BlueCube/cube_render.cpp`)
for your computer, renders every screen from the **live** feeds plus each
mascot mood, a card, the pairing and update screens, and writes
`preview/out/sheet.png`. If a layout looks right there, it looks right on the
cube, because it is the same code. Needs `clang++`, `curl`, Python with
Pillow, and the Arduino libraries above.

## Layout

```
BlueCube/BlueCube.ino     device: WiFi, HTTP, control page, linking, OTA, screen arbitration
BlueCube/cube_render.*    drawing + feed parsing, no networking (shared with the preview)
preview/                  desktop build of cube_render + a script that renders every screen
```

Server side: `apps/web/src/lib/cube/` (public feeds), `apps/web/src/lib/devices.ts`
(device link, kind `cube`, read-only), `apps/web/src/lib/device-feed.ts` (feed tones).
