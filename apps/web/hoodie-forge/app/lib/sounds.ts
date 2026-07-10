"use client";

// Web Audio API — no binary assets. Muted by default (opt-in).

const MUTE_KEY = "blue-forge-muted";
let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(MUTE_KEY);
  return v === null ? true : v === "1";
}

export function setMuted(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTE_KEY, v ? "1" : "0");
}

export function playClack() {
  if (isMuted()) return;
  const audio = ensureCtx();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = 240;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

export function playChime() {
  if (isMuted()) return;
  const audio = ensureCtx();
  if (!audio) return;
  const t = audio.currentTime;
  const notes = [659.25, 987.77]; // E5, B5
  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + i * 0.08;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}
