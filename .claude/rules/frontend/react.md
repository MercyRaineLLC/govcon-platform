---
description: React component patterns, hooks, state, props, routing for MrGovCon frontend
scope: project
appliesTo: frontend/**/*.{tsx,ts}
---

# React Patterns — MrGovCon Frontend

## Stack
React 18 · Vite 5 · TypeScript 5.9 · TanStack Query · React Router 6 · Tailwind · Lucide · axios.

## File Layout

```
frontend/src/
├── pages/          # Route components (one per URL)
├── components/     # Reusable UI components
│   ├── cards/      # Domain card components
│   ├── charts/     # Recharts wrappers
│   └── ui.tsx      # Generic UI primitives
├── hooks/          # Custom hooks
├── services/       # API client (api.ts)
├── contexts/       # React contexts (Toast, Auth)
└── App.tsx         # Routing
```

## Component Patterns

### Function Components Only
No class components. `export function Name()` or `export default function Name()`.

### Props Typing
```tsx
interface Props {
  opportunityId: string
  onUpdate?: () => void
}

export function ComplianceGapAnalysis({ opportunityId, onUpdate }: Props) { ... }
```

### State Management
- Local: `useState`
- Server: TanStack Query (`useQuery`, `useMutation`)
- Global UI: React Context (Toast, Auth)
- DO NOT add Redux, Zustand, Jotai

### TanStack Query Pattern
```tsx
const { data, isLoading } = useQuery({
  queryKey: ['opportunities', firmId],
  queryFn: () => opportunitiesApi.list(firmId),
})

const mutation = useMutation({
  mutationFn: opportunitiesApi.update,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
})
```

## Existing Hooks (Use These, Don't Reinvent)
- `useAuth()` → `{ user, firm, login, logout }`
- `useBranding(firmId?)` → `{ branding, loading, error }` — for white-label UI
- `useExportCsv()` — CSV export
- `useJobPolling(jobId)` — poll BullMQ status
- `useFavorites()`, `useRecentlyViewed()` — localStorage-backed
- `useToast()` — show toast via context

## Branding-Aware Components (Critical)

Any logged-in component:
```tsx
const { branding } = useBranding(firm?.id)              // consultant
const { branding } = useBranding(client?.consultingFirmId)  // client portal
const { branding } = useBranding(firmIdFromQuery)       // login (firm query param)
```
Use `branding.primaryColor`, `branding.secondaryColor`, `branding.displayName`, `branding.tagline`, `branding.logoUrl`.

## Routing

- Routes in `App.tsx`
- Protected: `<ProtectedRoute />` wrapper for consultant routes
- Client portal: `/client-login`, `/client-portal` — separate auth
- Use `useNavigate()` for programmatic, `<Link>` for declarative

## API Calls

- Prefer `services/api.ts` API client
- Direct axios for one-offs — base URL: `(import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'`
- Auth header:
  - Consultant: `Authorization: Bearer ${localStorage.getItem('auth_token')}`
  - Client: `Authorization: Bearer ${clientAuth?.token}` (from `localStorage.getItem('govcon_client_auth')`)
- Always handle errors: `.catch((err) => setError(err?.response?.data?.error || 'Generic message'))`

## Forms

- Controlled inputs (value + onChange)
- Submit: `async (e: React.FormEvent) => { e.preventDefault(); ... }`
- Loading: disable submit + spinner
- Group complex form state: `setForm({ ...form, [field]: value })`

## Toasts

```tsx
import { useToast } from '../contexts/ToastContext'
const { showToast } = useToast()
showToast({ message: 'Saved', type: 'success' })
```
Never use `alert()` or browser native notifications.

## Loading & Empty States

```tsx
if (loading) return <CenteredSpinner />
if (error) return <ErrorPanel error={error} />
if (data.length === 0) return <EmptyState icon={FileText} message="No items yet" />
return <DataList items={data} />
```

## TypeScript

- `strict: true` mandatory
- Avoid `any`; use `unknown` and narrow
- Import types alongside values: `import { type LucideIcon } from 'lucide-react'`
- Discriminated unions for status: `type Status = 'idle' | 'loading' | 'success' | 'error'`

## Performance

- `useMemo` only for measured-expensive derivations
- `useCallback` only when passing to memoized children
- Don't over-memoize
- Lazy-load heavy routes only if bundle >500KB

## Don't

- ❌ Class components
- ❌ Redux or other state libs
- ❌ DOM manipulation (`document.querySelector`)
- ❌ Inline async IIFEs in JSX
- ❌ Mix client + consultant auth tokens
- ❌ Skip `useBranding` on logged-in components
- ❌ Use `useEffect` for derived state — compute inline or `useMemo`
- ❌ Skip `key` props on lists
