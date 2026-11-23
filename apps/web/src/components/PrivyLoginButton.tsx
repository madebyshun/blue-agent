"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWalletDisconnect } from "@/lib/walletSession";
import { describeLoginMethods } from "@/lib/privy/config";

export default function PrivyLoginButton({
  onDone,
  variant = "outline",
}: {
  onDone?: () => void;
  variant?: "outline" | "primary";
}) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const disconnect = useWalletDisconnect();

  const base =
    "w-full flex items-center justify-center font-mono text-[13px] font-semibold px-4 py-3 rounded-xl border transition-all disabled:opacity-50";

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className={base}
        style={{ borderColor: "#1A1A2E", background: "#0D0D16", color: "#64748b" }}
      >
        Loading...
      </button>
    );
  }

  if (authenticated) {
    const email = user?.email?.address;
    return (
      <button
        type="button"
        onClick={() => {
          logout();
          disconnect();
          onDone?.();
        }}
        className={`${base} hover:border-red-500/40 hover:text-red-300`}
        style={{ borderColor: "#1A1A2E", background: "#0D0D16", color: "#94a3b8" }}
      >
        Sign out{email ? ` · ${email}` : ""}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        login();
        onDone?.();
      }}
      className={`${base} hover:opacity-90`}
      style={
        variant === "primary"
          ? { borderColor: "#4FC3F7", background: "#4FC3F7", color: "#050508" }
          : {
              borderColor: "rgba(79,195,247,0.4)",
              color: "#4FC3F7",
              background: "rgba(79,195,247,0.10)",
            }
      }
    >
      Continue with {describeLoginMethods()}
    </button>
  );
}
