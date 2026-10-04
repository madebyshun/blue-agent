// BlueCube rendering core. See cube_render.h for why this file must stay free
// of networking, String and millis().
#include "cube_render.h"
#include <string.h>
#include <stdio.h>
#include <math.h>

namespace cube {

// ── layout ───────────────────────────────────────────────────────────────────
constexpr int ROW_Y0 = 18, ROW_STEP = 19, FOOT_LINE = 113, FOOT_Y = 117, VALUE_X = 36;

static void copyStr(char* dst, const char* src, size_t n) {
  if (!src) src = "";
  strncpy(dst, src, n - 1);
  dst[n - 1] = 0;
}
static bool eq(const char* a, const char* b) { return a && b && strcmp(a, b) == 0; }

// ── parsing ──────────────────────────────────────────────────────────────────
void parseFeed(JsonDocument& doc, Feed& f, uint32_t now) {
  copyStr(f.title, doc["title"] | "", sizeof(f.title));
  const char* kind = doc["kind"] | "list";
  f.isStatus = eq(kind, "status");
  f.isBuddy = eq(kind, "buddy");
  const char* md = doc["mood"] | "";
  f.mood = eq(md, "alarm") ? 'a' : eq(md, "worried") ? 'w' : eq(md, "dance") ? 'd'
         : eq(md, "sad") ? 's' : eq(md, "happy") ? 'h' : 'i';
  f.n = 0;
  for (JsonObject r : doc["rows"].as<JsonArray>()) {
    if (f.n >= MAX_ROWS) break;
    Row& o = f.rows[f.n++];
    copyStr(o.label, r["label"] | "", sizeof(o.label));
    copyStr(o.text, r["text"] | "--", sizeof(o.text));
    copyStr(o.changeText, r["changeText"] | "", sizeof(o.changeText));
    o.hasValue = !r["value"].isNull();
    o.hasChange = !r["change"].isNull();
    o.change = o.hasChange ? r["change"].as<float>() : 0;
    const char* mk = r["mark"] | "";
    const char* st = r["state"] | "";
    o.mark = eq(mk, "clean") ? 'c' : eq(mk, "flagged") ? 'f' : eq(mk, "unverified") ? 'u' : 0;
    o.state = eq(st, "ok") ? 'o' : eq(st, "degraded") ? 'd' : eq(st, "down") ? 'x' : eq(st, "unknown") ? 'u' : 0;
    o.sparkN = 0;
    for (JsonVariant v : r["spark"].as<JsonArray>()) {
      if (o.sparkN >= SPARK_MAX) break;
      int x = v.as<int>();
      o.spark[o.sparkN++] = (uint8_t)(x < 0 ? 0 : x > 100 ? 100 : x);
    }
  }
  f.ok = true;
  f.fetchedAt = now;
}

bool parseCard(JsonObjectConst c, Card& out) {
  const char* id = c["id"] | "";
  if (!*id) return false;
  copyStr(out.id, id, sizeof(out.id));
  copyStr(out.title, c["title"] | "", sizeof(out.title));
  copyStr(out.body, c["body"] | "", sizeof(out.body));
  const char* t = c["tone"] | "info";
  out.tone = eq(t, "good") ? 'g' : eq(t, "warn") ? 'w' : eq(t, "alert") ? 'a' : 'i';
  return true;
}

// ── primitives ───────────────────────────────────────────────────────────────
void centerText(Adafruit_GFX& g, const char* s, int y, uint16_t color, uint8_t size) {
  g.setTextSize(size);
  g.setTextColor(color);
  g.setCursor((SCREEN - (int)strlen(s) * 6 * size) / 2, y);
  g.print(s);
  g.setTextSize(1);
}

// How many lines `s` needs when word-wrapped at `cols` (a word longer than a
// line counts as cut, so it reports more lines than fit).
static int linesNeeded(const char* s, int cols) {
  int lines = 0;
  const char* p = s;
  while (*p) {
    while (*p == ' ') p++;
    if (!*p) break;
    int len = 0, lastSpace = -1;
    const char* q = p;
    while (*q && len < cols) { if (*q == ' ') lastSpace = len; len++; q++; }
    int take = (*q && *q != ' ' && lastSpace > 0) ? lastSpace : len;
    p += take;
    lines++;
  }
  return lines;
}

// Word-wrap `s` into `cols` columns at text size `size`, up to `maxLines`.
// Returns the y after the last line drawn. A word longer than a line is cut.
static int wrapText(Adafruit_GFX& g, const char* s, int x, int y, int cols, int maxLines,
                    uint8_t size, uint16_t color) {
  g.setTextSize(size);
  g.setTextColor(color);
  int lineH = 8 * size + 2, lines = 0;
  char line[32];
  const char* p = s;
  while (*p && lines < maxLines) {
    while (*p == ' ') p++;
    int len = 0, lastSpace = -1;
    const char* q = p;
    while (*q && *q != '\n' && len < cols) { if (*q == ' ') lastSpace = len; len++; q++; }
    int take = len;
    if (*q && *q != '\n' && *q != ' ' && lastSpace > 0) take = lastSpace;
    if (take > (int)sizeof(line) - 1) take = sizeof(line) - 1;
    memcpy(line, p, take);
    line[take] = 0;
    bool last = lines == maxLines - 1;
    if (last && p[take] && p[take] != '\n') {          // more text than room: ellipsis
      if (take >= 1) line[take - 1] = '~';
    }
    g.setCursor(x, y);
    g.print(line);
    y += lineH;
    lines++;
    p += take;
    if (*p == '\n') p++;
  }
  g.setTextSize(1);
  return y;
}

void splash(Adafruit_GFX& g, const char* l1, const char* l2, uint16_t c2) {
  g.fillScreen(BLACK);
  centerText(g, "BLUE", 30, BLUE, 2);
  centerText(g, "CUBE", 48, WHITE, 2);
  centerText(g, l1, 80, WHITE);
  centerText(g, l2, 94, c2);
}

void drawHeader(const Ctx& c) {
  Adafruit_GFX& g = c.g;
  g.fillRect(0, 0, SCREEN, 14, BLACK);
  g.setTextSize(1);
  char buf[8];
  g.setCursor(2, 3);
  g.setTextColor(c.clock.ok ? WHITE : GRAY);
  if (c.clock.ok) { snprintf(buf, sizeof buf, "%02d:%02d", c.clock.hh, c.clock.mm); g.print(buf); }
  else g.print("--:--");
  g.setCursor(42, 3);
  g.setTextColor(GRAY);
  if (c.clock.ok) { snprintf(buf, sizeof buf, "%02d/%02d", c.clock.day, c.clock.mon); g.print(buf); }
  else g.print("--/--");
  g.setCursor(85, 3);
  g.setTextColor(c.wifiOk ? GREEN : RED);
  g.print(c.wifiOk ? "WiFi OK" : "No WiFi");
  g.drawFastHLine(0, 14, SCREEN, GRAY);
}

// x of the leftmost mode dot's left edge — titles must end before it.
static int dotsLeft(const Ctx& c) { return SCREEN - 4 - (c.modeCount - 1) * 6 - 3; }

// Print `s` from (x, y) but never past `maxX` (size-1 text, 6px per char).
static void printClipped(Adafruit_GFX& g, const char* s, int x, int y, int maxX) {
  char buf[32];
  int cols = (maxX - x) / 6;
  if (cols < 0) cols = 0;
  if (cols > (int)sizeof(buf) - 1) cols = sizeof(buf) - 1;
  strncpy(buf, s, cols);
  buf[cols] = 0;
  g.setCursor(x, y);
  g.print(buf);
}

static void drawModeDots(const Ctx& c, int y) {
  for (int i = 0; i < c.modeCount; i++) {
    int x = SCREEN - 4 - (c.modeCount - 1 - i) * 6;
    if (i == c.modeIdx) c.g.fillCircle(x, y, 2, WHITE); else c.g.drawCircle(x, y, 2, GRAY);
  }
}

// ── big-number layouts (1 or 2 rows) ─────────────────────────────────────────
static uint16_t upDown(const Row& r, uint16_t up, uint16_t down, uint16_t none) {
  return r.hasChange ? (r.change >= 0 ? up : down) : none;
}

static void drawSpark(Adafruit_GFX& g, const Row& r, int x0, int y0, int w, int h) {
  if (r.sparkN < 2) return;
  uint16_t line = upDown(r, GREEN, RED, CYAN);
  uint16_t fill = upDown(r, GREEN_DIM, RED_DIM, 0x0208);
  int prevY = -1;
  for (int x = 0; x < w; x++) {
    float pos = (float)x * (r.sparkN - 1) / (w - 1);
    int i = (int)pos;
    float t = pos - i;
    float v = (i + 1 < r.sparkN) ? r.spark[i] * (1 - t) + r.spark[i + 1] * t : r.spark[i];
    int y = y0 + (h - 1) - (int)(v * (h - 1) / 100.0f + 0.5f);
    g.drawFastVLine(x0 + x, y, y0 + h - y, fill);
    if (prevY >= 0) g.drawLine(x0 + x - 1, prevY, x0 + x, y, line);
    else g.drawPixel(x0 + x, y, line);
    prevY = y;
  }
}

static void drawChangePill(Adafruit_GFX& g, const Row& r, int xr, int y) {
  if (!r.hasChange) return;
  int w = strlen(r.changeText) * 6 + 6;
  g.fillRoundRect(xr - w, y, w, 11, 3, upDown(r, GREEN, RED, GRAY));
  g.setTextSize(1);
  g.setTextColor(BLACK);
  g.setCursor(xr - w + 3, y + 2);
  g.print(r.changeText);
}

// Largest size that fits `maxW`; drops the "$" before dropping a size.
static void drawBigPrice(Adafruit_GFX& g, const Row& r, int y, int maxW, uint8_t maxSize, bool center) {
  const char* s = r.text;
  uint8_t size = maxSize;
  while (size > 1 && (int)strlen(s) * 6 * size > maxW) {
    if (s[0] == '$' && (int)(strlen(s) - 1) * 6 * size <= maxW) { s++; break; }
    size--;
  }
  int w = strlen(s) * 6 * size;
  g.setTextSize(size);
  g.setTextColor(r.hasValue ? WHITE : GRAY);
  g.setCursor(center ? (SCREEN - w) / 2 : 4, y);
  g.print(s);
  g.setTextSize(1);
}

static void drawHero(Ctx& c, const Feed& f) {
  Adafruit_GFX& g = c.g;
  const Row& r = f.rows[0];
  g.setTextSize(2);
  g.setTextColor(CYAN);
  g.setCursor(4, 20);
  g.print(r.label);
  drawChangePill(g, r, 124, 22);
  bool chart = r.sparkN >= 2;
  drawBigPrice(g, r, chart ? 44 : 58, 120, 3, true);
  if (chart) drawSpark(g, r, 4, 74, 120, 38);
  g.setTextColor(f.ok ? GRAY : RED);
  g.setCursor(4, 117);
  g.print(chart ? "24h" : "");
  if (!f.ok) g.print(" !");
  drawModeDots(c, 120);
}

static void drawDuo(Ctx& c, const Feed& f) {
  Adafruit_GFX& g = c.g;
  for (int k = 0; k < 2; k++) {
    const Row& r = f.rows[k];
    int y = 18 + k * 49;
    g.setTextSize(1);
    g.setTextColor(k == 0 ? CYAN : BLUE);
    g.setCursor(4, y + 2);
    g.print(r.label);
    drawChangePill(g, r, 124, y);
    drawBigPrice(g, r, y + 14, 120, 2, false);
    if (r.sparkN >= 2) drawSpark(g, r, 4, y + 32, 120, 13);
  }
  g.drawFastHLine(4, 66, 120, 0x2945);
  if (!f.ok) { g.setTextColor(RED); g.setCursor(4, 117); g.print("!"); }
  drawModeDots(c, 120);
}

static uint16_t stateColor(char s) {
  return s == 'o' ? GREEN : s == 'd' ? AMBER : s == 'x' ? RED : GRAY;
}

static void drawStatus(Ctx& c, const Feed& f) {
  Adafruit_GFX& g = c.g;
  if (f.n == 0) centerText(g, f.ok ? "NO DATA" : "LOADING...", 58, GRAY);
  for (int i = 0; i < f.n; i++) {
    const Row& r = f.rows[i];
    int y = 19 + i * 16;
    g.fillCircle(7, y + 3, 3, stateColor(r.state));
    g.setTextColor(WHITE);
    g.setCursor(16, y); g.print(r.label);
    g.setTextColor(stateColor(r.state));
    g.setCursor(56, y); g.print(r.text);
    g.setTextColor(GRAY);
    g.setCursor(SCREEN - 2 - (int)strlen(r.changeText) * 6, y);
    g.print(r.changeText);
  }
}

static void drawFooter(Ctx& c, const Feed& f, const char* fallback) {
  Adafruit_GFX& g = c.g;
  g.drawFastHLine(0, FOOT_LINE, SCREEN, GRAY);
  g.setTextColor(!f.ok ? RED : GRAY);
  char t[28];
  snprintf(t, sizeof t, "%s%s", f.title[0] ? f.title : fallback, !f.ok && f.n > 0 ? " !" : "");
  printClipped(g, t, 2, FOOT_Y, dotsLeft(c) - 2);
  drawModeDots(c, FOOT_Y + 3);
}

// ── the mascot: BlueBot's character, drawn for a 128px screen ───────────────
// BlueBot (github.com/madebyshun/bluebot) wears Blue Agent's mark: a rounded
// square (superellipse, n = 4.6) filled cyan #34E9FE at the centre through
// #2C73FF to deep blue #0A00FF at the rim, with two tall pill eyes cut out in
// #050508. Its states tint that body and change the eyes and the corner
// badge; the colours below are BlueBot's own (BotEngine.swift BotStates), so
// the cube and the notch app are the same character.
//
// Every frame is composed in an off-screen canvas and pushed in one blit, so
// a bounce or a shake never flickers on the ST7735.
constexpr int BOX_W = 104, BOX_H = 100, BOX_X = (SCREEN - BOX_W) / 2, BOX_Y = 2;
constexpr int BODY = 76;                       // body width = height, px
constexpr uint16_t INK = 0x0021;               // #050508, the mark's eye cut-outs

static uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// fx bits
enum : uint16_t { FX_BOUNCE = 1, FX_SHAKE = 2, FX_ZZ = 4, FX_SWEAT = 8, FX_STARS = 16,
                  FX_HEARTS = 32, FX_BREATHE = 64, FX_SCAN = 128, FX_DROOP = 256, FX_BLINK = 512 };

struct BotCfg {
  uint8_t r, g, b;   // state colour (BlueBot's)
  float tint;        // how far the body leans to it; 0 = the pure mark
  char eye;          // 'p' pill 'w' wide 'f' flat 'h' happy 'c' closed 't' tired
                     // 's' spiral 'v' heart 'x' star 'k' wink 'l' look-up
  char badge;        // 0 none, 'd' dots, '!' bang, '?' question, 'o' dot
  uint16_t fx;
};

static const BotCfg BOTS[] = {
  /* Idle      */ {230, 233, 238, 0.00f, 'p', 0,   FX_BLINK},
  /* Working   */ { 59, 158, 255, 0.50f, 'p', 'd', FX_BLINK},
  /* Thinking  */ {139,  92, 246, 0.85f, 'l', 'd', 0},
  /* Searching */ { 99, 101, 242, 0.80f, 'p', 'd', FX_SCAN},
  /* Approval  */ {245, 165,  36, 0.92f, 'w', '!', FX_BOUNCE},
  /* Question  */ { 34, 211, 238, 0.80f, 'p', '?', FX_BLINK},
  /* Error     */ {244,  80,  94, 0.92f, 'f', '!', FX_SHAKE},
  /* Finished  */ { 52, 212, 153, 0.88f, 'h', 'o', FX_STARS},
  /* RateLimit */ {251, 146,  60, 0.90f, 't', 'o', FX_SWEAT},
  /* Sleeping  */ {148, 162, 184, 0.75f, 'c', 0,   FX_ZZ | FX_BREATHE},
  /* Dizzy     */ {244, 114, 182, 0.88f, 's', 0,   FX_SHAKE},
  /* Love      */ {244, 114, 182, 0.60f, 'v', 0,   FX_HEARTS},
  /* Proud     */ {250, 204,  21, 0.85f, 'x', 0,   FX_STARS | FX_BOUNCE},
  /* Annoyed   */ {148, 162, 184, 0.80f, 'f', 0,   FX_DROOP},
  /* Happy     */ { 52, 233, 254, 0.00f, 'h', 0,   FX_BOUNCE | FX_STARS},
};

const char* botName(Bot b) {
  static const char* N[] = {"idle", "working", "thinking", "searching", "approval", "question", "error",
                            "finished", "rate limit", "sleeping", "dizzy", "love", "proud", "annoyed", "happy"};
  return N[(int)b];
}

// Per-pixel body geometry, computed once: 255 = outside, else 0..63 = how far
// from the centre (indexes the colour ramp).
static uint8_t* bodyMap() {
  static uint8_t* m = nullptr;
  if (m) return m;
  m = new uint8_t[BODY * BODY];
  const float a = BODY / 2.0f, n = 4.6f;
  for (int y = 0; y < BODY; y++)
    for (int x = 0; x < BODY; x++) {
      float u = (x + 0.5f - a) / a, v = (y + 0.5f - a) / a;
      float e = powf(fabsf(u), n) + powf(fabsf(v), n);
      if (e > 1.0f) { m[y * BODY + x] = 255; continue; }
      float r = sqrtf(u * u + v * v) / 1.30f;          // ~0 centre .. ~1 corners
      int k = (int)(r * 63.0f + 0.5f);
      m[y * BODY + x] = (uint8_t)(k > 63 ? 63 : k);
    }
  return m;
}

static void lerp3(float t, const float A[3], const float B[3], float out[3]) {
  for (int i = 0; i < 3; i++) out[i] = A[i] + (B[i] - A[i]) * t;
}

// 64-step colour ramp for one state. Tint 0 is the mark itself (cyan centre
// → #2C73FF → deep-blue rim). A tinted state gets the SAME light-centre /
// dark-rim shape in its own colour, mixed with the mark by `tint`. Mixing the
// state colour straight into the blue made amber read as olive and red as
// purple (seen in the preview), so the state ramp carries its own lightness.
static void buildRamp(const BotCfg& c, uint16_t ramp[64]) {
  const float G[3] = {0x34, 0xE9, 0xFE}, M[3] = {0x2C, 0x73, 0xFF}, D[3] = {0x0A, 0x00, 0xFF};
  const float S[3] = {(float)c.r, (float)c.g, (float)c.b};
  float light[3], dark[3];
  for (int i = 0; i < 3; i++) { light[i] = S[i] + (255 - S[i]) * 0.35f; dark[i] = S[i] * 0.45f; }
  for (int k = 0; k < 64; k++) {
    float t = k / 63.0f, brand[3], st[3], o[3];
    if (t < 0.55f) lerp3(t / 0.55f, G, M, brand); else lerp3((t - 0.55f) / 0.45f, M, D, brand);
    if (t < 0.55f) lerp3(t / 0.55f, light, S, st); else lerp3((t - 0.55f) / 0.45f, S, dark, st);
    for (int i = 0; i < 3; i++) o[i] = brand[i] + (st[i] - brand[i]) * c.tint;
    ramp[k] = rgb((uint8_t)o[0], (uint8_t)o[1], (uint8_t)o[2]);
  }
}

static void thickV(GFXcanvas16& cv, int x0, int y0, int x1, int y1, int x2, int y2, uint16_t col) {
  for (int d = 0; d < 3; d++) {           // a 3px-thick chevron: (x0,y0) → (x1,y1) → (x2,y2)
    cv.drawLine(x0, y0 + d, x1, y1 + d, col);
    cv.drawLine(x1, y1 + d, x2, y2 + d, col);
  }
}

static void drawEye(GFXcanvas16& cv, char eye, int ex, int ey, int look, bool blink) {
  const int w = 11, h = 22;
  if (blink && (eye == 'p' || eye == 'w' || eye == 'l')) { cv.fillRoundRect(ex - 6, ey - 1, 13, 4, 2, INK); return; }
  switch (eye) {
    case 'w': cv.fillRoundRect(ex - 7 + look, ey - 13, 14, 26, 7, INK); break;
    case 'f': cv.fillRoundRect(ex - 7, ey - 2, 15, 5, 2, INK); break;
    case 'h': thickV(cv, ex - 7, ey + 3, ex, ey - 4, ex + 7, ey + 3, INK); break;     // ^
    case 'c': thickV(cv, ex - 7, ey - 2, ex, ey + 4, ex + 7, ey - 2, INK); break;     // ‿
    case 't': cv.fillRoundRect(ex - 5, ey - 2, w, 12, 5, INK);                          // half-lidded
              cv.fillRect(ex - 7, ey - 3, 15, 3, INK); break;
    case 's': cv.drawCircle(ex, ey, 7, INK); cv.drawCircle(ex, ey, 6, INK);
              cv.drawCircle(ex + 1, ey, 3, INK); cv.fillCircle(ex, ey, 1, INK); break;
    case 'v': { uint16_t p = rgb(255, 77, 109);
                cv.fillCircle(ex - 3, ey - 2, 4, p); cv.fillCircle(ex + 3, ey - 2, 4, p);
                cv.fillTriangle(ex - 7, ey, ex + 7, ey, ex, ey + 8, p); } break;
    case 'x': { uint16_t y = INK;   // dark stars: gold ones vanish on the proud body
                cv.fillTriangle(ex, ey - 8, ex - 3, ey + 2, ex + 3, ey + 2, y);
                cv.fillTriangle(ex - 8, ey - 2, ex + 8, ey - 2, ex, ey + 3, y);
                cv.fillTriangle(ex - 6, ey + 7, ex, ey + 1, ex - 1, ey - 2, y);
                cv.fillTriangle(ex + 6, ey + 7, ex, ey + 1, ex + 1, ey - 2, y); } break;
    case 'l': cv.fillRoundRect(ex - 5 + 4, ey - 15, w, h - 6, 5, INK); break;          // looking up-right
    default:  cv.fillRoundRect(ex - 5 + look, ey - 11, w, h, 5, INK); break;          // pill
  }
}

static void drawBadge(GFXcanvas16& cv, char badge, int x, int y, uint16_t col) {
  if (!badge) return;
  cv.fillCircle(x, y, 8, BLACK);                 // a dark ring so it reads on any body
  cv.fillCircle(x, y, 7, col);
  switch (badge) {
    case 'd': for (int i = -1; i <= 1; i++) cv.fillRect(x + i * 4 - 1, y - 1, 2, 2, WHITE); break;
    case '!': cv.fillRect(x - 1, y - 5, 2, 6, WHITE); cv.fillRect(x - 1, y + 3, 2, 2, WHITE); break;
    case '?': cv.setTextSize(1); cv.setTextColor(WHITE); cv.setCursor(x - 2, y - 3); cv.print('?'); break;
    default: cv.fillCircle(x, y, 2, WHITE); break;
  }
}

static void sparkle(GFXcanvas16& cv, int x, int y, int s, uint16_t col) {
  cv.drawFastHLine(x - s, y, 2 * s + 1, col);
  cv.drawFastVLine(x, y - s, 2 * s + 1, col);
}

static void heart(GFXcanvas16& cv, int x, int y, uint16_t col) {
  cv.fillCircle(x - 2, y, 2, col); cv.fillCircle(x + 2, y, 2, col);
  cv.fillTriangle(x - 4, y + 1, x + 4, y + 1, x, y + 6, col);
}

static GFXcanvas16& botCanvas() {
  static GFXcanvas16* cv = nullptr;
  if (!cv) cv = new GFXcanvas16(BOX_W, BOX_H);
  return *cv;
}

static bool botFrameDue(BotAnim& a, uint32_t now, bool force) {
  if (!force && now - a.lastTick < 120) return false;
  a.lastTick = now;
  a.frame++;
  return true;
}

static bool botBlinking(BotAnim& a, uint32_t now, uint32_t rnd) {
  if (a.nextBlink == 0) a.nextBlink = now + 1500 + (rnd % 2000);   // never on the first frame
  if (now >= a.nextBlink && a.blinkUntil == 0) {
    a.blinkUntil = now + 140;
    a.nextBlink = now + 3000 + (rnd % 2000);
  }
  if (a.blinkUntil && now < a.blinkUntil) return true;
  a.blinkUntil = 0;
  return false;
}

// Compose one frame of `state` and push it. Only re-blits when the frame
// actually differs (position, blink, particle phase), so an idle bot costs
// nothing between blinks.
static void renderBot(Ctx& c, Bot state, BotAnim& a, bool force) {
  const BotCfg& cfg = BOTS[(int)state];
  uint32_t fr = a.frame;
  int dx = 0, dy = 0, look = 0;
  if (cfg.fx & FX_BOUNCE)  dy -= ((fr / 3) % 2) ? 4 : 0;
  if (cfg.fx & FX_SHAKE)   dx = (fr % 2) ? 2 : -2;
  if (cfg.fx & FX_BREATHE) dy += ((fr / 8) % 2);
  if (cfg.fx & FX_DROOP)   dy += 4;
  if (cfg.fx & FX_SCAN)    look = ((fr / 5) % 3) * 3 - 3;
  bool blink = (cfg.fx & FX_BLINK) && botBlinking(a, c.now, c.rnd);
  uint32_t phase = (cfg.fx & (FX_ZZ | FX_SWEAT | FX_STARS | FX_HEARTS)) ? (fr / 3) : 0;
  uint32_t sig = ((uint32_t)state << 24) ^ ((uint32_t)(dx + 8) << 18) ^ ((uint32_t)(dy + 8) << 12)
               ^ ((uint32_t)(look + 8) << 8) ^ (blink ? 0x80 : 0) ^ (phase & 0x7F);
  if (!force && a.drawn && sig == a.sig) return;
  a.sig = sig; a.drawn = true;

  if (a.rampState != (int)state) { buildRamp(cfg, a.ramp); a.rampState = (int)state; }
  GFXcanvas16& cv = botCanvas();
  cv.fillScreen(BLACK);
  const uint8_t* m = bodyMap();
  int ox = (BOX_W - BODY) / 2 + dx, oy = (BOX_H - BODY) / 2 + dy;
  uint16_t* buf = cv.getBuffer();
  for (int y = 0; y < BODY; y++) {
    int py = oy + y;
    if (py < 0 || py >= BOX_H) continue;
    for (int x = 0; x < BODY; x++) {
      uint8_t k = m[y * BODY + x];
      int px = ox + x;
      if (k == 255 || px < 0 || px >= BOX_W) continue;
      buf[py * BOX_W + px] = a.ramp[k];
    }
  }
  // eyes: ±0.142 W from centre, 0.07 W above it (the mark's proportions)
  int cx = ox + BODY / 2, cy = oy + BODY / 2 - 5;
  if (cfg.eye == 'k') {                         // wink: left open, right ^
    drawEye(cv, 'p', cx - 11, cy, 0, false);
    drawEye(cv, 'h', cx + 11, cy, 0, false);
  } else {
    drawEye(cv, cfg.eye, cx - 11, cy, look, blink);
    drawEye(cv, cfg.eye, cx + 11, cy, look, blink);
  }
  uint16_t stc = rgb(cfg.r, cfg.g, cfg.b);
  drawBadge(cv, cfg.badge, ox + 9, oy + 9, stc);

  if (cfg.fx & FX_ZZ) {                         // z z drifting up, top right
    int k = phase % 3;
    cv.setTextWrap(false);                      // a z past the edge must clip, not wrap to the left
    cv.setTextColor(rgb(170, 180, 200));
    cv.setTextSize(1); cv.setCursor(ox + BODY - 14 + k, oy + 2 - k * 2); cv.print('z');
    cv.setTextSize(2); cv.setCursor(ox + BODY - 4 + k, oy - 10 - k * 2); cv.print('z');
    cv.setTextSize(1);
  }
  if (cfg.fx & FX_SWEAT) {                      // a drop sliding down the right temple
    int k = phase % 4;
    uint16_t blue = rgb(125, 211, 252);
    cv.fillCircle(ox + BODY - 8, oy + 16 + k * 3, 3, blue);
    cv.fillTriangle(ox + BODY - 11, oy + 15 + k * 3, ox + BODY - 5, oy + 15 + k * 3, ox + BODY - 8, oy + 9 + k * 3, blue);
  }
  if (cfg.fx & FX_STARS) {                      // three sparkles taking turns
    uint16_t gold = rgb(255, 214, 10);
    const int P[3][2] = {{ox - 6, oy + 14}, {ox + BODY + 4, oy + 6}, {ox + BODY + 2, oy + BODY - 18}};
    for (int i = 0; i < 3; i++) sparkle(cv, P[i][0], P[i][1], ((phase + i) % 3) == 0 ? 4 : 2, gold);
  }
  if (cfg.fx & FX_HEARTS) {                     // hearts rising on both sides
    uint16_t pink = rgb(255, 77, 109);
    int k = phase % 4;
    heart(cv, ox - 4, oy + 30 - k * 5, pink);
    heart(cv, ox + BODY + 4, oy + 20 - ((k + 2) % 4) * 5, pink);
  }
  c.g.drawRGBBitmap(BOX_X, BOX_Y, cv.getBuffer(), BOX_W, BOX_H);
}

static void caption(Ctx& c, const char* text, uint16_t col) {
  c.g.fillRect(0, 104, SCREEN, 24, BLACK);
  centerText(c.g, text && *text ? text : "...", 108, col);
  drawModeDots(c, 122);
}

// The server's buddy mood (lib/cube/modes.ts buddyMood) → a BlueBot state.
Bot moodBot(char mood, const Clock& ck) {
  if (mood != 'a' && ck.ok && ck.hh < 6) return Bot::Sleeping;   // an outage keeps it awake
  switch (mood) {
    case 'a': return Bot::Error;       // a data source is down
    case 'w': return Bot::RateLimit;   // a source is slow: sweating
    case 'd': return Bot::Happy;       // BTC >= +3%
    case 's': return Bot::Annoyed;     // BTC <= -3%
    default:  return Bot::Idle;
  }
}

void buddyTick(Ctx& c, const Feed& f, BotAnim& a, bool force) {
  if (!botFrameDue(a, c.now, force)) return;
  Bot b = moodBot(f.mood, c.clock);
  renderBot(c, b, a, force);
  if (force) caption(c, f.title, !f.ok || f.mood == 'a' ? RED : f.mood == 'w' ? AMBER : GRAY);
}

void botTick(Ctx& c, Bot state, const char* text, uint16_t col, BotAnim& a, bool force) {
  if (!botFrameDue(a, c.now, force)) return;
  renderBot(c, state, a, force);
  if (force) caption(c, text, col);
}

Bot cardBot(const Card& k) {
  return k.tone == 'g' ? Bot::Finished : k.tone == 'w' ? Bot::Approval : k.tone == 'a' ? Bot::Error : Bot::Working;
}

// ── whole-screen dispatch for a mode ─────────────────────────────────────────
void drawFeed(Ctx& c, const Feed& f, BotAnim& bot) {
  Adafruit_GFX& g = c.g;
  if (f.isBuddy) {
    g.fillScreen(BLACK);               // no clock bar in this mode: the bot gets it all
    bot.reset();
    buddyTick(c, f, bot, true);
    return;
  }
  g.fillRect(0, 15, SCREEN, SCREEN - 15, BLACK);
  g.setTextSize(1);
  if (f.isStatus) {
    drawStatus(c, f);
  } else if (f.n == 1) { drawHero(c, f); return; }
  else if (f.n == 2) { drawDuo(c, f); return; }
  else {
    if (f.n == 0) centerText(g, f.ok ? "NO DATA" : "LOADING...", 58, GRAY);
    for (int i = 0; i < f.n; i++) {
      const Row& r = f.rows[i];
      int y = ROW_Y0 + i * ROW_STEP + 2;
      // trending: a 2px bar left of the label — cyan clean, amber flagged,
      // grey unverified. Never a word: a clean tax read is not "safe to buy".
      if (r.mark) g.fillRect(0, y - 1, 2, 9, r.mark == 'c' ? CYAN : r.mark == 'f' ? AMBER : GRAY);
      g.setTextColor(i % 2 == 0 ? BLUE : CYAN);
      g.setCursor(r.mark ? 4 : 2, y); g.print(r.label);
      g.setTextColor(r.hasValue ? WHITE : GRAY);
      g.setCursor(VALUE_X, y); g.print(r.text);
      if (r.hasChange) {
        g.setTextColor(r.change >= 0 ? GREEN : RED);
        g.setCursor(SCREEN - 2 - (int)strlen(r.changeText) * 6, y);
        g.print(r.changeText);
      }
    }
  }
  drawFooter(c, f, "");
}

// ── a card the agent put on the cube ─────────────────────────────────────────
void drawCard(Ctx& c, const Card& k) {
  Adafruit_GFX& g = c.g;
  uint16_t tone = k.tone == 'g' ? GREEN : k.tone == 'w' ? AMBER : k.tone == 'a' ? RED : CYAN;
  g.fillScreen(BLACK);
  g.fillRect(0, 0, SCREEN, 3, tone);
  g.setTextSize(1);
  g.setTextColor(GRAY);
  g.setCursor(4, 8);
  g.print("BLUE AGENT");
  // Title at size 2 when it fits in two lines of 10, else size 1.
  int y = 22;
  if (linesNeeded(k.title, 10) <= 2) y = wrapText(g, k.title, 4, y, 10, 2, 2, WHITE);
  else y = wrapText(g, k.title, 4, y, 20, 3, 1, WHITE);
  g.drawFastHLine(4, y + 1, 120, 0x2945);
  wrapText(g, k.body, 4, y + 6, 20, (FOOT_LINE - (y + 6)) / 10, 1, 0xC618);
  g.drawFastHLine(0, FOOT_LINE, SCREEN, GRAY);
  g.setTextColor(tone);
  g.setCursor(2, FOOT_Y);
  g.print(k.tone == 'a' ? "ALERT" : k.tone == 'w' ? "HEADS UP" : "FROM YOUR AGENT");
}

// ── pairing and update codes ─────────────────────────────────────────────────
static void bigCode(Adafruit_GFX& g, const char* code, int y, uint16_t col) {
  int n = strlen(code);
  uint8_t size = n * 18 <= 120 ? 3 : 2;
  g.setTextSize(size);
  g.setTextColor(col);
  g.setCursor((SCREEN - n * 6 * size) / 2, y);
  g.print(code);
  g.setTextSize(1);
}

void drawPairing(Adafruit_GFX& g, const char* code, const char* url) {
  g.fillScreen(BLACK);
  centerText(g, "LINK THIS CUBE", 10, WHITE);
  g.drawRoundRect(6, 28, 116, 38, 6, CYAN);
  bigCode(g, code, 36, CYAN);
  centerText(g, "Open", 76, GRAY);
  // "app.blueagent.dev/link" is 22 columns, one more than the screen: split
  // host and path rather than let it run off the edge.
  char host[32];
  const char* slash = strchr(url, '/');
  size_t hl = slash ? (size_t)(slash - url) : strlen(url);
  if (hl > sizeof host - 1) hl = sizeof host - 1;
  memcpy(host, url, hl); host[hl] = 0;
  centerText(g, host, 88, WHITE);
  if (slash) centerText(g, slash, 98, WHITE);
  centerText(g, "and enter the code", 112, GRAY);
}

void drawUpdateCode(Adafruit_GFX& g, const char* code) {
  g.fillScreen(BLACK);
  centerText(g, "FIRMWARE UPDATE", 14, AMBER);
  centerText(g, "Enter this code on", 34, GRAY);
  centerText(g, "the update page:", 46, GRAY);
  bigCode(g, code, 64, AMBER);
  centerText(g, "Not you? Ignore it.", 104, GRAY);
}

}  // namespace cube
