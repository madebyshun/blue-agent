export default function Footer() {
  return (
    <footer className="py-8 px-6" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--text)" }}>
          🔵 Blue Agent
        </span>

        <div className="flex gap-6 flex-wrap justify-center">
          <a href="/code" className="hover:text-gray-900 transition-colors" style={{ color: "var(--text-muted)" }}>
            Console
          </a>
          <a href="/rewards" className="hover:text-gray-900 transition-colors" style={{ color: "var(--text-muted)" }}>
            Rewards
          </a>
          <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors" style={{ color: "var(--text-muted)" }}>
            X / Twitter
          </a>
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors" style={{ color: "var(--text-muted)" }}>
            Telegram
          </a>
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors" style={{ color: "var(--text-muted)" }}>
            GitHub
          </a>
        </div>

        <span className="text-center">
          Built by <a href="https://x.com/blockyonbase" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>Blocky Studio</a> · Powered by Bankr · Base 🔵
        </span>
      </div>
    </footer>
  );
}
