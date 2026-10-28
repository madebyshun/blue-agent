"""Builds the article images as HTML from production figures, then renders PNGs
with headless Chrome. Every number here was read from blueagent.dev on 2026-10-28."""
import json, subprocess, os, sys

SP = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
LOGO = open(sys.argv[2]).read()
LOGO = LOGO[LOGO.index("<svg"):]
prov = json.load(open(os.path.join(SP, "prov.json")))
rows = prov.get("providers") or prov.get("rows")

# Analytics (prod /exchange/analytics, read 2026-10-28 18:14 UTC)
DAYS = [("10-21", 2.4, 39059, True), ("10-22", 2.8, 58686, False), ("10-23", 3.6, 67685, False), ("10-24", 2.8, 51903, False),
        ("10-25", 3.6, 122324, False), ("10-26", 2.9, 69085, False), ("10-27", 3.5, 100833, False), ("10-28", 2.6, 80228, True)]
STATS = [("X402 VOLUME · 8D", "$24.3k", "USDC on Base, measured"), ("PAID CALLS", "589,803", "EIP-3009 settlements"),
         ("SELLERS PAID", "1,516", "of 1,817 on Base"), ("TOP 10 SHARE", "83.5%", "of the volume")]

def usd(n):
    return f"${n/1000:.1f}k" if n >= 1000 else f"${n:,.0f}" if n >= 10 else f"${n:.2f}"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050508;color:#E2E8F0;font-family:'JetBrains Mono',monospace;width:%dpx;height:%dpx;overflow:hidden;position:relative}
.card{border:1px solid #1A1A2E;background:#0D0D14;border-radius:14px}
.lbl{font-size:13px;letter-spacing:.14em;color:#64748B}
.sub{color:#475569}
.mut{color:#94A3B8}
.acc{color:#4FC3F7}
.grn{color:#34D399}
.prose{font-family:Inter,sans-serif}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 60%% 50%% at 80%% 0%%,rgba(79,195,247,.10),transparent 70%%);pointer-events:none}
.badge{font-size:11px;border-radius:999px;border:1px solid;padding:3px 9px;white-space:nowrap}
.brand{display:flex;align-items:center;gap:12px}
.brand svg{width:34px;height:34px}
.brand span{font-size:16px;font-weight:700;letter-spacing:.16em}
"""

def page(w, h, body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS % (w, h)}</style></head><body><div class='glow'></div>{body}</body></html>"

def brand(extra=""):
    return f"<div class='brand'>{LOGO}<span>BLUE AGENT</span>{extra}</div>"

def tiles(stats, size=34):
    return "".join(f"<div class='card' style='padding:22px 24px'><div class='lbl'>{l}</div><div style='font-size:{size}px;font-weight:600;margin-top:10px'>{v}</div><div class='sub' style='font-size:13px;margin-top:6px'>{s}</div></div>" for l, v, s in stats)

pages = {}

# 1. Cover 1500x600
pages["01-cover"] = (1500, 600, page(1500, 600, f"""
<div style='position:absolute;inset:56px 64px;display:flex;flex-direction:column'>
  {brand()}
  <div style='margin-top:44px;font-size:56px;font-weight:700;line-height:1.1;letter-spacing:-.01em'>Every agent on Base,<br><span class='acc'>measured on chain.</span></div>
  <div class='mut prose' style='margin-top:20px;font-size:20px'>Ranked by the USDC each one was actually paid. Hire any of them from your own wallet.</div>
  <div style='margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:14px'>{tiles(STATS, 30)}</div>
</div>"""))

# 2. Agents list 1600x1000
top = rows[:7]
def row(i, r):
    host = (r["hosts"] or [r["payTo"][:10]])[0]
    payers = "2,000+" if r["payers"] >= 2000 else f"{r['payers']:,}"
    return f"""<div class='card' style='display:flex;align-items:center;gap:18px;padding:15px 22px'>
      <div style='width:30px;color:#475569;font-size:15px'>{i}</div>
      <div style='flex:1;min-width:0'>
        <div style='display:flex;gap:10px;align-items:center'><span style='font-size:18px;font-weight:600'>{host}</span></div>
        <div class='mut prose' style='font-size:14px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>{r['title'][:95]}</div>
        <div class='sub' style='font-size:12px;margin-top:4px'>{r['paidCalls']:,} paid calls · {payers} paying wallets · {r['payTo'][:6]}…{r['payTo'][-4:]}</div>
      </div>
      <div style='text-align:right'><div style='font-size:20px;font-weight:600'>{usd(r['usd'])}</div><div class='sub' style='font-size:12px'>8d, measured</div></div>
    </div>"""
pages["02-agents"] = (1600, 1000, page(1600, 1000, f"""
<div style='position:absolute;inset:44px 56px;display:flex;flex-direction:column;gap:14px'>
  <div style='display:flex;align-items:center;gap:18px'>{brand()}<span class='lbl' style='margin-left:8px'>// EXCHANGE</span><span class='sub' style='font-size:14px'>agents on Base · measured on chain · paid seller to buyer</span></div>
  <div class='lbl' style='margin-top:10px'>TOP SELLERS ON BASE <span class='sub' style='letter-spacing:0'>· by USDC received over x402, last 8 days</span></div>
  {''.join(row(i+1, r) for i, r in enumerate(top))}
  <div class='sub' style='font-size:13px;margin-top:auto'>Source: USDC paid to each seller's payTo on Base in an x402 (EIP-3009) settlement, read from chain. app.blueagent.dev/exchange, 2026-10-28.</div>
</div>"""))

# 3. Hire flow 1200x1200 (real quote from ax1.vc via blueagent.dev/api/hire, 2026-10-28)
step = lambda n, t, body: f"<div class='card' style='padding:26px 28px'><div class='lbl'>STEP {n}</div><div style='font-size:24px;font-weight:600;margin-top:8px'>{t}</div><div style='margin-top:16px'>{body}</div></div>"
kv = lambda k, v, c="": f"<div style='display:flex;justify-content:space-between;font-size:17px;padding:8px 0;border-top:1px solid #1A1A2E'><span class='sub'>{k}</span><span class='{c}'>{v}</span></div>"
pages["03-hire"] = (1200, 1200, page(1200, 1200, f"""
<div style='position:absolute;inset:56px;display:flex;flex-direction:column;gap:20px'>
  {brand()}
  <div style='font-size:44px;font-weight:700;line-height:1.15;margin-top:12px'>Hire an agent<br><span class='acc'>from its page.</span></div>
  {step(1, "Ask for the price", "<div class='mut prose' style='font-size:17px;line-height:1.6'>Blue Agent calls the seller unpaid and shows its own x402 quote, before anything is signed.</div>")}
  {step(2, "Check the quote", kv("Seller", "www.ax1.vc") + kv("Price", "0.02 USDC", "grn") + kv("Network", "Base 8453") + kv("Pays to", "0x7284…299C (the seller)") )}
  {step(3, "Sign once, straight to the seller", "<div class='mut prose' style='font-size:17px;line-height:1.6'>One EIP-3009 authorization in your wallet. No fee, no escrow: Blue Agent never holds the money. The answer comes back as the seller gave it.</div>")}
  <div class='sub' style='font-size:14px;margin-top:auto'>Live quote from www.ax1.vc, read through blueagent.dev/api/hire on 2026-10-28. Nothing was signed.</div>
</div>"""))

# 4. Analytics 1600x1000
peak = max(d[1] for d in DAYS)
bars = "".join(f"<div style='flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px;height:100%'><div style='font-size:13px' class='mut'>${v}k</div><div style='width:100%;height:{v/peak*190:.0f}px;background:{'rgba(31,111,147,.45)' if p else '#1f6f93'};border-radius:4px 4px 0 0'></div><div class='sub' style='font-size:12px'>{d}</div></div>" for d, v, c, p in DAYS)
def board(title, sub, items):
    li = "".join(f"<div style='display:flex;gap:12px;font-size:15px;padding:6px 0'><span class='sub' style='width:18px'>{i+1}</span><span style='flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>{h}</span><span class='mut'>{v}</span></div>" for i, (h, v) in enumerate(items))
    return f"<div class='card' style='padding:20px 22px'><div class='lbl'>{title} <span class='sub' style='letter-spacing:0'>· {sub}</span></div><div style='margin-top:10px'>{li}</div></div>"
h = lambda r: (r["hosts"] or [r["payTo"][:10]])[0]
rev = [(h(r), usd(r["usd"])) for r in rows[:5]]
wal = [(h(r), "2,000+" if r["payers"] >= 2000 else f"{r['payers']:,}") for r in sorted(rows, key=lambda r: -r["payers"])[:5]]
cal = [(h(r), f"{r['paidCalls']:,}") for r in sorted(rows, key=lambda r: -r["paidCalls"])[:5]]
pages["04-analytics"] = (1600, 900, page(1600, 900, f"""
<div style='position:absolute;inset:44px 56px;display:flex;flex-direction:column;gap:18px'>
  <div style='display:flex;align-items:center;gap:18px'>{brand()}<span class='lbl' style='margin-left:8px'>// ANALYTICS</span><span class='sub' style='font-size:14px'>the x402 market on Base, per day</span></div>
  <div style='display:grid;grid-template-columns:repeat(4,1fr);gap:14px'>{tiles(STATS, 30)}</div>
  <div class='card' style='padding:20px 24px;height:300px;display:flex;flex-direction:column'><div class='lbl'>USDC SETTLED PER DAY ON BASE <span class='sub' style='letter-spacing:0'>· lighter: first (mid-backfill) and today (partial)</span></div><div style='flex:1;display:flex;gap:16px;margin-top:14px'>{bars}</div></div>
  <div style='display:grid;grid-template-columns:repeat(3,1fr);gap:14px'>{board("REVENUE", "8d, USDC", rev)}{board("PAYING WALLETS", "distinct payers", wal)}{board("PAID CALLS", "settlements", cal)}</div>
  <div class='sub' style='font-size:13px;margin-top:auto'>Source: app.blueagent.dev/exchange/analytics, read 2026-10-28 18:14 UTC. Gross USDC; a seller's own test wallets are not subtracted.</div>
</div>"""))

for name, (w, hgt, html) in pages.items():
    p = os.path.join(SP, f"{name}.html")
    open(p, "w").write(html)
    png = os.path.join(OUT, f"{name}.png")
    subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={w},{hgt}", "--force-device-scale-factor=2", "--virtual-time-budget=4000", f"--screenshot={png}", f"file://{p}"],
                   check=True, capture_output=True)
    print("wrote", png)
