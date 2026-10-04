// BlueCube desktop preview — renders one cube screen to a PPM image using the
// firmware's own cube_render.cpp, so what you see here is what the ST7735
// draws. Driven by preview.sh; run that, not this.
//
//   preview <out.ppm> feed  <feed.json> <modeIdx> <modeCount> [--ms N] [--hour H] [--mood M]
//   preview <out.ppm> card  <title> <body> <tone>
//   preview <out.ppm> think <label> [--ms N]
//   preview <out.ppm> pair  <code>
//   preview <out.ppm> update <code>
//
// --ms advances the animation clock (to catch e.g. the dance's up-frame),
// --hour sets the clock (buddy sleeps before 06:00), --mood overrides the
// buddy feed's mood so every mood can be previewed whatever the market does.
#include <Adafruit_GFX.h>
#include <ArduinoJson.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include "cube_render.h"

static int argInt(int argc, char** argv, const char* name, int def) {
  for (int i = 0; i + 1 < argc; i++) if (!strcmp(argv[i], name)) return atoi(argv[i + 1]);
  return def;
}
static const char* argStr(int argc, char** argv, const char* name) {
  for (int i = 0; i + 1 < argc; i++) if (!strcmp(argv[i], name)) return argv[i + 1];
  return nullptr;
}

static bool writePpm(const char* path, GFXcanvas16& cv) {
  FILE* f = fopen(path, "wb");
  if (!f) return false;
  fprintf(f, "P6\n%d %d\n255\n", cv.width(), cv.height());
  const uint16_t* px = cv.getBuffer();
  for (int i = 0; i < cv.width() * cv.height(); i++) {
    uint16_t c = px[i];
    unsigned char rgb[3] = {
      (unsigned char)(((c >> 11) & 0x1F) * 255 / 31),
      (unsigned char)(((c >> 5) & 0x3F) * 255 / 63),
      (unsigned char)((c & 0x1F) * 255 / 31),
    };
    fwrite(rgb, 1, 3, f);
  }
  fclose(f);
  return true;
}

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: see header of preview.cpp\n"); return 2; }
  const char* out = argv[1];
  const char* what = argv[2];
  GFXcanvas16 cv(cube::SCREEN, cube::SCREEN);
  cv.fillScreen(cube::BLACK);

  uint32_t ms = (uint32_t)argInt(argc, argv, "--ms", 0);
  int hour = argInt(argc, argv, "--hour", 14);
  int modeIdx = 0, modeCount = 5;
  if (!strcmp(what, "feed") && argc >= 6) { modeIdx = atoi(argv[4]); modeCount = atoi(argv[5]); }
  cube::Ctx c{cv, modeIdx, modeCount, true, cube::Clock{true, hour, 36, 4, 10}, 1000, 12345};
  cube::FaceAnim face;

  if (!strcmp(what, "feed")) {
    std::ifstream in(argv[3]);
    std::stringstream ss; ss << in.rdbuf();
    JsonDocument doc;
    if (deserializeJson(doc, ss.str())) { fprintf(stderr, "bad json in %s\n", argv[3]); return 1; }
    cube::Feed f{};
    cube::parseFeed(doc, f, 0);
    if (const char* m = argStr(argc, argv, "--mood")) f.mood = m[0];
    if (!f.isBuddy) cube::drawHeader(c);
    cube::drawFeed(c, f, face);
    // Step the animation clock to the requested moment, frame by frame.
    for (uint32_t t = 0; f.isBuddy && t < ms; t += 120) { c.now = 1000 + t + 120; cube::buddyTick(c, f, face, false); }
  } else if (!strcmp(what, "card") && argc >= 6) {
    JsonDocument d;
    d["id"] = "preview"; d["title"] = argv[3]; d["body"] = argv[4]; d["tone"] = argv[5];
    cube::Card k{};
    cube::parseCard(d.as<JsonObjectConst>(), k);
    cube::drawCard(c, k);
  } else if (!strcmp(what, "think") && argc >= 4) {
    cube::Agent a{true, ""};
    strncpy(a.label, argv[3], sizeof a.label - 1);
    cube::thinkingTick(c, a, face, true);
    for (uint32_t t = 0; t < ms; t += 120) { c.now = 1000 + t + 120; cube::thinkingTick(c, a, face, false); }
  } else if (!strcmp(what, "pair") && argc >= 4) {
    cube::drawPairing(cv, argv[3], "app.blueagent.dev/link");
  } else if (!strcmp(what, "update") && argc >= 4) {
    cube::drawUpdateCode(cv, argv[3]);
  } else {
    fprintf(stderr, "unknown screen: %s\n", what);
    return 2;
  }
  return writePpm(out, cv) ? 0 : 1;
}
