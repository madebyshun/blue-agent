"use client";

import { useRef, useState } from "react";

// ── BLUE RENDER · drop reference (optional) + short context prompt ─
// Mặc định dùng mascot có sẵn (không cần upload). Muốn dùng ảnh khác
// thì kéo/thả vào khung — ảnh đó sẽ được dùng thay cho lượt render đó.

type Stage = "idle" | "rendering" | "done" | "error";

export default function BlueRender() {
  const [refImg, setRefImg] = useState<string | null>(null);
  const [scene, setScene] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState<{ scene: string; url: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return;
    const r = new FileReader();
    r.onload = () => setRefImg(r.result as string);
    r.readAsDataURL(f);
  }

  async function render() {
    if (!scene.trim()) return;
    setStage("rendering");
    setErr("");
    try {
      const body: any = { scene };
      if (refImg) {
        const [meta, b64] = refImg.split(",");
        body.image = b64;
        body.mimeType = meta.match(/data:(.*?);/)?.[1] ?? "image/png";
      }
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");
      const url = `data:image/png;base64,${data.image}`;
      setOut(url);
      setStage("done");
      setHistory((h) => [{ scene, url }, ...h].slice(0, 12));
    } catch (e: any) {
      setErr(e.message);
      setStage("error");
    }
  }

  function download() {
    if (!out) return;
    const a = document.createElement("a");
    a.href = out;
    a.download = `blueagent-render-${Date.now()}.png`;
    a.click();
  }

  const busy = stage === "rendering";
  const mono = "[font-family:'JetBrains_Mono',ui-monospace,monospace]";

  return (
    <main className="min-h-screen bg-[#050508] text-[#EDEDF2] flex flex-col items-center px-5 py-6 [font-family:'Inter_Tight',system-ui,sans-serif]">
      <header className="w-full max-w-md flex items-center justify-between pb-4">
        <span className="flex items-center gap-2">
          <span className="text-[#0052FF] text-sm leading-none">🟦</span>
          <span className={`${mono} text-xs tracking-[0.2em] text-[#EDEDF2]`}>
            BLUEAGENT
          </span>
        </span>
        <span className={`${mono} text-[10px] text-[#4A4A55] tracking-widest`}>
          INTERNAL
        </span>
      </header>

      <div className="w-full max-w-md mt-6">
        <span className={`${mono} text-[11px] text-[#4A4A55] tracking-widest`}>
          <span className="text-[#0052FF]">// internal</span> Blue Render ·
          mascot scene generator
        </span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight leading-[1.05]">
          Same bot.
          <br />
          <span className="text-[#0052FF]">Any scene.</span>
        </h1>
        <p className="mt-2 text-sm text-[#8A8A96]">
          Just type where the bot is. Identity and cinematic style are
          handled automatically.
        </p>
      </div>

      <div className="mt-6 w-full max-w-md">
        <div className="relative aspect-square w-full border border-[#1A1A22] bg-[#0A0A10] flex items-center justify-center overflow-hidden">
          {out ? (
            <img src={out} alt="rendered scene" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center px-6">
              <div className={`${mono} text-[#0052FF] text-sm`}>[ ◎ ]</div>
              <p className="mt-2 text-xs text-[#5A5A66]">
                Type a scene below, then render
              </p>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#050508]/60">
              <span className={`${mono} text-xs text-[#0052FF] animate-pulse`}>
                RENDERING…
              </span>
            </div>
          )}
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          className="mt-2 flex items-center gap-3 border border-t-0 border-[#1A1A22] bg-[#0A0A10] px-3 h-12 cursor-pointer hover:border-[#0052FF] transition-colors"
        >
          {refImg ? (
            <img src={refImg} alt="reference" className="w-8 h-8 object-cover border border-[#1A1A22]" />
          ) : (
            <div className={`${mono} w-8 h-8 flex items-center justify-center text-[#4A4A55] text-xs border border-[#1A1A22]`}>
              +
            </div>
          )}
          <span className={`${mono} text-[10px] text-[#4A4A55] tracking-widest flex-1`}>
            {refImg ? "CUSTOM REFERENCE — CLICK TO CHANGE" : "USING DEFAULT MASCOT — DROP TO OVERRIDE"}
          </span>
          {refImg && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRefImg(null);
              }}
              className={`${mono} text-[10px] text-[#FF4D4D] hover:underline`}
            >
              RESET
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <input
          type="text"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          placeholder="rooftop at night · forest · mountain sunrise · close-up portrait…"
          disabled={busy}
          className="mt-3 w-full border border-[#1A1A22] bg-[#0A0A10] px-3 h-11 text-sm text-[#EDEDF2] placeholder:text-[#4A4A55] focus:outline-none focus:border-[#0052FF]"
        />

        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            onClick={render}
            disabled={!scene.trim() || busy}
            className="h-12 bg-[#0052FF] text-white text-sm font-medium tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0047DD] transition-colors"
          >
            {busy ? "Rendering…" : "Render →"}
          </button>
          {stage === "done" && (
            <button
              onClick={download}
              className="h-11 border border-[#1A1A22] text-sm text-[#EDEDF2] hover:border-[#0052FF] transition-colors"
            >
              Download PNG
            </button>
          )}
          {stage === "error" && (
            <p className={`${mono} text-xs text-[#FF4D4D] text-center`}>{err}</p>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-8 w-full max-w-md">
          <p className={`${mono} text-[10px] text-[#4A4A55] tracking-widest mb-2`}>
            THIS SESSION
          </p>
          <div className="grid grid-cols-4 gap-2">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => {
                  setOut(h.url);
                  setScene(h.scene);
                }}
                title={h.scene}
                className="border border-[#1A1A22] hover:border-[#0052FF] transition-colors"
              >
                <img src={h.url} alt={h.scene} className="w-full aspect-square object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className={`${mono} mt-auto pt-10 text-[10px] text-[#4A4A55] tracking-widest text-center`}>
        BLUEAGENT · INTERNAL TOOL
      </footer>
    </main>
  );
}
