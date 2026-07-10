"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActivityTicker } from "./components/ActivityTicker";
import { BeforeAfterSlider } from "./components/BeforeAfterSlider";
import { CommandPalette } from "./components/CommandPalette";
import { ForgeTerminal } from "./components/ForgeTerminal";
import { RarityCard } from "./components/RarityCard";
import { isMuted, playChime, playClack, setMuted } from "./lib/sounds";

const TOKEN_CA = "0x8cce1c31a207ae5e42e9fa44e82b2417522c5ba3";
const TOKEN_TICKER = "$HOODUP";
const SITE_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "";

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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reading localStorage requires client-side effect; the linter's
    // set-state-in-effect rule doesn't apply to one-shot bootstrap of
    // client-only external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundOn(!isMuted());
  }, []);

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
    const origin = SITE_ORIGIN || window.location.origin;
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
      // Not in cached gallery — fetch fresh and retry.
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
    <main className="min-h-screen bg-[#050508] text-[#EDEDF2] flex flex-col items-center px-5 py-6 [font-family:'Inter_Tight',system-ui,sans-serif]">
      {/* nav */}
      <header className="w-full max-w-md flex items-center justify-between pb-4">
        <a href="https://blueagent.dev" className="flex items-center gap-2">
          <span className="text-[#0052FF] text-sm leading-none">🟦</span>
          <span className={`${MONO} text-xs tracking-[0.2em] text-[#EDEDF2]`}>
            BLUEAGENT
          </span>
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className={`${MONO} text-[10px] tracking-widest border border-[#1A1A22] px-2 h-6 hover:border-[#0052FF] transition-colors ${
              soundOn ? "text-[#2ECC71]" : "text-[#4A4A55]"
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
            className={`${MONO} text-[10px] text-[#4A4A55] tracking-widest`}
          >
            FREE · 2/DAY
          </span>
        </div>
      </header>

      {/* token bar — tự ẩn khi TOKEN_CA rỗng */}
      {TOKEN_CA && (
        <button
          onClick={copyCA}
          className={`${MONO} w-full max-w-md flex items-center justify-between border border-[#1A1A22] bg-[#0A0A10] px-3 h-9 text-[10px] tracking-widest hover:border-[#0052FF] transition-colors`}
        >
          <span className="text-[#4A4A55]">
            {TOKEN_TICKER} <span className="text-[#EDEDF2]">{shortCA}</span>
          </span>
          <span className={copied ? "text-[#2ECC71]" : "text-[#0052FF]"}>
            {copied ? "✓ COPIED" : "COPY CA"}
          </span>
        </button>
      )}

      <ActivityTicker onSelect={openPreviewFor} />

      {/* eyebrow + hero */}
      <div className="w-full max-w-md mt-6">
        <span className={`${MONO} text-[11px] text-[#4A4A55] tracking-widest`}>
          <span className="text-[#0052FF]">{"// 0.1"}</span> Blue Forge · a
          Blue Image experiment
        </span>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight leading-[1.05]">
          Hood up.
          <br />
          <span className="text-[#0052FF]">Stay based.</span>
        </h1>
      </div>

      {/* tabs */}
      <div className="w-full max-w-md mt-5 flex border border-[#1A1A22]">
        {(["forge", "gallery"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`${MONO} relative flex-1 h-10 text-[11px] tracking-widest transition-colors ${
              tab === t
                ? "text-white"
                : "bg-transparent text-[#4A4A55] hover:text-[#EDEDF2]"
            }`}
          >
            {tab === t && (
              <motion.div
                layoutId="tab-active"
                className="absolute inset-0 bg-[#0052FF]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">
              {t === "forge" ? "FORGE" : "GALLERY"}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "forge" && (
          <motion.div
            key="forge-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mt-4 w-full max-w-md"
          >
            <p className="text-sm text-[#8A8A96] mb-4">
              Drop your pfp — the forge adds the green hoodie and keeps
              everything else exactly as it was. ~10 seconds. No wallet, no
              signup.
            </p>

            <div
              className="relative aspect-square w-full border border-[#1A1A22] bg-[#0A0A10] flex items-center justify-center overflow-hidden cursor-pointer"
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
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              ) : src ? (
                <img
                  src={src}
                  alt="your pfp"
                  className={`w-full h-full object-cover ${
                    busy ? "opacity-30" : ""
                  }`}
                />
              ) : (
                <div className="text-center">
                  <div className={`${MONO} text-[#0052FF] text-sm`}>[ + ]</div>
                  <p className="mt-2 text-xs text-[#5A5A66]">
                    Drop your pfp here, or click to browse
                  </p>
                </div>
              )}
              <ForgeTerminal
                active={busy || (stage === "done" && !!out)}
                done={stage === "done"}
                serial={serial}
              />
            </div>

            {/* data strip */}
            <div
              className={`${MONO} flex items-center justify-between border border-t-0 border-[#1A1A22] bg-[#0A0A10] px-3 h-9 text-[10px] tracking-widest`}
            >
              <span className="text-[#4A4A55]">
                FORGE ID{" "}
                <span className="text-[#0052FF]">{serial || "—"}</span>
              </span>
              <span className="text-[#4A4A55]">
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

            <div className="mt-4 grid grid-cols-1 gap-2">
              {stage !== "done" && (
                <button
                  onClick={forge}
                  disabled={!src || busy}
                  className="h-12 bg-[#0052FF] text-white text-sm font-medium tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0047DD] transition-colors"
                >
                  {busy ? "Forging…" : "Forge it →"}
                </button>
              )}
              {stage === "done" && (
                <>
                  <button
                    onClick={download}
                    className="h-12 bg-[#0052FF] text-white text-sm font-medium tracking-wide hover:bg-[#0047DD] transition-colors"
                  >
                    Download pfp
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={shareX}
                      className="h-11 border border-[#1A1A22] text-sm text-[#EDEDF2] hover:border-[#0052FF] transition-colors"
                    >
                      Share on X
                    </button>
                    <button
                      onClick={() => {
                        setOut(null);
                        setSerial("");
                        setStage("ready");
                      }}
                      className="h-11 border border-[#1A1A22] text-sm text-[#8A8A96] hover:border-[#0052FF] hover:text-[#EDEDF2] transition-colors"
                    >
                      Forge again
                    </button>
                  </div>
                </>
              )}
              {stage === "error" && (
                <p className={`${MONO} text-xs text-[#FF4D4D] text-center`}>
                  {err}
                </p>
              )}
            </div>

            <p
              className={`${MONO} mt-3 text-[9px] text-[#4A4A55] tracking-widest text-center`}
            >
              FORGES APPEAR IN THE PUBLIC GALLERY · PRESS{" "}
              <span className="text-[#0052FF]">⌘K</span> FOR COMMANDS
            </p>
          </motion.div>
        )}

        {tab === "gallery" && (
          <motion.div
            key="gallery-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mt-4 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#8A8A96]">
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
                className={`${MONO} text-xs text-[#4A4A55] text-center py-10 tracking-widest`}
              >
                LOADING…
              </p>
            ) : gallery.length === 0 ? (
              <p
                className={`${MONO} text-xs text-[#4A4A55] text-center py-10 tracking-widest`}
              >
                NO FORGES YET — BE THE FIRST
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {gallery.map((g, i) => (
                  <motion.button
                    key={g.serial}
                    onClick={() => {
                      setPreview(g);
                      setPreviewMode("slider");
                    }}
                    className="border border-[#1A1A22] hover:border-[#0052FF] transition-colors text-left"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.02, 0.4),
                      duration: 0.2,
                    }}
                  >
                    <img
                      src={g.url}
                      alt={g.serial}
                      loading="lazy"
                      className="w-full aspect-square object-cover"
                    />
                    <div
                      className={`${MONO} text-[9px] text-[#4A4A55] tracking-widest px-1.5 py-1 bg-[#0A0A10]`}
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

      {/* lightbox preview — slider + rarity card */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="fixed inset-0 z-50 bg-[#050508]/90 backdrop-blur-sm flex items-center justify-center p-6"
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
                    className={`${MONO} flex items-center justify-between border border-t-0 border-[#1A1A22] bg-[#0A0A10] px-3 h-9 text-[10px] tracking-widest`}
                  >
                    <span className="text-[#0052FF]">{preview.serial}</span>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/f/${preview.serial}`}
                        target="_blank"
                        rel="noopener"
                        className="text-[#4A4A55] hover:text-[#EDEDF2]"
                      >
                        SHARE ↗
                      </a>
                      <button
                        onClick={() => setPreviewMode("card")}
                        className="text-[#4A4A55] hover:text-[#EDEDF2]"
                      >
                        CARD
                      </button>
                      <button
                        onClick={() => setPreview(null)}
                        className="text-[#4A4A55] hover:text-[#EDEDF2]"
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
                    className={`${MONO} flex items-center justify-between border border-t-0 border-[#1A1A22] bg-[#0A0A10] px-3 h-9 text-[10px] tracking-widest`}
                  >
                    <button
                      onClick={() => setPreviewMode("slider")}
                      className="text-[#4A4A55] hover:text-[#EDEDF2]"
                    >
                      ← SLIDER
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      className="text-[#4A4A55] hover:text-[#EDEDF2]"
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

      <p
        className={`${MONO} mt-6 text-center text-[10px] text-[#4A4A55] tracking-widest`}
      >
        BLUE IMAGE IS COMING · ONCHAIN-NATIVE · PAY-PER-RENDER
      </p>

      <footer
        className={`${MONO} mt-auto pt-8 text-[10px] text-[#4A4A55] tracking-widest text-center`}
      >
        <a href="https://blueagent.dev" className="hover:text-[#0052FF]">
          BLUEAGENT
        </a>{" "}
        · THE BUILDER OS FOR BASE · BY{" "}
        <a href="https://x.com/blueagent_" className="hover:text-[#0052FF]">
          @BLUEAGENT_
        </a>
      </footer>
    </main>
  );
}
