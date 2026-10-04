// BlueCube rendering core. See cube_render.h for why this file must stay free
// of networking, String and millis().
#include "cube_render.h"
#include <string.h>
#include <stdio.h>

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

// ── buddy: the Blue Agent mascot as a 24x24 pixel-art face ───────────────────
// The SERVER picks the mood from measured data (lib/cube/modes.ts buddyMood);
// this only acts it out. Mouth, eyes, lids and the antenna light are painted
// per mood over the base grid, whose own 'M' cells are only a reference.
static const char* const FACE[24] = {
  "..........KKKK..........",
  ".........KrrRRK.........",
  ".........KRRRRK.........",
  "..........KKKK..........",
  "...........KK...........",
  "...........KK...........",
  "...KKKKKKKKKKKKKKKKKK...",
  "..KLLLLLLLLLLLLLLLLLLK..",
  ".KLLLDLLLLLLLLLLLLDLLLK.",
  ".KTTTTDTTTTTTTTTTDTTTTK.",
  ".KTTTTTDTTTTTTTTDTTTTTK.",
  ".KTTTTTYYTTTTTTYYTTTTTK.",
  ".KTTTTYYwYTTTTYYwYTTTTK.",
  ".KTTTTYYYYTTTTYYYYTTTTK.",
  ".KTTTTTYYTTTTTTYYTTTTTK.",
  ".KTTTTTTTTTTTTTTTTTTTTK.",
  ".KTTTTTTTTTTTTTTTTTTTTK.",
  ".KTTTTTTMTTTTTTMTTTTTTK.",
  ".KTTTTTTTMMMMMMTTTTTTTK.",
  ".KDTTTTTTTTTTTTTTTTTTDK.",
  ".KDDTTTTTTTTTTTTTTTTDDK.",
  "..KDDDDDDDDDDDDDDDDDDK..",
  "...KKKKKKKKKKKKKKKKKK...",
  "........................",
};
constexpr int FS = 4, FACE_W = 24 * FS, FACE_X = (SCREEN - FACE_W) / 2, FACE_Y = 4;
constexpr uint16_t F_OUT = 0x1105, F_TEAL = 0x3DB5, F_LIGHT = 0x7F1A, F_DARK = 0x240F,
                   F_EYE = 0xD7A7, F_SHINE = 0xF7FA, F_RED = 0xE185, F_RED_HI = 0xFC50;

static bool sameLook(const FaceLook& a, const FaceLook& b) {
  return a.mouth == b.mouth && a.eye == b.eye && a.lids == b.lids && a.ball == b.ball && a.x == b.x && a.y == b.y;
}

static bool mouthCell(char m, int r, int c) {
  switch (m) {
    case 's': return (r == 16 && (c == 7 || c == 16)) || (r == 17 && (c == 8 || c == 15)) || (r == 18 && c >= 9 && c <= 14);
    case 'f': return (r == 17 && c >= 9 && c <= 14) || (r == 18 && (c == 8 || c == 15));
    case 'w': return (r == 17 && (c == 9 || c == 11 || c == 13)) || (r == 18 && (c == 10 || c == 12 || c == 14));
    case 'o': return r >= 16 && r <= 19 && c >= 10 && c <= 13 && !((r == 16 || r == 19) && (c == 10 || c == 13));
    case 'l': return r == 18 && c >= 9 && c <= 14;
  }
  return false;
}

static uint16_t faceCell(const FaceLook& L, int r, int c) {
  char ch = FACE[r][c];
  if (ch == 'M') ch = 'T';
  if (r >= 15 && r <= 19 && c >= 2 && c <= 21 && mouthCell(L.mouth, r, c)) ch = 'M';
  switch (ch) {
    case 'K': case 'M': return F_OUT;
    case 'T': return F_TEAL;
    case 'L': return F_LIGHT;
    case 'D': return F_DARK;
    case 'Y': case 'w':
      if (L.lids) return r == 13 ? F_DARK : F_TEAL;
      if (ch == 'w') return F_SHINE;
      return L.eye ? L.eye : F_EYE;
    case 'R': return L.ball ? L.ball : F_RED;
    case 'r': return L.ball ? L.ball : F_RED_HI;
  }
  return BLACK;
}

// Every cell is drawn, black ones included, so a 2-4px move only leaves thin
// strips of the old position to clear — no full wipe, no flicker.
static void drawFace(Adafruit_GFX& g, FaceAnim& a, const FaceLook& L) {
  int ox = a.shown.x, oy = a.shown.y;
  for (int r = 0; r < 24; r++)
    for (int c = 0; c < 24; c++)
      g.fillRect(L.x + c * FS, L.y + r * FS, FS, FS, faceCell(L, r, c));
  if (ox > -1000) {
    if (ox < L.x) g.fillRect(ox, oy, L.x - ox, FACE_W, BLACK);
    if (ox > L.x) g.fillRect(L.x + FACE_W, oy, ox - L.x, FACE_W, BLACK);
    if (oy < L.y) g.fillRect(ox, oy, FACE_W, L.y - oy, BLACK);
    if (oy > L.y) g.fillRect(ox, L.y + FACE_W, FACE_W, oy - L.y, BLACK);
  }
  a.shown = L;
}

// Blink every 3-5s for 140ms.
static bool blinking(FaceAnim& a, uint32_t now, uint32_t rnd) {
  if (a.nextBlink == 0) a.nextBlink = now + 1500 + (rnd % 2000);   // never blink on the first frame
  if (now >= a.nextBlink && a.blinkUntil == 0) {
    a.blinkUntil = now + 140;
    a.nextBlink = now + 3000 + (rnd % 2000);
  }
  if (a.blinkUntil && now < a.blinkUntil) return true;
  a.blinkUntil = 0;
  return false;
}

static bool frameDue(FaceAnim& a, uint32_t now, bool force) {
  if (!force && now - a.lastTick < 120) return false;
  a.lastTick = now;
  a.frame++;
  return true;
}

static void caption(Ctx& c, const char* text, uint16_t col) {
  c.g.fillRect(0, 106, SCREEN, 22, BLACK);
  centerText(c.g, text && *text ? text : "...", 108, col);
  drawModeDots(c, 122);
}

void buddyTick(Ctx& c, const Feed& f, FaceAnim& a, bool force) {
  if (!frameDue(a, c.now, force)) return;
  char m = f.mood;
  bool asleep = m != 'a' && c.clock.ok && c.clock.hh < 6;   // an outage keeps it awake

  FaceLook L = {'s', 0, false, 0, FACE_X, FACE_Y};
  if (asleep) {
    L.mouth = 'l'; L.lids = true;
  } else {
    uint32_t fr = a.frame;
    switch (m) {
      case 'a': L.mouth = 'o'; L.eye = RED; L.x += (fr % 2) ? 2 : -2;
                L.ball = (fr % 2) ? RED : 0x4000;                         break;
      case 'w': L.mouth = 'w'; L.eye = AMBER; L.x += ((fr / 2) % 2) ? 1 : -1; break;
      case 'd': L.y -= ((fr / 3) % 2) ? 4 : 0;                            break;
      case 's': L.mouth = 'f'; L.eye = 0x8E7F; L.y += 4;                  break;
      default:  L.ball = ((fr / 8) % 2) ? 0 : 0x8000;                     break;
    }
    if (m != 'a' && blinking(a, c.now, c.rnd)) L.lids = true;   // alarmed eyes stay open
  }
  if (force || !sameLook(L, a.shown)) drawFace(c.g, a, L);

  if (asleep) {                           // a z drifting up, right of the antenna
    int k = (a.frame / 6) % 3;
    c.g.fillRect(L.x + 15 * FS, L.y, 9 * FS, 6 * FS, BLACK);
    c.g.setTextSize(k == 2 ? 2 : 1);
    c.g.setTextColor(GRAY);
    c.g.setCursor(L.x + 16 * FS + k * 4, L.y + 16 - k * 6);
    c.g.print("z");
    c.g.setTextSize(1);
  }
  if (force) caption(c, f.title, !f.ok || m == 'a' ? RED : m == 'w' ? AMBER : GRAY);
}

void thinkingTick(Ctx& c, const Agent& ag, FaceAnim& a, bool force) {
  if (!frameDue(a, c.now, force)) return;
  FaceLook L = {'l', 0, false, 0, FACE_X, FACE_Y};
  if (blinking(a, c.now, c.rnd)) L.lids = true;
  L.ball = ((a.frame / 3) % 2) ? CYAN : 0x0410;            // antenna "transmitting"
  if (force || !sameLook(L, a.shown)) drawFace(c.g, a, L);

  // thought dots rising beside the antenna: . .. ...
  int n = (a.frame / 3) % 4;
  c.g.fillRect(FACE_X + 15 * FS, FACE_Y, 9 * FS, 6 * FS, BLACK);
  for (int i = 0; i < n; i++) c.g.fillCircle(FACE_X + 16 * FS + i * 7, FACE_Y + 20 - i * 6, 2 + (i == 2), CYAN);
  if (force) caption(c, ag.label[0] ? ag.label : "thinking", CYAN);
}

// ── whole-screen dispatch for a mode ─────────────────────────────────────────
void drawFeed(Ctx& c, const Feed& f, FaceAnim& face) {
  Adafruit_GFX& g = c.g;
  if (f.isBuddy) {
    g.fillScreen(BLACK);               // no clock bar in this mode: the face gets it all
    face.reset();
    buddyTick(c, f, face, true);
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
