"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: "#050508", color: "#fff", fontFamily: "monospace", padding: "40px" }}>
        <p style={{ color: "#4FC3F7", fontSize: 11, letterSpacing: 4, marginBottom: 16 }}>// RUNTIME ERROR</p>
        <p style={{ color: "#F87171", fontSize: 14, marginBottom: 8 }}>{error?.message ?? "Unknown error"}</p>
        <pre style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", marginBottom: 24, maxWidth: 800 }}>
          {error?.stack ?? "No stack trace"}
        </pre>
        {error?.digest && (
          <p style={{ color: "#475569", fontSize: 10 }}>digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{ marginTop: 24, fontFamily: "monospace", fontSize: 11, padding: "8px 16px", background: "#0D0D1A", border: "1px solid #1A1A2E", color: "#4FC3F7", cursor: "pointer", borderRadius: 8 }}
        >
          → retry
        </button>
      </body>
    </html>
  );
}
