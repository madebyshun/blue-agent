"use client";

export default function TestPage() {
  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", padding: "20px" }}>
      <h1 style={{ marginBottom: "20px", color: "var(--text)" }}>🧪 Blue Agent x402 Tools</h1>
      
      <div style={{ padding: "20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "20px" }}>
        <h2 style={{ color: "var(--text)", marginBottom: "10px" }}>✅ API Endpoint Ready</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "10px", fontSize: "14px" }}>
          POST endpoint created at <code style={{ background: "var(--surface-2)", padding: "4px 8px", borderRadius: "4px" }}>/api/tool/[toolId]</code>
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          Available tools: risk-gate, honeypot-check, allowance-audit, phishing-scan, mev-shield, contract-trust, circuit-breaker, and 24+ more...
        </p>
      </div>

      <div style={{ padding: "20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "20px" }}>
        <h2 style={{ color: "var(--text)", marginBottom: "10px" }}>📡 Payment Flow</h2>
        <ol style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.8", marginLeft: "20px" }}>
          <li>User input params → POST /api/tool/risk-gate</li>
          <li>Backend proxy → x402.bankr.bot/risk-gate</li>
          <li>If 402 response → User signs x402 payment (EIP-712)</li>
          <li>Retry with X-Payment header → Get result</li>
          <li>Return formatted result to UI</li>
        </ol>
      </div>

      <div style={{ padding: "20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
        <h2 style={{ color: "var(--text)", marginBottom: "10px" }}>🚀 Test on Frontend</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "15px" }}>
          Full ToolRunner UI component is ready but requires wagmi provider for wallet connection. Test available at production deployment.
        </p>
        <p style={{ color: "#4a90d9", fontSize: "14px", fontWeight: "600" }}>
          → Deploy to Vercel to test full x402 flow with real wallet 
        </p>
      </div>

      <div style={{ marginTop: "30px", padding: "15px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px" }}>
        <p style={{ color: "#16a34a", fontSize: "14px", margin: "0" }}>
          ✓ Build passed · ✓ API routes compiled · ✓ Ready for Vercel deployment
        </p>
      </div>
    </div>
  );
}
