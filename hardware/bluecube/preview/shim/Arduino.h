// Desktop stand-in for <Arduino.h> — just enough for Adafruit GFX and
// ArduinoJson to compile on a Mac/Linux host for the BlueCube preview.
#pragma once
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <cmath>
#include <string>
#include <algorithm>

typedef bool boolean;
#ifndef PROGMEM
#define PROGMEM
#endif
#define F(x) (x)
#ifndef radians
#define radians(deg) ((deg) * 0.017453292519943295)
#endif
class __FlashStringHelper;   // only ever passed through, never dereferenced here

class String {
  std::string s_;
 public:
  String(const char* c = "") : s_(c ? c : "") {}
  const char* c_str() const { return s_.c_str(); }
  unsigned length() const { return (unsigned)s_.size(); }
};

#include "Print.h"
