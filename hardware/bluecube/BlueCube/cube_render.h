// BlueCube rendering core — everything that draws, nothing that networks.
//
// Compiled twice from the same files: into the ESP32 firmware (drawing on the
// ST7735) and into the desktop preview (hardware/bluecube/preview, drawing
// into a framebuffer that becomes a PNG). A layout that looks right in the
// preview looks right on the cube, because it is the same code — the lesson
// from hermes-gadget-sdk's simulator. Keep this file free of WiFi, HTTP,
// Preferences, String and millis(): time and randomness come in through Ctx.
#pragma once
#include <Adafruit_GFX.h>
#include <ArduinoJson.h>

namespace cube {

// ── colours (RGB565) ─────────────────────────────────────────────────────────
constexpr uint16_t BLACK = 0x0000, WHITE = 0xFFFF, GRAY = 0x5AEB, GREEN = 0x07E0,
                   RED = 0xF800, BLUE = 0x2C5F, CYAN = 0x07FF, AMBER = 0xFD20,
                   GREEN_DIM = 0x0200, RED_DIM = 0x4000;

constexpr int SCREEN = 128;
constexpr int MAX_ROWS = 6;       // 5 for price lists, 6 for the status board
constexpr int SPARK_MAX = 48;

// ── data ─────────────────────────────────────────────────────────────────────
struct Row {
  char label[6];
  char text[10];
  char changeText[8];
  float change;
  bool hasChange, hasValue;
  uint8_t spark[SPARK_MAX];
  uint8_t sparkN;
  char mark;    // trending: 'c' clean, 'f' flagged, 'u' unverified, 0 none
  char state;   // status:   'o' ok, 'd' degraded, 'x' down, 'u' unknown, 0 none
};

struct Feed {
  char title[22];
  Row rows[MAX_ROWS];
  int n;
  bool ok;          // last fetch succeeded (false + n>0 = showing stale rows)
  bool isStatus, isBuddy;
  char mood;        // buddy: 'a' alarm 'w' worried 'd' dance 's' sad 'h' happy 'i' idle
  uint32_t fetchedAt;
};

// A card the agent put on the cube (see /api/cube/device/inbox).
struct Card {
  char id[24];
  char title[40];
  char body[200];
  char tone;        // 'i' info, 'g' good, 'w' warn, 'a' alert
};

struct Clock { bool ok; int hh, mm, day, mon; };

// Everything a frame needs from the outside world.
struct Ctx {
  Adafruit_GFX& g;
  int modeIdx, modeCount;
  bool wifiOk;
  Clock clock;
  uint32_t now;     // ms
  uint32_t rnd;     // a fresh random number for this frame
};

// The mascot — BlueBot's character (the Blue Agent mark with eyes) and its
// states, shared with the BlueBot notch app (BotEngine.swift BotStates).
enum class Bot : uint8_t {
  Idle, Working, Thinking, Searching, Approval, Question, Error, Finished,
  RateLimit, Sleeping, Dizzy, Love, Proud, Annoyed, Happy, Count
};
const char* botName(Bot b);

// Animation state for one on-screen bot, owned by the caller.
struct BotAnim {
  uint32_t lastTick = 0, frame = 0, blinkUntil = 0, nextBlink = 0, sig = 0;
  bool drawn = false;
  int rampState = -1;
  uint16_t ramp[64];
  void reset() { drawn = false; }
};

// ── parsing (ArduinoJson only — the preview loads real /api/cube JSON) ───────
void parseFeed(JsonDocument& doc, Feed& f, uint32_t now);
bool parseCard(JsonObjectConst c, Card& out);

// ── screens ──────────────────────────────────────────────────────────────────
void centerText(Adafruit_GFX& g, const char* s, int y, uint16_t color, uint8_t size = 1);
void splash(Adafruit_GFX& g, const char* l1, const char* l2 = "", uint16_t c2 = GRAY);
void drawHeader(const Ctx& c);
void drawFeed(Ctx& c, const Feed& f, BotAnim& bot);
/** Advance the buddy bot one frame (call every loop; it self-limits to ~8 fps). */
void buddyTick(Ctx& c, const Feed& f, BotAnim& bot, bool force);
/** Any bot state with a caption under it — used for reactions to real events. */
void botTick(Ctx& c, Bot state, const char* text, uint16_t col, BotAnim& bot, bool force);
/** The server's buddy mood → a bot state (asleep 00:00-06:00 unless alarmed). */
Bot moodBot(char mood, const Clock& ck);
/** How the bot reacts to a card from the owner's timeline. */
Bot cardBot(const Card& k);
void drawCard(Ctx& c, const Card& card);
void drawPairing(Adafruit_GFX& g, const char* code, const char* url);
void drawUpdateCode(Adafruit_GFX& g, const char* code);

}  // namespace cube
