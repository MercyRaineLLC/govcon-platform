---
description: Tailwind, branding tokens, color palette, spacing — Mercy Raine LLC patriotic theme
scope: project
appliesTo: frontend/**/*.{tsx,ts,css}
---

# Frontend Styles — MrGovCon / Mercy Raine LLC

## Brand Identity Tokens

| Token | Value | Usage |
|---|---|---|
| Primary (Gold) | `#fbbf24` | Brand accents, CTA gradients (start) |
| Secondary (Amber) | `#f59e0b` | Borders, badges, CTA gradients (end) |
| Patriot Red | `#dc2626` | Critical/danger states, alerts |
| White | `#ffffff` | Hero text, contrast |
| Background (Navy) | `#040d1a` | Root background — match in `index.html` |
| Surface (Deep Navy) | `#050e1e` | Cards, panels |
| Surface Lift | `#071120` | Elevated panels (sidebar gradient stop) |
| Border Subtle | `rgba(26,46,74,0.7)` | Sidebar/section borders |

## CRITICAL: Branding-Aware Components

For ANY component shown to a logged-in user, do NOT hardcode `#fbbf24`/`#f59e0b`. Instead:

```tsx
import { useBranding } from '../hooks/useBranding'

const { branding } = useBranding(firm?.id)  // or client.consultingFirmId

// Use branding.primaryColor / branding.secondaryColor
<div style={{ background: `linear-gradient(90deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}>
```

The patriotic colors above are **defaults**. Each firm overrides via `ConsultingFirm.branding*` fields.

### Hex Transparency Pattern
For semi-transparent overlays of branding colors, append hex alpha:
```tsx
background: `${branding.secondaryColor}26`  // 15% opacity
border: `1px solid ${branding.secondaryColor}66`  // 40% opacity
```

## Tailwind Conventions

### Layout
- Use Tailwind utilities by default. Inline `style={{...}}` only for dynamic values (branding, calculated colors, gradients).
- Container: `max-w-5xl mx-auto px-6` for portal pages, `max-w-7xl` for admin/dashboard
- Vertical rhythm: `space-y-4` for stacked cards, `space-y-6` for section groups
- Grid: `grid grid-cols-2 md:grid-cols-4 gap-4` for KPI rows

### Color Classes (Tailwind tokens)
- Backgrounds: `bg-gray-950` (root), `bg-gray-900` (cards), `bg-gray-800` (inputs)
- Borders: `border-gray-800` (subtle), `border-gray-700` (active inputs)
- Text: `text-gray-100` (primary), `text-gray-300` (secondary), `text-gray-500` (muted), `text-gray-600` (very muted)
- Status: `text-red-400` (error), `text-yellow-400` (warning), `text-green-400` (success), `text-blue-400` (info)

### Severity Color Mapping (compliance, decisions)
| Severity | Background | Border | Text |
|---|---|---|---|
| CRITICAL | `bg-red-950/40` | `border-red-800` | `text-red-300` |
| HIGH | `bg-orange-950/40` | `border-orange-800` | `text-orange-300` |
| MEDIUM | `bg-yellow-950/40` | `border-yellow-800` | `text-yellow-300` |
| LOW | `bg-blue-950/40` | `border-blue-800` | `text-blue-300` |

### Cards
Use the existing `card` class (defined in global CSS). For ad-hoc panels:
```tsx
className="bg-gray-900 border border-gray-800 rounded-xl p-4"
```

### Buttons
- Primary CTA: branded gradient (use `branding.primaryColor` → `secondaryColor`)
- Secondary: `bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700`
- Destructive: `bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-700`
- Ghost: `text-gray-500 hover:text-gray-300`
- Sizing: `text-xs px-3 py-1.5 rounded` (compact), `text-sm px-4 py-2 rounded-lg` (standard)

### Inputs
```tsx
className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
```
Replace `focus:border-blue-500` with `focus:border-${branding.secondaryColor}` style for branded forms.

### Badges
```tsx
className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
```
Use `text-[10px]` and `text-[9px]` (Tailwind arbitrary values) for ultra-compact metadata.

## Icons (Lucide)

- Standard size: `w-4 h-4` (inline), `w-5 h-5` (header), `w-8 h-8` (hero), `w-12 h-12` (empty state)
- Color via `text-*` Tailwind class OR inline `style={{ color: branding.secondaryColor }}`
- Stroke: default; for active states `strokeWidth={2}`, default `strokeWidth={1.75}`

## Typography

- Font: System default (`-apple-system, BlinkMacSystemFont, ...`) — no custom fonts to keep bundle small
- Headings: `text-lg font-semibold` (h2), `text-2xl font-bold` (h1, KPI numbers), `text-sm font-medium` (subheads)
- Tracking: `tracking-wide` for branded display names, `tracking-widest` for ALL CAPS labels, `tracking-[0.15em] uppercase` for ultra-spacious uppercase
- Numbers: `font-mono` for IDs, hex codes, KPI counts

## Animation

- Loading: `animate-spin` on `<Loader />` icon
- Hover: `transition-colors` on buttons (no `transition-all` — too expensive)
- Float: `animate-float` (defined globally) for logo only
- Pulse: `animate-pulse` for skeleton loaders
- No CSS animations beyond what Tailwind provides — keep bundle lean

## Veteran-Owned Indicator

When `branding.isVeteranOwned`, show:
```tsx
<p className="text-[10px] text-amber-500/70 tracking-widest uppercase">
  ★ Veteran Owned · Patriot Operated
</p>
```

## Responsive

- Mobile: `flex-col` defaults
- Tablet/desktop: `md:flex-row md:gap-6` etc.
- Sidebar collapses on mobile (already handled in `layout.tsx`)
- KPI grids: `grid-cols-2 md:grid-cols-4`

## Don't

- ❌ Hardcode `#fbbf24` or `#f59e0b` outside the default branding hook fallback
- ❌ Use third-party UI libraries (no MUI, Chakra, shadcn additions) — keep stack lean
- ❌ Apply `dark:` Tailwind variants — the app is dark-first, single theme
- ❌ Use emoji as primary UI elements (only in audit messages, never in chrome)
- ❌ Add CSS-in-JS libraries (styled-components, emotion) — Tailwind + inline `style` only
