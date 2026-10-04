# AGENTS.md — BlueCube firmware

Rules for a coding agent changing anything under `hardware/bluecube/`.

1. **Drawing goes in `BlueCube/cube_render.cpp`, never in the `.ino`.** That
   file is compiled into both the firmware and the desktop preview. Keep it
   free of WiFi, HTTP, `Preferences`, Arduino `String` and `millis()`. Time and
   randomness come in through `cube::Ctx`.
2. **Run `./preview/preview.sh` and look at `preview/out/sheet.png` before
   flashing anything.** It renders every screen from live feeds with the real
   drawing code. A layout change that you have not seen in the sheet is not
   done.
3. **The cube is dumb on purpose.** Numbers are formatted, labelled and fitted
   to the 21-column screen by the server (`apps/web/src/lib/cube/modes.ts`,
   with tests in `apps/web/scripts/cube-feed-test.ts`). Do not compute a
   value, a verdict or a mood on the device.
4. **Linked features use the existing device link** (`apps/web/src/lib/devices.ts`,
   kind `cube`). The token is read-only. Never add a path that lets the cube
   sign, spend or hold a key.
5. **Watch the KV budget.** Every device poll is an Upstash command, and the
   monthly cap has suspended the store before (#148). The feed is polled every
   `next_poll_s` (180 s). `/api/devices/agent` is polled fast only while the
   feed reports `agent_active`. Do not shorten either interval.
6. **Compile before claiming done:**
   `arduino-cli compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc hardware/bluecube/BlueCube`.
   Flash usage is around 93% of the default OTA partition. If a change pushes it
   over, say so; do not switch to a no-OTA partition scheme, because that
   removes cable-free updates.
