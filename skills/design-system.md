# Design System

Source of truth for Blue Agent's visual design. Derived from the official Blue Agent Design System handoff (Blocky Studio) and implemented in `apps/web/`.

---

## Color palette

Always dark. No light mode.

| Token | Hex | Tailwind / CSS var | Use |
|---|---|---|---|
| Background | `#060C18` | `bg-bg` / `--surface-bg` | Page background |
| Base layer | `#0A1628` | `--surface-base` | Layered backgrounds |
| Surface / Card | `#0F1C35` | `bg-surface` / `--surface-card` | Cards, panels |
| Mid | `#162040` | `bg-mid` / `--surface-mid` | Hover states, elevated surfaces |
| High | `#1E2E52` | `--surface-high` | Active states |
| Primary blue | `#1A52FF` | `bg-blue` / `--blue-500` | Primary CTAs, brand color |
| Blue-400 | `#4A7AFF` | `text-blue-400` / `--blue-400` | Active nav, link text |
| Cyan accent | `#33C3FF` | `text-cyan` / `--cyan-400` | Logo highlight, badges, accents |
| Cyan-300 | `#67E5FF` | `--cyan-300` | Legend tier, gradient peaks |
| Text primary | `#FFFFFF` | `text-white` / `--text-primary` | Headings, emphasis |
| Text secondary | `#B8CBE8` | `text-[#B8CBE8]` / `--text-secondary` | Body text, descriptions |
| Text muted | `#7A8FAE` | `text-[#7A8FAE]` / `--text-muted` | Labels, metadata |
| Text subtle | `#3D5275` | `text-[#3D5275]` / `--text-subtle` | Timestamps, section labels |
| Success | `#22C55E` | `text-emerald-400` / `--success` | Live status, positive delta |
| Warning | `#F59E0B` | `text-amber-400` / `--warning` | Streak, caution |
| Danger | `#EF4444` | `text-red-400` / `--danger` | Errors, blocked |

### Borders

| Token | Value | Use |
|---|---|---|
| `--border-subtle` | `rgba(255,255,255,0.06)` | Very faint dividers |
| `--border-muted` | `rgba(255,255,255,0.10)` | Default border (cards, inputs) |
| `--border-default` | `rgba(255,255,255,0.15)` | Ghost buttons, secondary borders |
| `--border-strong` | `rgba(26,82,255,0.35)` | Brand-tinted borders, focus rings |

Use `border-white/10` in Tailwind for default. Use `border-[#1A52FF]/35` for brand-tinted.

### Brand gradient

```css
--gradient-brand: linear-gradient(135deg, #1A52FF 0%, #33C3FF 100%)
```

Primary button background: `linear-gradient(135deg, #1A52FF, #2E6AFF)`  
Glow: `box-shadow: 0 0 20px rgba(26,82,255,0.35)`

---

## Theme system

Always dark. `ThemeProvider` is a no-op stub. No `data-theme` or `localStorage`.

---

## Typography

| Font | Use | Tailwind class |
|---|---|---|
| DM Sans | All UI text — buttons, labels, headings, body | `font-sans` (default) |
| JetBrains Mono | Contract addresses, commands, terminal text | `font-mono` |

**Rule:** Use `font-sans` for nearly all visible UI. Reserve `font-mono` for:
- Command names (`blue idea`, `/start`)
- Contract/wallet addresses
- Token tickers (`$BLUEAGENT`)
- Terminal-style indicators and status labels

Weights: 400 (body), 500 (label), 600 (heading/button), 700 (display).

Type scale from design system:
- Display: 48–72px, weight 700
- Headings: 18–28px, weight 600
- Body: 13–16px, weight 400, line-height 1.6
- Label-sm: 11px, weight 500, `letter-spacing: 0.08em`, uppercase

---

## Background patterns

| Tailwind class | Effect |
|---|---|
| `bg-grid-pattern` | Subtle cobalt dot-grid, 40×40px |
| `bg-hero-glow` | Radial blue glow from top center |
| `bg-blue-glow` | Centered radial blue glow (CTA sections) |
| `bg-cyan-glow` | Centered radial cyan glow |

---

## Utility classes (globals.css)

| Class | Effect |
|---|---|
| `.text-gradient-blue` | Cobalt→cyan gradient text |
| `.text-gradient-white` | White→faded gradient text |
| `.border-glow-blue` | Blue border + outer/inner box-shadow glow |
| `.border-glow-cyan` | Cyan border + outer/inner box-shadow glow |
| `.card-surface` | `bg: rgba(15,28,53,0.8) · border: rgba(255,255,255,0.08) · backdrop-blur` |
| `.card-hover` | Hover lift + blue border glow on hover (`translateY(-2px)`) |
| `.glow-dot` | 8px gradient circle (cobalt→cyan) with blue radial glow |
| `.btn-primary` | Gradient cobalt button, white text, blue glow shadow |
| `.btn-ghost` | Blue-tinted ghost button |
| `.input-base` | Dark input with focus ring |
| `.badge-brand` | Blue pill badge |
| `.badge-cyan` | Cyan pill badge |

---

## Components

### `Navbar`

Fixed top bar, `backdrop-blur-xl`, `border-b border-white/10`.

```tsx
<Navbar />
```

- Logo: `BLUE` white + `AGENT` in `#33C3FF`, `font-mono tracking-widest`
- Active link: `text-[#4A7AFF] bg-[#1A52FF]/10`
- CTA: `.btn-primary rounded-lg`

---

### `HeroSection`

Full-height hero, grid + glow bg, 2-column layout, animated chat mockup.

```tsx
<HeroSection />
// Fetches $BLUEAGENT price from GeckoTerminal every 30s
```

Chat bubble styles:
- User: gradient `#1A52FF → #2E6AFF`, white text
- Agent: `bg-[#162040] text-[#B8CBE8] border-white/10`

---

### `FeaturesSection`

3-column feature cards. Uses `.card-surface .card-hover`.

Command badge: `font-mono text-[10px] text-[#33C3FF] bg-[#1A52FF]/8 border-[#1A52FF]/25 rounded`

---

### `HowItWorksSection`

3-step flow cards + artifacts table.

Step number badge: `bg-[#1A52FF]/10 border-[#1A52FF]/30 text-[#4A7AFF] rounded-xl`

---

### `ComingSoonSection`

Product cards. Live badge = emerald, Soon = cyan.

- Live: `text-emerald-400 bg-emerald-400/5 border-emerald-400/20`
- Soon: `text-[#33C3FF] bg-[#33C3FF]/8 border-[#33C3FF]/20`

---

### `TokenSection`

$BLUEAGENT token card with copy-to-clipboard, payment rails, external links.

```tsx
<TokenSection />
```

---

### `FooterCTA`

Full-width CTA section with `bg-blue-glow` radial.

---

### `Footer`

Minimal bottom bar.

---

### `ToolRunner`

x402 pay-per-use tool runner. Payment flow: call → sign → pay → result.

```tsx
<ToolRunner toolId="risk-gate" price="0.05" />
```

Input uses `.input-base`. Address fields use `font-mono text-xs`. Primary run button uses `.btn-primary`.

---

### `ThemeProvider`

No-op stub. Always returns `{ theme: "dark" }`.

---

## Animations

| Class | Description |
|---|---|
| `animate-pulse-slow` | 4s slow pulse (background orbs) |
| `animate-fade-up` | 0.6s fade + slide up |
| `animate-scan-line` | 3s vertical scan |
| `animate-spin` | Spinner in ToolRunner |
| `animate-pulse` | Live status dots |

Timing: 120ms micro, 200ms normal, 300ms transitions. Easing: `ease-out` entries, `ease-in` exits. No bounces.

---

## Design rules

1. **Dark only.** Never add light mode. Never use `dark:` variants.
2. **DM Sans for UI, JetBrains Mono for code.** Swap carefully — this is the opposite of the old system.
3. **Cobalt blue (#1A52FF) is the brand color.** Cyan (#33C3FF) is the accent/gradient endpoint, not the primary.
4. **Gradient for primary buttons.** `linear-gradient(135deg, #1A52FF, #2E6AFF)` with white text — not flat fill.
5. **Subtle rgba borders.** Not hard hex borders. `rgba(255,255,255,0.10)` is the default.
6. **Glow shadows only on primary CTAs.** `0 0 20px rgba(26,82,255,0.35)` — not on cards or ghost elements.
7. **Border radius:** `4px` tags, `8px` buttons/inputs, `12px` cards, `24px` icon containers, `9999px` pills.
8. **No purple.** The old `#A78BFA` purple accent is replaced by cyan `#33C3FF` throughout.
9. **Card pattern:** `.card-surface rounded-2xl p-6` + `.card-hover` for interactive.
10. **Max widths:** `max-w-7xl` nav/footer, `max-w-5xl` sections, `max-w-6xl` hero.

---

## Activity tiers (Telegram / Rewards)

| Tier | Color | Multiplier |
|---|---|---|
| Builder | `#4A7AFF` | ×1.0 |
| Shipper | `#33C3FF` | ×1.3 |
| Founder | `#7FA5FF` | ×1.5 |
| Legend | `#67E5FF` | ×2.0 |

---

## Tone

Terminal-precision meets clean SaaS. Deep navy backgrounds. Cobalt CTAs. Sharp DM Sans for copy, Mono only for code. No rounded bubbly elements — every edge is intentional. Builder aesthetic: looks like a tool you'd actually use at 2am.
