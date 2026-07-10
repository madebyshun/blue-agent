"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActivityTicker } from "./components/ActivityTicker";
import { BeforeAfterSlider } from "./components/BeforeAfterSlider";
import { CommandPalette } from "./components/CommandPalette";
import { ForgeTerminal } from "./components/ForgeTerminal";
import { GridBackground } from "./components/GridBackground";
import { MemeMarquee } from "./components/MemeMarquee";
import { RarityCard } from "./components/RarityCard";
import { Spotlight } from "./components/Spotlight";
import { SuccessBurst } from "./components/SuccessBurst";
import { isMuted, playChime, playClack, setMuted } from "./lib/sounds";

const TOKEN_CA = "0x8cce1c31a207ae5e42e9fa44e82b2417522c5ba3";
const TOKEN_TICKER = "$HOODUP";

type Stage = "idle" | "ready" | "forging" | "done" | "error";
type Tab = "forge" | "gallery";
type GalleryItem = {
  serial: string;
  url: string;
  original_url?: string | null;
  created_at?: string;
};

const MONO = "[font-family:'JetBrains_Mono',ui-monospace,monospace]";

export default function BlueForge() {
  const [tab, setTab] = useState<Tab>("forge");
  const [stage, setStage] = useState<Stage>("idle");
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [serial, setSerial] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [previewMode, setPreviewMode] = useState<"slider" | "card">("slider");
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundOn(!isMuted());
    const saved = localStorage.getItem("blue-forge-theme");
    if (saved === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme("light");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.classList.add("light");
      localStorage.setItem("blue-forge-theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("blue-forge-theme", "dark");
    }
  }

  const loadGallery = useCallback(async () => {
    try {
      const r = await fetch("/api/gallery", { cache: "no-store" });
      const d = await r.json();
      setGallery(d.items ?? []);
    } catch {}
    setGalleryLoaded(true);
  }, []);

  const switchTab = useCallback(
    (t: Tab) => {
      setTab(t);
      if (t === "gallery" && !galleryLoaded) loadGallery();
    },
    [galleryLoaded, loadGallery]
  );

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setErr("PNG / JPG / WEBP only");
      setStage("error");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setErr("Keep it under 5MB");
      setStage("error");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setSrc(r.result as string);
      setOut(null);
      setErr("");
      setStage("ready");
    };
    r.readAsDataURL(f);
  }

  async function forge() {
    if (!src) return;
    setStage("forging");
    setErr("");
    try {
      const b64 = src.split(",")[1];
      const res = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Forge failed");
      setOut(`data:image/png;base64,${data.image}`);
      setSerial(data.serial);
      setStage("done");
      playClack();
      loadGallery();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Forge failed");
      setStage("error");
    }
  }

  function download() {
    if (!out) return;
    const a = document.createElement("a");
    a.href = out;
    a.download = `${serial || "blue-forge"}.png`;
    a.click();
  }

  function shareX() {
    const origin = window.location.origin;
    const shareUrl = serial ? `${origin}/f/${serial}` : origin;
    const text = encodeURIComponent(
      `hood up, stay based 🟦\n\nforged at ${shareUrl}`
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      "_blank",
      "noopener"
    );
  }

  function copyCA() {
    navigator.clipboard.writeText(TOKEN_CA).then(() => {
      setCopied(true);
      playChime();
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function toggleSound() {
    const next = !soundOn;
    setMuted(!next);
    setSoundOn(next);
    if (next) playChime();
  }

  const openPreviewFor = useCallback(
    async (target: string) => {
      const inGallery = gallery.find((g) => g.serial === target);
      if (inGallery) {
        setPreview(inGallery);
        setPreviewMode("slider");
        setTab("gallery");
        return;
      }
      try {
        const r = await fetch("/api/gallery", { cache: "no-store" });
        const d = await r.json();
        const items: GalleryItem[] = d.items ?? [];
        setGallery(items);
        setGalleryLoaded(true);
        const hit = items.find((g) => g.serial === target);
        if (hit) {
          setPreview(hit);
          setPreviewMode("slider");
          setTab("gallery");
        }
      } catch {}
    },
    [gallery]
  );

  const busy = stage === "forging";
  const shortCA =
    TOKEN_CA.length > 12
      ? `${TOKEN_CA.slice(0, 6)}…${TOKEN_CA.slice(-4)}`
      : TOKEN_CA;

  return (
    <main className="relative min-h-screen bg-[var(--bg)] text-[var(--fg)] overflow-x-hidden [font-family:'Inter_Tight',system-ui,sans-serif]">
      <GridBackground />
      <Spotlight />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* header */}
        <header className="w-full flex items-center justify-between px-5 lg:px-8 pt-5 pb-3">
          <a href="https://blueagent.dev" className="flex items-center gap-2">
            <span className="text-[#0052FF] text-sm leading-none">🟦</span>
            <span className={`${MONO} text-xs tracking-[0.2em] text-[var(--fg)]`}>
              BLUEAGENT
            </span>
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`${MONO} text-[10px] tracking-widest border border-[var(--line)] px-2 h-6 hover:border-[#0052FF] transition-colors text-[var(--mute-3)] hover:text-[var(--fg)]`}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "◐ DARK" : "◑ LIGHT"}
            </button>
            <button
              onClick={toggleSound}
              className={`${MONO} text-[10px] tracking-widest border border-[var(--line)] px-2 h-6 hover:border-[#0052FF] transition-colors ${
                soundOn ? "text-[#2ECC71]" : "text-[var(--mute-3)]"
              }`}
              aria-label="Toggle sound"
            >
              {soundOn ? "♪ ON" : "♪ OFF"}
            </button>
            <CommandPalette
              gallery={gallery}
              hasForge={stage === "done"}
              soundOn={soundOn}
              onSelectSerial={openPreviewFor}
              onShare={shareX}
              onDownload={download}
              onToggleSound={toggleSound}
            />
            <span
              className={`${MONO} text-[10px] text-[var(--mute-3)] tracking-widest`}
            >
              FREE · 2/DAY
            </span>
          </div>
        </header>

        {/* token bar + ticker — full width */}
        <div className="px-5 lg:px-8 flex flex-col gap-1.5">
          {TOKEN_CA && (
            <button
              onClick={copyCA}
              className={`${MONO} w-full flex items-center justify-between border border-[var(--line)] bg-[var(--panel-glass)] backdrop-blur-sm px-3 h-9 text-[10px] tracking-widest hover:border-[#0052FF] transition-colors`}
            >
              <span className="text-[var(--mute-3)] truncate">
                {TOKEN_TICKER}{" "}
                <span className="text-[var(--fg)] hidden md:inline">
                  {TOKEN_CA}
                </span>
                <span className="text-[var(--fg)] md:hidden">{shortCA}</span>
              </span>
              <span className={copied ? "text-[#2ECC71]" : "text-[#0052FF]"}>
                {copied ? "✓ COPIED" : "COPY CA"}
              </span>
            </button>
          )}
          <ActivityTicker onSelect={openPreviewFor} />
        </div>

        {/* main content grid */}
        <div className="flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 px-5 lg:px-8 mt-4 items-center">
          {/* LEFT · hero (right-aligned to hug center) */}
          <div className="relative lg:justify-self-end w-full lg:max-w-md">
            <span
              className={`${MONO} text-[11px] text-[var(--mute-3)] tracking-widest`}
            >
              <span className="text-[#0052FF]">{"// 0.1"}</span> Blue Forge · a
              Blue Image experiment
            </span>
            <h1 className="mt-3 text-5xl lg:text-6xl xl:text-7xl font-semibold tracking-tight leading-[0.98]">
              Hood up.
              <br />
              <span className="text-[#0052FF]">Stay based.</span>
            </h1>
            <p className="text-sm text-[var(--mute-1)] mt-4 max-w-md">
              Drop your pfp — the forge adds the green hoodie and keeps
              everything else exactly as it was. ~10 seconds. No wallet, no
              signup.
            </p>

            {/* tabs */}
            <div className="w-full max-w-sm mt-6 flex border border-[var(--line)] bg-[var(--panel)]/60 backdrop-blur-sm">
              {(["forge", "gallery"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`${MONO} relative flex-1 h-10 text-[11px] tracking-widest transition-colors ${
                    tab === t
                      ? "text-white"
                      : "bg-transparent text-[var(--mute-3)] hover:text-[var(--fg)]"
                  }`}
                >
                  {tab === t && (
                    <motion.div
                      layoutId="tab-active"
                      className="absolute inset-0 bg-[#0052FF]"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="relative">
                    {t === "forge" ? "FORGE" : "GALLERY"}
                  </span>
                </button>
              ))}
            </div>

            <p
              className={`${MONO} mt-4 text-[9px] text-[var(--mute-3)] tracking-widest hidden lg:block`}
            >
              PRESS <span className="text-[#0052FF]">⌘K</span> FOR COMMANDS ·
              FORGES APPEAR IN THE PUBLIC GALLERY
            </p>
          </div>

          {/* RIGHT · forge box or gallery grid (left-aligned to hug center) */}
          <div className="w-full lg:justify-self-start lg:max-w-md">
            <AnimatePresence mode="wait">
              {tab === "forge" && (
                <motion.div
                  key="forge-tab"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-md lg:max-w-sm mx-auto"
                >
                  <div
                    className="relative aspect-square w-full border border-[var(--line)] bg-[var(--panel-glass)] backdrop-blur-sm flex items-center justify-center overflow-hidden cursor-pointer"
                    onClick={() => !busy && fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      pick(e.dataTransfer.files[0]);
                    }}
                  >
                    {out ? (
                      <motion.img
                        key={serial || "forged"}
                        src={out}
                        alt="forged pfp"
                        className="w-full h-full object-cover"
                        initial={{
                          opacity: 0,
                          scale: 0.72,
                          filter: "blur(16px)",
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          filter: "blur(0px)",
                        }}
                        transition={{
                          duration: 0.55,
                          ease: [0.22, 1.14, 0.36, 1],
                          filter: { duration: 0.4 },
                          opacity: { duration: 0.3 },
                        }}
                      />
                    ) : src ? (
                      <img
                        src={src}
                        alt="your pfp"
                        className={`w-full h-full object-cover ${
                          busy ? "opacity-70" : ""
                        }`}
                      />
                    ) : (
                      <div className="text-center">
                        <div
                          className={`${MONO} text-[#0052FF] text-sm`}
                        >
                          [ + ]
                        </div>
                        <p className="mt-2 text-xs text-[var(--mute-2)]">
                          Drop your pfp here, or click to browse
                        </p>
                      </div>
                    )}
                    <ForgeTerminal active={busy} />
                    <SuccessBurst
                      serial={serial}
                      active={stage === "done" && !!out}
                    />
                  </div>

                  <div
                    className={`${MONO} flex items-center justify-between border border-t-0 border-[var(--line)] bg-[var(--panel-glass)] backdrop-blur-sm px-3 h-9 text-[10px] tracking-widest`}
                  >
                    <span className="text-[var(--mute-3)]">
                      FORGE ID{" "}
                      <span className="text-[#0052FF]">{serial || "—"}</span>
                    </span>
                    <span className="text-[var(--mute-3)]">
                      {stage === "done" ? (
                        <span className="text-[#2ECC71]">✓ FORGED</span>
                      ) : stage === "error" ? (
                        <span className="text-[#FF4D4D]">ERROR</span>
                      ) : busy ? (
                        <span className="text-[#0052FF]">RUNNING</span>
                      ) : (
                        "READY"
                      )}
                    </span>
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => pick(e.target.files?.[0])}
                  />

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {stage !== "done" && (
                      <button
                        onClick={forge}
                        disabled={!src || busy}
                        className={`h-11 bg-[#0052FF] text-white text-sm font-medium tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0047DD] transition-colors ${
                          src && !busy ? "glow-ready" : ""
                        }`}
                      >
                        {busy ? "Forging…" : "Forge it →"}
                      </button>
                    )}
                    {stage === "done" && (
                      <>
                        <button
                          onClick={download}
                          className="h-11 bg-[#0052FF] text-white text-sm font-medium tracking-wide hover:bg-[#0047DD] transition-colors"
                        >
                          Download pfp
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={shareX}
                            className="h-10 border border-[var(--line)] text-sm text-[var(--fg)] hover:border-[#0052FF] transition-colors"
                          >
                            Share on X
                          </button>
                          <button
                            onClick={() => {
                              setOut(null);
                              setSerial("");
                              setStage("ready");
                            }}
                            className="h-10 border border-[var(--line)] text-sm text-[var(--mute-1)] hover:border-[#0052FF] hover:text-[var(--fg)] transition-colors"
                          >
                            Forge again
                          </button>
                        </div>
                      </>
                    )}
                    {stage === "error" && (
                      <p
                        className={`${MONO} text-xs text-[#FF4D4D] text-center`}
                      >
                        {err}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {tab === "gallery" && (
                <motion.div
                  key="gallery-tab"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-[var(--mute-1)]">
                      Fresh from the forge — the latest hoods.
                    </p>
                    <button
                      onClick={() => {
                        setGalleryLoaded(false);
                        loadGallery();
                      }}
                      className={`${MONO} text-[10px] text-[#0052FF] tracking-widest hover:underline`}
                    >
                      ↻ REFRESH
                    </button>
                  </div>
                  {!galleryLoaded ? (
                    <p
                      className={`${MONO} text-xs text-[var(--mute-3)] text-center py-10 tracking-widest`}
                    >
                      LOADING…
                    </p>
                  ) : gallery.length === 0 ? (
                    <p
                      className={`${MONO} text-xs text-[var(--mute-3)] text-center py-10 tracking-widest`}
                    >
                      NO FORGES YET — BE THE FIRST
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
                      {gallery.map((g, i) => (
                        <motion.button
                          key={g.serial}
                          onClick={() => {
                            setPreview(g);
                            setPreviewMode("slider");
                          }}
                          className="group border border-[var(--line)] hover:border-[#0052FF] hover:shadow-[0_0_28px_-4px_rgba(0,82,255,0.7)] hover:z-10 transition-all text-left tilt-hover bg-[var(--panel)]/60 overflow-hidden"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{
                            opacity: 1,
                            y: [0, -4, 0],
                          }}
                          transition={{
                            opacity: {
                              delay: Math.min(i * 0.03, 0.5),
                              duration: 0.35,
                            },
                            y: {
                              delay: (i % 6) * 0.35 + 0.6,
                              duration: 3.6 + (i % 4) * 0.3,
                              repeat: Infinity,
                              ease: "easeInOut",
                            },
                          }}
                        >
                          <div className="overflow-hidden">
                            <motion.img
                              src={g.url}
                              alt={g.serial}
                              loading="lazy"
                              className="w-full aspect-square object-cover"
                              whileHover={{ scale: 1.1 }}
                              transition={{ duration: 0.35, ease: "easeOut" }}
                            />
                          </div>
                          <div
                            className={`${MONO} text-[9px] text-[var(--mute-3)] group-hover:text-[#0052FF] tracking-widest px-1.5 py-1 bg-[var(--panel)] transition-colors`}
                          >
                            {g.serial}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* bottom: marquee + footer */}
        <div className="mt-4">
          <MemeMarquee />
          <footer
            className={`${MONO} py-3 text-[10px] text-[var(--mute-3)] tracking-widest text-center`}
          >
            <a href="https://blueagent.dev" className="hover:text-[#0052FF]">
              BLUEAGENT
            </a>{" "}
            · THE BUILDER OS FOR BASE · BY{" "}
            <a
              href="https://x.com/blueagent_"
              className="hover:text-[#0052FF]"
            >
              @BLUEAGENT_
            </a>
          </footer>
        </div>
      </div>

      {/* lightbox preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="fixed inset-0 z-50 bg-[var(--bg)]/90 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setPreview(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              {previewMode === "slider" ? (
                <>
                  <BeforeAfterSlider
                    before={preview.original_url ?? null}
                    after={preview.url}
                    alt={preview.serial}
                  />
                  <div
                    className={`${MONO} flex items-center justify-between border border-t-0 border-[var(--line)] bg-[var(--panel)] px-3 h-9 text-[10px] tracking-widest`}
                  >
                    <span className="text-[#0052FF]">{preview.serial}</span>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/f/${preview.serial}`}
                        target="_blank"
                        rel="noopener"
                        className="text-[var(--mute-3)] hover:text-[var(--fg)]"
                      >
                        SHARE ↗
                      </a>
                      <button
                        onClick={() => setPreviewMode("card")}
                        className="text-[var(--mute-3)] hover:text-[var(--fg)]"
                      >
                        CARD
                      </button>
                      <button
                        onClick={() => setPreview(null)}
                        className="text-[var(--mute-3)] hover:text-[var(--fg)]"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <RarityCard item={preview} />
                  <div
                    className={`${MONO} flex items-center justify-between border border-t-0 border-[var(--line)] bg-[var(--panel)] px-3 h-9 text-[10px] tracking-widest`}
                  >
                    <button
                      onClick={() => setPreviewMode("slider")}
                      className="text-[var(--mute-3)] hover:text-[var(--fg)]"
                    >
                      ← SLIDER
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      className="text-[var(--mute-3)] hover:text-[var(--fg)]"
                    >
                      ✕ CLOSE
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
