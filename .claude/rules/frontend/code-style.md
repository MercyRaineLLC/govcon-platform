---
description: TypeScript/JSX conventions, imports, file organization for MrGovCon frontend
scope: project
appliesTo: frontend/**/*.{tsx,ts}
---

# Frontend Code Style — MrGovCon

## File Naming

- Components: `PascalCase.tsx` (`ComplianceGapAnalysis.tsx`, `OnboardingWizard.tsx`)
- Hooks: `useCamelCase.ts` (`useBranding.ts`, `useExportCsv.ts`)
- Pages: `PascalCase.tsx` (`OpportunityDetail.tsx`)
- Utils: `camelCase.ts` (`formatCurrency.ts`)
- Layout/UI primitives: lowercase OK if matching existing convention (`layout.tsx`, `ui.tsx`)
- Index re-exports: `index.ts`

**Exception:** `components/layout.tsx` is intentionally lowercase — DO NOT rename. Import as `./components/layout`.

## Import Order

```tsx
// 1. React + framework
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'

// 2. External libraries
import axios from 'axios'
import { Shield, Loader } from 'lucide-react'

// 3. Internal: services, hooks, contexts (alphabetized)
import { useAuth } from '../hooks/useAuth'
import { useBranding } from '../hooks/useBranding'
import { opportunitiesApi } from '../services/api'

// 4. Internal: components (alphabetized)
import { ClientDeliverableReview } from '../components/ClientDeliverableReview'
import { ComplianceGapAnalysis } from '../components/ComplianceGapAnalysis'

// 5. Types (only if separate)
import type { Opportunity } from '../types'
```

## Variable Naming

- **State:** `noun` for value, `setNoun` for setter — `[count, setCount]`
- **Booleans:** `is*`, `has*`, `should*`, `can*`, `loading`, `saving`, `submitting`
- **Handlers:** `handle*` for inline, `on*` for props (`onClick`, `onUpdate`)
- **Refs:** `*Ref` (`inputRef`, `containerRef`)
- **Constants:** `SCREAMING_SNAKE` at module scope (`API_BASE`, `SET_ASIDE_LABELS`)

## TypeScript Strictness

```tsx
// ✅ DO
const [data, setData] = useState<Deliverable[]>([])
function calculate(amount: number): number { return amount * 1.05 }

// ❌ DON'T
const [data, setData] = useState<any[]>([])  // any
function calculate(amount) { return amount * 1.05 }  // implicit any
```

For environment variables in Vite:
```tsx
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
```
This `(import.meta as any)` cast is the project convention — don't fight it with `ImportMeta` augmentation files.

## JSX

### Conditional Rendering
- `&&` for show/hide: `{loading && <Spinner />}`
- Ternary for either/or: `{loading ? <Spinner /> : <Data />}`
- Avoid nested ternaries — extract to helper or early return

### List Rendering
```tsx
{items.map((item) => (
  <ItemCard key={item.id} item={item} />
))}
```
Always provide `key` (use stable IDs, never array index for dynamic lists).

### Event Handlers
- Inline simple: `onClick={() => setOpen(true)}`
- Extract complex: `onClick={handleSubmit}` defined above
- Stop propagation when needed: `onClick={(e) => { e.stopPropagation(); ... }}`

### className Composition
For dynamic classes, prefer template literals:
```tsx
className={`flex items-center gap-2 ${active ? 'text-blue-400' : 'text-gray-500'}`}
```
For complex conditions, use a helper:
```tsx
const classes = [
  'border rounded-lg p-4',
  isUrgent && 'border-orange-800 bg-orange-950/10',
  isOverdue && 'border-red-800 bg-red-950/10',
].filter(Boolean).join(' ')
```

## Comments

- **Default: NO comments.** Well-named identifiers explain themselves.
- Add a comment ONLY when the WHY is non-obvious: hidden constraints, workarounds, surprising behavior
- Never explain WHAT the code does (the code does that)
- Never reference current task or PR ("added for issue #123")
- One short line max — no multi-paragraph docstrings

## File Organization

- One default export per file (the component)
- Helper functions/components above the main component if used internally
- Interfaces near top, before component
- Constants at module scope, before interfaces

## Don't

- ❌ Use `var`
- ❌ Use `function` declarations for components (use `function Name()` form, but it's still arrow-equivalent — consistent style)
- ❌ Mix tabs/spaces — Prettier defaults: 2 spaces
- ❌ Trailing whitespace
- ❌ Unused imports (CI should catch)
- ❌ `console.log` left in committed code (use `logger` or remove)
- ❌ Magic numbers — extract to named constant
- ❌ `eslint-disable` without comment explaining why
- ❌ `as any` casts (except the documented `import.meta as any` Vite case)
