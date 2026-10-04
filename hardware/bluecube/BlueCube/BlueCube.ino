/***************************************************************************
 * BlueCube — a desk screen for Blue Agent. ESP32-S3 + ST7735 1.44" 128x128.
 *
 * Drawing lives in cube_render.{h,cpp}, shared with the desktop preview
 * (../preview). This file is the device: WiFi, HTTP, the control page,
 * linking to a wallet, OTA, and deciding what is on screen.
 *
 * PUBLIC MODES (no account) — https://blueagent.dev/api/cube/<mode>
 *   crypto · hood · trending · status · buddy   (list comes from /api/cube)
 *
 * LINKED (optional) — link the cube to your wallet from its control page.
 * It uses Blue Agent's existing device link (the BlueBot flow): the cube
 * shows a code, you approve it at app.blueagent.dev/link, the cube gets a
 * READ-ONLY token. It can never sign or move funds. Once linked:
 *   • cards: confirmed trades, fired alerts and refused trades from your
 *     timeline pop up on the screen (GET /api/devices/feed)
 *   • thinking: while your Blue Chat turn runs tools, the mascot shows it
 *     (GET /api/devices/agent — polled fast only while a session is live)
 *
 * CONTROL PAGE — http://bluecube.local (same WiFi): modes, coin/stock picks,
 * link/unlink, firmware update (a code shown on the screen authorises it).
 *
 * OTA ROLLBACK — a freshly updated build must reach blueagent.dev within
 * 3 minutes of booting or the bootloader switches back to the previous one.
 *
 * Libraries: WiFiManager (tzapu), ArduinoJson v7, Adafruit GFX,
 *            Adafruit ST7735 and ST7789
 * Board:     esp32 (Espressif) → ESP32S3 Dev Module, USB CDC On Boot: Enabled,
 *            Partition Scheme: any with OTA (the default does)
 ***************************************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <ArduinoJson.h>
#include <time.h>

#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>

#include "cube_render.h"

#define FW_VERSION "1.2.1"

// --- DISPLAY PINS ---
#define TFT_SCLK   13
#define TFT_MOSI   12
#define TFT_RST     8
#define TFT_DC      9
#define TFT_CS     10
#define TFT_BLK    14   // comment out if the backlight is wired straight to 3.3V
#define TFT_TAB    INITR_144GREENTAB   // 1.44" 128x128 (BLACKTAB swaps red/blue)
#define BTN_PIN     0   // BOOT button

Adafruit_ST7735 tft = Adafruit_ST7735(&SPI, TFT_CS, TFT_DC, TFT_RST);

// --- SERVER ---
const char* SITE     = "https://blueagent.dev";
const char* API_CUBE = "https://blueagent.dev/api/cube";
const char* LINK_URL = "app.blueagent.dev/link";

// --- CLOCK ---
const char* NTP_SERVER = "asia.pool.ntp.org";
const long  GMT_OFFSET = 7 * 3600;

// --- MODES + CATALOG ---
#define MAX_MODES   6
#define MAX_CATALOG 32
String   modes[MAX_MODES] = { "crypto", "hood", "trending", "status", "buddy" };
int      modeCount  = 5;
int      modeIdx    = 0;
String   pinnedMode = "auto";
uint32_t rotateMs   = 10000;
uint32_t refreshMs  = 30000;

struct Option { String id; String label; };
Option coinCatalog[MAX_CATALOG];  int coinCount  = 0;
Option stockCatalog[MAX_CATALOG]; int stockCount = 0;
String pickCrypto = "";
String pickHood   = "";

cube::Feed     feeds[MAX_MODES];
cube::FaceAnim face;

// --- LINK (device token from the BlueBot device flow) ---
String   token;                 // "bbt_…" or empty
String   linkedWallet;          // "0x1234…abcd", for the control page
uint64_t lastSeenAt = 0;        // newest timeline item already shown (ms)
uint32_t nextFeedPoll = 0, feedPollMs = 180000;
// pairing in progress
bool     pairing = false;
String   pairUserCode, pairDeviceCode;
uint32_t pairUntil = 0, nextTokenPoll = 0, tokenPollMs = 5000;

// --- AGENT (thinking) ---
cube::Agent agent = { false, "" };
bool     agentActive = false;
uint32_t nextAgentPoll = 0, agentPollMs = 8000;

// --- CARDS ---
#define CARD_QUEUE 3
#define CARD_SHOW_MS 9000
cube::Card cardQ[CARD_QUEUE];
int      cardN = 0;
uint32_t cardUntil = 0;

// --- OTA ---
char     updCode[5] = "";
uint32_t updUntil = 0;
bool     updAuthorised = false, updFailed = false;
String   updError;          // why the last upload failed, shown on the page
bool     otaPendingVerify = false;
uint32_t bootAt = 0;

Preferences prefs;
WebServer   web(80);
uint32_t lastRotate = 0, lastSec = 0;

enum Screen { SCR_NONE, SCR_MODE, SCR_CARD, SCR_THINK, SCR_PAIR, SCR_UPDATE };
Screen shownScreen = SCR_NONE;

int modeIndexOf(const String& m) {
  for (int i = 0; i < modeCount; i++) if (modes[i] == m) return i;
  return -1;
}

cube::Ctx makeCtx() {
  cube::Clock ck = { false, 0, 0, 0, 0 };
  struct tm t;
  if (getLocalTime(&t, 5)) ck = { true, t.tm_hour, t.tm_min, t.tm_mday, t.tm_mon + 1 };
  return cube::Ctx{ tft, modeIdx, modeCount, WiFi.status() == WL_CONNECTED, ck, millis(), esp_random() };
}

// ───────────────────────────── HTTP ─────────────────────────────
// Vercel answers HTTP/1.1 chunked, which getStream() does not de-chunk;
// HTTP/1.0 has no chunking, so the stream is clean JSON.
int httpJson(const char* method, const String& url, const String& body, JsonDocument& doc, bool auth) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(10000);
  http.useHTTP10(true);
  if (!http.begin(client, url)) return -1;
  http.addHeader("User-Agent", "BlueCube/" FW_VERSION " (ESP32-S3)");
  if (auth && token.length()) http.addHeader("Authorization", "Bearer " + token);
  int code;
  if (strcmp(method, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  } else {
    code = http.GET();
  }
  if (code > 0) {
    DeserializationError err = deserializeJson(doc, http.getStream());
    if (err) Serial.printf("[json] %s -> %s\n", url.c_str(), err.c_str());
  } else {
    Serial.printf("[http] %s -> %d\n", url.c_str(), code);
  }
  http.end();
  return code;
}

// A good answer from our own server proves this build works: confirm an OTA.
void markOtaGood() {
  if (!otaPendingVerify) return;
  esp_ota_mark_app_valid_cancel_rollback();
  otaPendingVerify = false;
  Serial.println("[ota] new firmware confirmed");
}

// ───────────────────────────── public modes ─────────────────────────────
void loadConfig() {
  JsonDocument doc;
  if (httpJson("GET", API_CUBE, "", doc, false) != 200) return;
  markOtaGood();
  JsonArray arr = doc["modes"].as<JsonArray>();
  if (!arr.isNull() && arr.size() > 0) {
    modeCount = 0;
    for (JsonVariant m : arr) if (modeCount < MAX_MODES) modes[modeCount++] = m.as<String>();
  }
  if (doc["rotateSec"].is<int>())  rotateMs  = doc["rotateSec"].as<int>() * 1000UL;
  if (doc["refreshSec"].is<int>()) refreshMs = doc["refreshSec"].as<int>() * 1000UL;
  coinCount = 0;
  for (JsonObject c : doc["options"]["crypto"]["catalog"].as<JsonArray>()) {
    if (coinCount >= MAX_CATALOG) break;
    coinCatalog[coinCount++] = { c["id"].as<String>(), c["label"].as<String>() };
  }
  stockCount = 0;
  for (JsonObject s : doc["options"]["hood"]["catalog"].as<JsonArray>()) {
    if (stockCount >= MAX_CATALOG) break;
    stockCatalog[stockCount++] = { s["ticker"].as<String>(), s["name"].as<String>() };
  }
}

String feedUrl(int idx) {
  String url = String(API_CUBE) + "/" + modes[idx];
  if (modes[idx] == "crypto" && pickCrypto.length()) url += "?pick=" + pickCrypto;
  if (modes[idx] == "hood"   && pickHood.length())   url += "?pick=" + pickHood;
  return url;
}

void fetchFeed(int idx) {
  cube::Feed& f = feeds[idx];
  if (WiFi.status() != WL_CONNECTED) { f.ok = false; return; }
  JsonDocument doc;
  if (httpJson("GET", feedUrl(idx), "", doc, false) != 200) { f.ok = false; return; }
  markOtaGood();
  cube::parseFeed(doc, f, millis());
}

void drawMode(int idx) {
  modeIdx = idx;
  cube::Feed& f = feeds[idx];
  if (!f.fetchedAt || millis() - f.fetchedAt >= refreshMs) fetchFeed(idx);
  cube::Ctx c = makeCtx();
  if (!f.isBuddy) cube::drawHeader(c);
  cube::drawFeed(c, f, face);
  shownScreen = SCR_MODE;
}

// ───────────────────────────── linking ─────────────────────────────
void startPairing() {
  JsonDocument doc;
  int code = httpJson("POST", String(SITE) + "/api/devices/code", "{\"name\":\"BlueCube\",\"kind\":\"cube\"}", doc, false);
  if (code != 200) { Serial.printf("[link] code request failed %d\n", code); return; }
  pairUserCode   = doc["user_code"].as<String>();
  pairDeviceCode = doc["device_code"].as<String>();
  pairUntil      = millis() + (doc["expires_in"] | 600) * 1000UL;
  tokenPollMs    = (doc["interval"] | 5) * 1000UL;
  nextTokenPoll  = millis() + tokenPollMs;
  pairing = true;
  shownScreen = SCR_NONE;   // force the pairing screen
}

void pollPairing() {
  if (!pairing || millis() < nextTokenPoll) return;
  nextTokenPoll = millis() + tokenPollMs;
  if (millis() > pairUntil) { pairing = false; shownScreen = SCR_NONE; return; }
  JsonDocument doc;
  int code = httpJson("POST", String(SITE) + "/api/devices/token",
                      "{\"device_code\":\"" + pairDeviceCode + "\"}", doc, false);
  if (code == 200 && doc["access_token"].is<const char*>()) {
    token = doc["access_token"].as<String>();
    prefs.putString("tok", token);
    feedPollMs = (doc["feed_poll_s"] | 180) * 1000UL;
    lastSeenAt = 0;                    // the first feed read marks history as seen
    prefs.putULong64("seen", 0);
    pairing = false;
    nextFeedPoll = 0;
    shownScreen = SCR_NONE;
    Serial.println("[link] linked");
  } else if (code == 400 && String(doc["error"] | "") == "expired_token") {
    pairing = false; shownScreen = SCR_NONE;
  }
}

void unlink() {
  if (token.length()) {
    JsonDocument doc;
    httpJson("POST", String(SITE) + "/api/devices/revoke", "{}", doc, true);
  }
  token = ""; linkedWallet = ""; agentActive = false; agent.thinking = false;
  prefs.remove("tok"); prefs.remove("seen");
}

void queueCard(JsonObject item) {
  cube::Card k;
  JsonDocument tmp;
  tmp["id"]    = item["id"];
  tmp["title"] = item["title"];
  tmp["body"]  = item["detail"];
  tmp["tone"]  = item["tone"];
  if (!cube::parseCard(tmp.as<JsonObjectConst>(), k)) return;
  if (cardN < CARD_QUEUE) cardQ[cardN++] = k;
  else { for (int i = 1; i < CARD_QUEUE; i++) cardQ[i - 1] = cardQ[i]; cardQ[CARD_QUEUE - 1] = k; }
}

void pollLinkedFeed() {
  if (!token.length() || pairing || millis() < nextFeedPoll) return;
  nextFeedPoll = millis() + feedPollMs;
  JsonDocument doc;
  int code = httpJson("GET", String(SITE) + "/api/devices/feed", "", doc, true);
  if (code == 401) { Serial.println("[link] token rejected — unlinked"); unlink(); return; }
  if (code != 200) return;
  linkedWallet = doc["wallet"].as<String>();
  feedPollMs = (doc["next_poll_s"] | 180) * 1000UL;
  if (doc["agent_active"] == true && !agentActive) { agentActive = true; nextAgentPoll = 0; }

  uint64_t newest = lastSeenAt;
  // Oldest first, so cards appear in the order things happened.
  JsonArray items = doc["items"].as<JsonArray>();
  for (int i = (int)items.size() - 1; i >= 0; i--) {
    JsonObject it = items[i];
    uint64_t at = it["at"].as<uint64_t>();
    if (at > newest) newest = at;
    if (lastSeenAt && at > lastSeenAt) queueCard(it);   // first read after linking: history, not news
  }
  if (newest != lastSeenAt) { lastSeenAt = newest; prefs.putULong64("seen", lastSeenAt); }
}

void pollAgent() {
  if (!token.length() || !agentActive || millis() < nextAgentPoll) return;
  JsonDocument doc;
  int code = httpJson("GET", String(SITE) + "/api/devices/agent", "", doc, true);
  if (code != 200) { nextAgentPoll = millis() + 30000; return; }
  bool was = agent.thinking;
  agent.thinking = doc["thinking"] | false;
  strlcpy(agent.label, doc["label"] | "", sizeof(agent.label));
  agentActive = doc["active"] | false;
  nextAgentPoll = millis() + (doc["next_poll_s"] | 8) * 1000UL;
  if (was != agent.thinking) shownScreen = SCR_NONE;
}

// ───────────────────────────── control page ─────────────────────────────
String modeName(const String& m) {
  if (m == "crypto")   return "Crypto";
  if (m == "hood")     return "Stocks on Base";
  if (m == "trending") return "Trending on Base";
  if (m == "status")   return "Data sources";
  if (m == "buddy")    return "Mascot";
  return m;
}

bool listHas(const String& csv, const String& v) { return ("," + csv + ",").indexOf("," + v + ",") >= 0; }

void pickerSection(String& h, const char* title, const char* field, Option* cat, int n, const String& picked, const char* hint) {
  h += "<h2>"; h += title; h += "</h2><p class='s'>"; h += hint; h += "</p><div class='g'>";
  for (int i = 0; i < n; i++) {
    h += "<label class='c'><input type='checkbox' name='"; h += field; h += "' value='"; h += cat[i].id; h += "'";
    if (listHas(picked, cat[i].id)) h += " checked";
    h += "><span>"; h += (String(field) == "c" ? cat[i].label : cat[i].id); h += "</span></label>";
  }
  h += "</div>";
}

const char PAGE_HEAD[] PROGMEM =
  "<!doctype html><html><head><meta charset='utf-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'><title>BlueCube</title><style>"
  "body{font-family:-apple-system,system-ui,sans-serif;background:#0b1220;color:#e6edf7;margin:0 auto;padding:24px 16px 48px;max-width:440px}"
  "h1{font-size:22px;margin:0}h2{font-size:15px;margin:28px 0 2px}p.s{color:#8aa0bd;margin:2px 0 12px;font-size:13px}"
  "a.b{display:block;padding:14px 16px;margin:8px 0;border-radius:12px;background:#15213a;color:#e6edf7;text-decoration:none;font-size:16px;border:2px solid transparent}"
  "a.on{border-color:#2f7cff;background:#1b2d52}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}"
  ".c input{display:none}.c span{display:block;text-align:center;padding:10px 4px;border-radius:10px;background:#15213a;border:2px solid transparent;font-size:14px}"
  ".c input:checked+span{border-color:#2f7cff;background:#1b2d52}"
  "button,.btn{display:block;width:100%;box-sizing:border-box;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#2f7cff;color:#fff;font-size:16px;font-weight:600;text-align:center;text-decoration:none}"
  ".ghost{background:#15213a}input[type=text],input[type=file]{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #2a3a5c;background:#0f1a30;color:#e6edf7;font-size:16px;margin-top:8px}"
  "</style></head><body>";

void handleRoot() {
  bool isAuto = modeIndexOf(pinnedMode) < 0;
  String h; h.reserve(9000);
  h += FPSTR(PAGE_HEAD);
  h += "<h1>BlueCube</h1><p class='s'>What should the cube show? · firmware " FW_VERSION "</p><h2>Mode</h2>";
  h += "<a class='b" + String(isAuto ? " on" : "") + "' href='/set?mode=auto'>Auto-rotate every " + String(rotateMs / 1000) + "s</a>";
  for (int i = 0; i < modeCount; i++) {
    bool on = !isAuto && modes[i] == pinnedMode;
    h += "<a class='b" + String(on ? " on" : "") + "' href='/set?mode=" + modes[i] + "'>" + modeName(modes[i]) + " only</a>";
  }
  if (coinCount) {
    h += "<form action='/picks'><input type='hidden' name='which' value='c'>";
    pickerSection(h, "Coins", "c", coinCatalog, coinCount, pickCrypto, "Up to 5. Pick 1 or 2 for big numbers + a 24h chart. None = BTC, ETH, SOL, BNB, XRP.");
    h += "<button>Save coins</button></form>";
  }
  if (stockCount) {
    h += "<form action='/picks'><input type='hidden' name='which' value='s'>";
    pickerSection(h, "Stocks on Base", "s", stockCatalog, stockCount, pickHood, "Up to 5. None = the 5 most traded.");
    h += "<button>Save stocks</button></form>";
  }
  h += "<h2>Blue Agent account</h2>";
  if (token.length()) {
    h += "<p class='s'>Linked" + (linkedWallet.length() ? " to " + linkedWallet : String("")) +
         ". Trades, alerts and your agent's activity show up on the cube. Read-only: the cube can never sign or move funds.</p>"
         "<a class='btn ghost' href='/unlink'>Unlink</a>";
  } else if (pairing) {
    h += "<p class='s'>The cube shows a code. Open <b>" + String(LINK_URL) + "</b>, sign in with your wallet and enter <b>" + pairUserCode + "</b>.</p>"
         "<a class='btn' href='https://" + String(LINK_URL) + "?code=" + pairUserCode + "'>Open the link page</a>";
  } else {
    h += "<p class='s'>Optional. Shows your trades, alerts and what your agent is doing. Read-only.</p><a class='btn' href='/link'>Link to my wallet</a>";
  }
  h += "<h2>Firmware</h2><p class='s'>Install a new BlueCube build (.bin) without a cable.</p><a class='btn ghost' href='/update'>Update firmware</a>";
  h += F("<script>document.querySelectorAll('.g').forEach(g=>g.addEventListener('change',e=>{if(g.querySelectorAll('input:checked').length>5){e.target.checked=false;alert('Pick up to 5');}}));</script></body></html>");
  web.send(200, "text/html; charset=utf-8", h);
}

void redirectHome() { web.sendHeader("Location", "/"); web.send(303); }

void handleSet() {
  String m = web.arg("mode"); m.trim(); m.toLowerCase();
  int idx = modeIndexOf(m);
  if (m == "auto" || idx >= 0) { pinnedMode = m; prefs.putString("mode", pinnedMode); }
  redirectHome();
  if (idx >= 0) drawMode(idx);
  lastRotate = millis();
}

void handlePicks() {
  String c = "", s = "";
  int nc = 0, ns = 0;
  for (int i = 0; i < web.args(); i++) {
    String v = web.arg(i);
    if (web.argName(i) == "c" && nc < 5) { c += (nc++ ? "," : "") + v; }
    if (web.argName(i) == "s" && ns < 5) { s += (ns++ ? "," : "") + v; }
  }
  String which = web.arg("which");
  String edited = which == "s" ? "hood" : "crypto";
  if (which == "s") { pickHood = s;   prefs.putString("ph", pickHood); }
  else              { pickCrypto = c; prefs.putString("pc", pickCrypto); }
  // Show what was just chosen; move a pin elsewhere onto it.
  if (modeIndexOf(pinnedMode) >= 0 && pinnedMode != edited) { pinnedMode = edited; prefs.putString("mode", pinnedMode); }
  redirectHome();
  int idx = modeIndexOf(edited);
  if (idx >= 0) { feeds[idx].fetchedAt = 0; drawMode(idx); }
  lastRotate = millis();
}

void handleLink()   { if (!token.length() && !pairing) startPairing(); redirectHome(); }
void handleUnlink() { unlink(); redirectHome(); shownScreen = SCR_NONE; }

// --- firmware update: a 4-digit code on the cube authorises the upload ---
void handleUpdatePage() {
  snprintf(updCode, sizeof updCode, "%04u", (unsigned)(esp_random() % 10000));
  updUntil = millis() + 120000;
  Serial.printf("[ota] update code %s (valid 2 min)\n", updCode);   // for whoever holds the USB cable
  shownScreen = SCR_NONE;   // show the code now
  String h; h.reserve(2500);
  h += FPSTR(PAGE_HEAD);
  h += F("<h1>Update firmware</h1><p class='s'>The cube now shows a 4-digit code. Enter it, choose the .bin, and upload. "
         "If the new build cannot reach blueagent.dev within 3 minutes of starting, the cube rolls back on its own.</p>"
         "<form id='f' method='POST' enctype='multipart/form-data'>"
         "<input type='text' id='code' inputmode='numeric' maxlength='4' placeholder='Code on the cube'>"
         "<input type='file' name='fw' accept='.bin'>"
         "<p class='s'>Use <b>BlueCube.ino.bin</b> from Sketch &rarr; Export Compiled Binary. Not the "
         "<i>.merged.bin</i> or <i>bootloader.bin</i> beside it.</p>"
         "<button>Upload</button></form><a class='btn ghost' href='/'>Cancel</a>"
         "<script>f.onsubmit=()=>{f.action='/update?code='+encodeURIComponent(code.value);};</script></body></html>");
  web.send(200, "text/html; charset=utf-8", h);
}

void handleUpdateUpload() {
  HTTPUpload& up = web.upload();
  static bool firstChunk = true;
  static size_t received = 0;
  auto fail = [](const String& why) {
    updFailed = true;
    updError = why;
    Serial.printf("[ota] %s\n", why.c_str());
  };
  if (up.status == UPLOAD_FILE_START) {
    updAuthorised = updCode[0] && millis() < updUntil && web.arg("code") == updCode;
    updFailed = false; updError = ""; firstChunk = true; received = 0;
    if (!updAuthorised) { updError = "Wrong or expired code."; Serial.println("[ota] wrong or expired code"); return; }
    String name = up.filename; name.toLowerCase();
    if (name.indexOf("merged") >= 0 || name.indexOf("bootloader") >= 0 || name.indexOf("partitions") >= 0) {
      fail("\"" + up.filename + "\" is not the app image. Choose BlueCube.ino.bin, the file next to it without .merged / bootloader / partitions in its name.");
      return;
    }
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) fail(String("Could not start the update: ") + Update.errorString());
  } else if (up.status == UPLOAD_FILE_WRITE) {
    if (!updAuthorised || updFailed) return;
    // Every ESP32 app image starts with the magic byte 0xE9.
    if (firstChunk) {
      firstChunk = false;
      if (up.currentSize == 0 || up.buf[0] != 0xE9) {
        Update.abort();
        fail("That file is not an ESP32 firmware image (it does not start with 0xE9). Choose BlueCube.ino.bin.");
        return;
      }
    }
    received += up.currentSize;
    if (Update.write(up.buf, up.currentSize) != up.currentSize) fail(String("Write failed after ") + received + " bytes: " + Update.errorString());
  } else if (up.status == UPLOAD_FILE_END) {
    if (!updAuthorised || updFailed) return;
    if (!Update.end(true)) fail(String("The image did not verify (") + received + " bytes): " + Update.errorString());
    else Serial.printf("[ota] received %u bytes, image OK\n", (unsigned)received);
  } else if (up.status == UPLOAD_FILE_ABORTED) {
    if (updAuthorised) Update.abort();
    fail("The upload was interrupted. Try again on a steady WiFi signal.");
  }
}

void handleUpdateDone() {
  updCode[0] = 0; updUntil = 0; shownScreen = SCR_NONE;
  if (!updAuthorised) { web.send(403, "text/plain", "Wrong or expired code. Open /update again for a new one."); return; }
  if (updFailed || Update.hasError()) {
    web.send(500, "text/plain", "Update failed. The cube keeps its current firmware.\n\n" +
             (updError.length() ? updError : String(Update.errorString())));
    return;
  }
  web.send(200, "text/plain", "Installed. The cube restarts now.");
  delay(500);
  ESP.restart();
}

void setupWeb() {
  if (MDNS.begin("bluecube")) MDNS.addService("http", "tcp", 80);
  web.on("/", handleRoot);
  web.on("/set", handleSet);
  web.on("/picks", handlePicks);
  web.on("/link", handleLink);
  web.on("/unlink", handleUnlink);
  web.on("/update", HTTP_GET, handleUpdatePage);
  web.on("/update", HTTP_POST, handleUpdateDone, handleUpdateUpload);
  web.onNotFound(redirectHome);
  web.begin();
  cube::splash(tft, "bluecube.local", WiFi.localIP().toString().c_str(), cube::CYAN);
  delay(4000);
}

// ───────────────────────────── WiFi ─────────────────────────────
void setupWiFi(bool forcePortal) {
  WiFiManager wm;
  wm.setConfigPortalTimeout(300);
  wm.setConnectTimeout(20);
  wm.setTitle("BlueCube");
  cube::splash(tft, "Connecting WiFi");
  wm.setAPCallback([](WiFiManager*) {
    cube::splash(tft, "Join WiFi:", "BlueCube-Setup", cube::CYAN);
    cube::centerText(tft, "192.168.4.1", 108, cube::GRAY);
  });
  bool ok = forcePortal ? wm.startConfigPortal("BlueCube-Setup") : wm.autoConnect("BlueCube-Setup");
  if (!ok) { cube::splash(tft, "WiFi FAILED", "restarting...", cube::RED); delay(3000); ESP.restart(); }
  configTime(GMT_OFFSET, 0, NTP_SERVER);
}

bool bootHeld(uint32_t ms) {
  uint32_t t0 = millis();
  while (millis() - t0 < ms) { if (digitalRead(BTN_PIN) != LOW) return false; delay(20); }
  return true;
}

// Arduino-ESP32 hook: we confirm or roll back a new OTA image ourselves.
extern "C" bool verifyRollbackLater() { return true; }

// ───────────────────────────── setup / loop ─────────────────────────────
void setup() {
  Serial.begin(115200);
  bootAt = millis();
  pinMode(BTN_PIN, INPUT_PULLUP);
#ifdef TFT_BLK
  pinMode(TFT_BLK, OUTPUT);
  digitalWrite(TFT_BLK, HIGH);
#endif
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  SPI.setFrequency(8000000);
  pinMode(TFT_RST, OUTPUT);
  digitalWrite(TFT_RST, LOW);  delay(100);
  digitalWrite(TFT_RST, HIGH); delay(150);
  tft.initR(TFT_TAB);
  tft.setRotation(0);

  esp_ota_img_states_t st;
  if (esp_ota_get_state_partition(esp_ota_get_running_partition(), &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY) {
    otaPendingVerify = true;
    Serial.println("[ota] new firmware on probation");
  }

  prefs.begin("bluecube", false);
  pinnedMode = prefs.getString("mode", "auto");
  pickCrypto = prefs.getString("pc", "");
  pickHood   = prefs.getString("ph", "");
  token      = prefs.getString("tok", "");
  lastSeenAt = prefs.getULong64("seen", 0);

  bool forcePortal = false;
  if (digitalRead(BTN_PIN) == LOW) {
    cube::splash(tft, "Hold BOOT 3s", "to reset WiFi", cube::CYAN);
    forcePortal = bootHeld(3000);
  }
  setupWiFi(forcePortal);
  setupWeb();

  cube::splash(tft, "Loading...", "blueagent.dev");
  loadConfig();
  int pinned = modeIndexOf(pinnedMode);
  tft.fillScreen(cube::BLACK);
  drawMode(pinned >= 0 ? pinned : 0);
  lastRotate = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); delay(2000); }
  web.handleClient();

  // OTA probation: no good answer from blueagent.dev in 3 minutes → roll back.
  if (otaPendingVerify && millis() - bootAt > 180000) {
    Serial.println("[ota] new firmware never reached the server — rolling back");
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }

  pollPairing();
  pollLinkedFeed();
  pollAgent();

  // BOOT button: short press = next mode
  static bool lastBtn = HIGH;
  bool btn = digitalRead(BTN_PIN);
  if (lastBtn == HIGH && btn == LOW) {
    delay(30);
    if (digitalRead(BTN_PIN) == LOW) { cardUntil = 0; cardN = 0; drawMode((modeIdx + 1) % modeCount); lastRotate = millis(); }
  }
  lastBtn = btn;

  // What owns the screen, highest first.
  cube::Ctx c = makeCtx();
  if (pairing) {
    if (shownScreen != SCR_PAIR) { cube::drawPairing(tft, pairUserCode.c_str(), LINK_URL); shownScreen = SCR_PAIR; }
  } else if (updCode[0] && millis() < updUntil) {
    if (shownScreen != SCR_UPDATE) { cube::drawUpdateCode(tft, updCode); shownScreen = SCR_UPDATE; }
  } else if (cardUntil && millis() < cardUntil) {
    // a card is up — leave it
  } else if (cardN > 0) {
    cube::drawCard(c, cardQ[0]);
    for (int i = 1; i < cardN; i++) cardQ[i - 1] = cardQ[i];
    cardN--;
    cardUntil = millis() + CARD_SHOW_MS;
    shownScreen = SCR_CARD;
  } else if (agent.thinking) {
    bool fresh = shownScreen != SCR_THINK;
    if (fresh) { tft.fillScreen(cube::BLACK); face.reset(); }
    cube::thinkingTick(c, agent, face, fresh);
    shownScreen = SCR_THINK;
  } else {
    cardUntil = 0;
    bool pinned = modeIndexOf(pinnedMode) >= 0;
    if (shownScreen != SCR_MODE) {
      tft.fillScreen(cube::BLACK);
      drawMode(modeIdx);
      lastRotate = millis();
    } else if (!pinned && millis() - lastRotate >= rotateMs) {
      drawMode((modeIdx + 1) % modeCount);
      lastRotate = millis();
    } else if (pinned && millis() - feeds[modeIdx].fetchedAt >= refreshMs) {
      drawMode(modeIdx);
    } else if (feeds[modeIdx].isBuddy) {
      cube::buddyTick(c, feeds[modeIdx], face, false);
    }
    if (millis() - lastSec >= 1000) {
      if (!feeds[modeIdx].isBuddy) cube::drawHeader(c);
      lastSec = millis();
    }
  }
  delay(10);
}
