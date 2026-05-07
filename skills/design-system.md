# Design System

Source of truth for Blue Agent's visual design. Derived from `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`, and all components in `apps/web/src/components/`.

---

## Color palette

All colors are dark-mode only. There is no light mode — the app is always dark.

| Token | Hex / Value | Tailwind class | Use |
|---|---|---|---|
| Background | `#050508` | `bg-bg` / `bg-[#050508]` | Page background |
| Surface | `#0D0D14` | `bg-surface` / `bg-[#0D0D14]` | Cards, panels |
| Border | `#1A1A2E` | `border-border` / `border-[#1A1A2E]` | All borders |
| Blue (primary) | `#4FC3F7` | `text-blue` / `text-[#4FC3F7]` | CTAs, highlights, accents |
| Blue (hover) | `#29ABE2` | `hover:bg-[#29ABE2]` | Button hover state |
| Purple (accent) | `#A78BFA` | `text-purple` / `text-[#A78BFA]` | Secondary accent, badges |
| Text primary | `#E2E8F0` | `text-slate-200` | Body text |
| Text secondary | `#94A3B8` | `text-slate-400` | Descriptions, labels |
| Text muted | `#64748B` | `text-slate-500` / `text-slate-600` | Timestamps, hints |
| Emerald (live/success) | `#34D399` | `text-emerald-400` | Live badges, success states |
| Red (error) | `#F87171` | `text-red-400` | Error messages |

### CSS variables (`:root`)

```css
--bg:      #050508
--blue:    #4FC3F7
--purple:  #A78BFA
--surface: #0D0D14
--border:  #1A1A2E
```

---

## Theme system

- **Always dark.** There is no light/dark toggle — `ThemeProvider` is a no-op stub that always returns `"dark"`.
- No `data-theme` attribute. No `localStorage` key. Just dark.
- `body` background is `var(--bg)` (`#050508`), text is `#E2E8F0`.

---

## Typography

| Font | Use | Tailwind class |
|---|---|---|
| Inter | Body text, descriptions | `font-sans` (default) |
| JetBrains Mono | ALL UI labels, commands, badges, buttons, nav | `font-mono` |

Weights used: 400, 500, 600, 700, 800 (bold headers via `font-bold`).

**Rule:** Use `font-mono` for nearly all visible UI text. Inter is used only for longer descriptive paragraphs (`text-slate-400`). When in doubt, use `font-mono`.

---

## Background patterns

Defined in `tailwind.config.ts` as `backgroundImage` extensions:

| Class | Effect |
|---|---|
| `bg-grid-pattern` | Subtle blue dot-grid at 40×40px intervals |
| `bg-hero-glow` | Radial glow from top center (blue, `rgba(79,195,247,0.12)`) |
| `bg-blue-glow` | Radial blue glow centered (use on CTA sections) |
| `bg-purple-glow` | Radial purple glow centered (use on accent sections) |

Grid pattern usage:
```tsx
<div className="absolute inset-0 bg-grid-pattern" style={{ backgroundSize: "40px 40px" }} />
<div className="absolute inset-0 bg-hero-glow" />
```

---

## Utility classes (defined in `globals.css`)

| Class | Effect |
|---|---|
| `.text-gradient-blue` | Blue→purple gradient text (Inter + clip) |
| `.text-gradient-white` | White→faded-white gradient text |
| `.border-glow-blue` | Blue border + outer/inner box-shadow glow |
| `.border-glow-purple` | Purple border + outer/inner box-shadow glow |
| `.card-surface` | Dark surface card: `bg-[#0D0D14]/80 border border-[#1A1A2E] backdrop-blur-xl` |
| `.card-hover` | Hover lift: `translateY(-2px)` + blue border glow on hover |
| `.glow-dot` | 8px filled blue circle with radial glow (used in logo/status indicators) |

---

## Components

### `Navbar`

Fixed top bar. `z-50`, `backdrop-blur-xl`, `border-b border-[#1A1A2E]`.

```tsx
<Navbar />
// No props. Reads pathname for active state. Links: /code /chat /launch /market /rewards
```

- Logo: `BLUE` in white + `AGENT` in `#4FC3F7`, `font-mono tracking-widest`
- Active nav link: `text-[#4FC3F7] bg-[#4FC3F7]/10`
- Inactive: `text-slate-400 hover:text-white`
- CTA button: `bg-[#4FC3F7] text-[#050508] font-mono font-semibold` → "Open Console"
- Mobile: hamburger toggle with slide-down menu

---

### `HeroSection`

Full-height landing section with grid background, animated orbs, 2-column layout, and animated chat mockup.

```tsx
<HeroSection />
// No props. Fetches $BLUEAGENT price live from GeckoTerminal API every 30s.
```

- Left: headline, price ticker, CTA buttons
- Right: animated chat window cycling through `blue idea / build / audit / ship / raise` scenes
- Stats bar: 4 stats in `card-surface rounded-xl` tiles

Chat bubble styles:
- User message: `bg-[#4FC3F7] text-[#050508] rounded-br-sm`
- Agent message: `bg-[#1A1A2E] text-slate-300 border border-[#2A2A4E] rounded-bl-sm`

---

### `FeaturesSection`

3-column grid of command cards. Uses `.card-surface .card-hover`.

```tsx
<FeaturesSection />
// No props. Static data — 6 feature cards (idea, build, audit, ship, chat, launch).
```

Command badge style:
```tsx
<div className="font-mono text-[10px] text-[#4FC3F7] tracking-widest px-2 py-1 bg-[#4FC3F7]/5 border border-[#4FC3F7]/20 rounded">
  blue idea
</div>
```

---

### `HowItWorksSection`

3-step flow + artifacts table.

```tsx
<HowItWorksSection />
// No props. Steps: idea → build → ship. Artifacts table below.
```

Step number badge: `w-10 h-10 rounded-xl bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] font-mono font-bold`

---

### `TokenSection`

$BLUEAGENT token card with copy-to-clipboard address, payment rails list, and external links.

```tsx
<TokenSection />
// No props. Hardcoded token: 0xf895783b2931c919955e18b5e3343e7c7c456ba3
```

---

### `ComingSoonSection`

3-column product cards for upcoming surfaces (Chat, Launch, Market). Live badge = emerald, Soon = purple.

```tsx
<ComingSoonSection />
// No props. Static data.
```

Badge styles:
- Live: `text-emerald-400 bg-emerald-400/5 border-emerald-400/20`
- Soon: `text-[#A78BFA] bg-[#A78BFA]/5 border-[#A78BFA]/20`

---

### `FooterCTA`

Full-width CTA section with blue glow background.

```tsx
<FooterCTA />
// No props.
```

---

### `Footer`

Minimal bottom bar with logo, nav links, X icon, tagline.

```tsx
<Footer />
// No props.
```

---

### `ToolRunner`

x402 pay-per-use tool runner. Handles 402 payment flow: call → sign → pay → result.

```tsx
<ToolRunner toolId="risk-gate" price="0.05" />
// toolId: key from TOOL_SCHEMAS in packages/core/src/tool-inputs.ts
// price: display string in USDC
```

States: `idle | calling | signing | paying | done | error`

Input field style:
```tsx
className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#4FC3F7]/40"
```

Result display: `<pre>` block in `bg-[#050508] border border-[#1A1A2E] rounded-xl` with `font-mono text-xs text-slate-300`.

---

### `ThemeProvider`

No-op stub. Always dark. Wrap layout children with it for future compatibility only.

```tsx
<ThemeProvider>{children}</ThemeProvider>
// useTheme() always returns { theme: "dark", toggle: () => {} }
```

---

## Animations

| Class | Description |
|---|---|
| `animate-pulse-slow` | 4s slow pulse (used on background orbs) |
| `animate-fade-up` | 0.6s fade + slide up (for entrance animations) |
| `animate-scan-line` | 3s vertical scan line (terminal aesthetic) |
| `animate-spin` | Standard Tailwind spin (used in `Spinner` component) |
| `animate-pulse` | Standard Tailwind pulse (used on live indicators) |

---

## Design rules

1. **Dark only.** Never add light mode styles. Never add `dark:` Tailwind variants — everything is already dark.
2. **`font-mono` first.** All UI labels, nav items, buttons, badges, and command names use JetBrains Mono.
3. **Card pattern:** `card-surface rounded-2xl p-6` is the standard. Add `card-hover` for interactive cards.
4. **Border radius:** `rounded-lg` (8px) for inputs/buttons, `rounded-xl` (12px) for chips/badges, `rounded-2xl` (16px) for cards/panels.
5. **Blue accents:** `#4FC3F7` is the primary action color. Purple (`#A78BFA`) is for secondary/upcoming states only.
6. **No shadows on non-interactive elements.** Glow shadows (`box-shadow` with `rgba(79,195,247,…)`) are reserved for primary CTAs and hover states.
7. **Pill/badge style:** `rounded-full px-4 py-1.5 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5` with `font-mono text-xs tracking-widest`.
8. **Primary button:** `bg-[#4FC3F7] hover:bg-[#29ABE2] text-[#050508] font-mono font-semibold rounded-lg` — text is always dark on blue.
9. **Ghost button:** `border border-[#1A1A2E] hover:border-[#4FC3F7]/30 text-slate-400 hover:text-white rounded-lg` — no fill.
10. **Max width:** `max-w-7xl` for nav/footer, `max-w-5xl` for content sections, `max-w-6xl` for hero.

---

## Tone

Terminal-inspired, minimal, Linear-grade precision. No rounded bubbly UI. Sharp edges, monospace text, intentional negative space. Every element earns its place — no decorative padding, no gradients for the sake of gradients. Builder aesthetic: looks like a tool, not a product page.
