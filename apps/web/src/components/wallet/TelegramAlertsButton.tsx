"use client";
/**
 * "Get alerts on Telegram" for Blue Chat price alerts (plan 2026-10-06 task
 * 2.3). Same SIWE-minted deep link as Blue Hood's button (POST /api/hood/tglink
 * → t.me/<bot>?start=link_<code>): the code is minted only for the signed-in
 * wallet, so nobody can route a stranger's alerts to their own Telegram.
 * Once linked, lib/watches/deliver.ts sends each fired alert there; the bot's
 * `/alerts off` stops them.
 *
 * Popup-safe like the Hood button: open a blank tab inside the click, then
 * point it at the link once the fetch resolves.
 */
import { useEffect, useState } from "react";
import { useEnsureSession } from "@/hooks/useEnsureSession";

export function TelegramAlertsButton({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "busy" | "opened" | "error">("idle");
  const { hasSession, ensureSession, fetchWithSession } = useEnsureSession();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void hasSession(address).then((ok) => { if (live) setSignedIn(ok); });
    return () => { live = false; };
  }, [address, hasSession]);

  async function onClick() {
    if (state === "busy") return;
    if (!signedIn) {
      setState("busy");
      try { await ensureSession(address); setSignedIn(true); setState("idle"); } catch { setState("error"); }
      return;
    }
    setState("busy");
    const popup = typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const res = await fetchWithSession(address, "/api/hood/tglink", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }),
      });
      const body = (await res.json()) as { ok?: boolean; link?: string | null };
      const link = body?.ok ? body.link ?? null : null;
      if (!link) { if (popup) popup.close(); setState("error"); return; }
      if (popup) popup.location.href = link; else window.location.href = link;
      setState("opened");
    } catch {
      if (popup) popup.close();
      setState("error");
    }
  }

  const label = state === "busy" ? (signedIn ? "opening…" : "signing in…")
    : state === "opened" ? "tap Start in Telegram →"
      : state === "error" ? "Telegram unavailable"
        : signedIn ? "Get alerts on Telegram →" : "Sign in for Telegram alerts →";
  return (
    <button type="button" onClick={onClick} disabled={state === "busy"}
      className="font-mono text-[10px] underline disabled:opacity-60"
      style={{ color: state === "error" ? "#94a3b8" : "#4FC3F7" }}
      title="Link this wallet to the Blue Agent Telegram bot — fired alerts are sent there; /alerts off stops them">
      {label}
    </button>
  );
}
