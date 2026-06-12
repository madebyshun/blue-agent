"use client";

// Camera QR scanner for BlueBank scan-to-pay. Streams the rear camera, decodes
// frames with jsQR, and calls onResult with the first QR payload found. Falls
// back to a manual paste box (desktop / camera denied). Non-custodial: this only
// reads a payment target — the user still signs the Send in their wallet.

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export default function QrScanner({
  onResult,
  onClose,
}: {
  // Return a string to reject the scan (shown to the user, keeps scanning);
  // return nothing to accept it (the parent closes the scanner).
  onResult: (text: string) => string | void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const lastRef = useRef<{ data: string; t: number }>({ data: "", t: 0 });

  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");
  const [ready, setReady] = useState(false);

  // Feed a decoded payload to the parent; show rejection note, dedupe repeats.
  function submit(data: string) {
    const now = Date.now();
    if (data === lastRef.current.data && now - lastRef.current.t < 1500) return true;
    lastRef.current = { data, t: now };
    const rejected = onResultRef.current(data);
    if (rejected) { setNote(rejected); return false; }
    return true; // accepted — parent unmounts us
  }

  useEffect(() => {
    let stopped = false;

    function tick() {
      if (stopped) return;
      const v = videoRef.current, c = canvasRef.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) { const ok = submit(code.data); if (ok) return; }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr("Camera not available — paste below"); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setReady(true);
        tick();
      } catch (e) {
        const name = (e as Error).name;
        setErr(name === "NotAllowedError" ? "Camera blocked — paste a link / address below"
          : name === "NotFoundError" ? "No camera found — paste below"
          : "Can't open camera — paste below");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] text-slate-500 tracking-widest">SCAN TO PAY · BASE</span>
          <button onClick={onClose} className="w-7 h-7 rounded-md font-mono text-[13px] text-slate-500 hover:text-white hover:bg-[#1A1A2E]">✕</button>
        </div>

        {/* Camera viewport */}
        {!err && (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-square mb-3">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {/* aiming frame */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-2/3 h-2/3 rounded-xl border-2 border-[#4FC3F7]/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {!ready && <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate-400">starting camera…</div>}
          </div>
        )}
        {err && <div className="font-mono text-[10px] text-amber-400 mb-3">{err}</div>}

        {/* Manual fallback — paste address / payment link */}
        <div className="flex gap-1.5">
          <input
            value={manual}
            onChange={e => { setManual(e.target.value); setNote(""); }}
            onKeyDown={e => { if (e.key === "Enter" && manual.trim()) submit(manual.trim()); }}
            placeholder="or paste 0x… / name.base / link"
            className="flex-1 bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-slate-200 placeholder:text-slate-700 outline-none" />
          <button
            onClick={() => manual.trim() && submit(manual.trim())}
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
            Use
          </button>
        </div>
        {note && <div className="font-mono text-[9px] text-red-500 mt-1.5">{note}</div>}

        <canvas ref={canvasRef} className="hidden" />
        <p className="font-mono text-[9px] text-slate-600 mt-3 leading-relaxed">
          Point at a BlueBank request QR or any wallet address. You&apos;ll confirm the amount and sign in your wallet — non-custodial.
        </p>
      </div>
    </div>
  );
}
