---
description: Testing patterns for MrGovCon frontend (Vitest + Playwright + React Testing Library)
scope: project
appliesTo: frontend/**/*.{test,spec}.{tsx,ts}
---

# Frontend Testing — MrGovCon

## Stack (Target)
- **Unit/component:** Vitest + React Testing Library (`@testing-library/react`)
- **E2E:** Playwright
- **API mocking:** MSW (Mock Service Worker)

> **Status:** Test infrastructure is not yet installed. When installing, follow the conventions below from day one.

## File Structure

```
frontend/src/
├── components/
│   ├── ComplianceGapAnalysis.tsx
│   └── ComplianceGapAnalysis.test.tsx     # co-located unit test
├── hooks/
│   ├── useBranding.ts
│   └── useBranding.test.ts
└── tests/
    ├── e2e/                                # Playwright specs
    │   ├── client-portal-flow.spec.ts
    │   └── consultant-dashboard.spec.ts
    └── setup.ts                            # MSW handlers, RTL setup
```

## Naming

- Unit/component: `<File>.test.tsx` (co-located)
- E2E: `<flow>.spec.ts` in `tests/e2e/`
- Test names use sentence form: `it('shows critical gaps when DoD opportunity has SDVOSB set-aside')`

## Coverage Targets (Critical Paths)

| Area | Target |
|---|---|
| Auth flows (login, JWT handling) | 90%+ |
| Branding (useBranding, BrandingSettings) | 80%+ |
| Multi-tenancy isolation (frontend assertions) | 80%+ |
| ClientDeliverableReview workflow | 80%+ |
| Forms (notification prefs, settings) | 70%+ |
| Charts/dashboards | 50%+ (visual, harder to assert) |
| Overall codebase | 70%+ |

## Component Test Pattern

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceGapAnalysis } from './ComplianceGapAnalysis'

// Mock useBranding hook
vi.mock('../hooks/useBranding', () => ({
  useBranding: () => ({ branding: { primaryColor: '#fbbf24', secondaryColor: '#f59e0b' }, loading: false }),
}))

describe('ComplianceGapAnalysis', () => {
  it('renders critical gaps with red severity styling', async () => {
    render(<ComplianceGapAnalysis opportunityId="opp-123" />)
    expect(await screen.findByText(/Critical/i)).toBeInTheDocument()
  })

  it('expands clause details on click', async () => {
    const user = userEvent.setup()
    render(<ComplianceGapAnalysis opportunityId="opp-123" />)
    const clause = await screen.findByText(/FAR 52.204-7/i)
    await user.click(clause)
    expect(screen.getByText(/SAM\.gov/i)).toBeInTheDocument()
  })
})
```

## Hook Test Pattern

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { useBranding } from './useBranding'

describe('useBranding', () => {
  it('returns default branding when no firmId provided', () => {
    const { result } = renderHook(() => useBranding(undefined))
    expect(result.current.branding.displayName).toBe('MrGovCon')
  })

  it('fetches firm branding when firmId provided', async () => {
    const { result } = renderHook(() => useBranding('633962dd-94a0-4ca5-aa27-8e980861021c'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.branding.displayName).toBe('Mr GovCon')
  })
})
```

## API Mocking (MSW)

`tests/setup.ts`:
```ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('http://localhost:3001/api/branding/:firmId', ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: {
        firmId: params.firmId,
        displayName: 'Mr GovCon',
        tagline: 'Bid Smarter. Win Bigger.',
        primaryColor: '#fbbf24',
        secondaryColor: '#f59e0b',
        isVeteranOwned: true,
      },
    })
  }),
]

export const server = setupServer(...handlers)
```

## E2E Test Pattern (Playwright)

```ts
import { test, expect } from '@playwright/test'

test('client can login and approve a deliverable', async ({ page }) => {
  await page.goto('http://localhost:3000/client-login?firm=633962dd-94a0-4ca5-aa27-8e980861021c')

  // Branded login renders
  await expect(page.getByText('Mr GovCon')).toBeVisible()

  // Login
  await page.getByLabel('Email').fill('client-test@apexfederal.com')
  await page.getByLabel('Password').fill('testpass123')
  await page.getByRole('button', { name: /sign in/i }).click()

  // Navigate to Proposals tab
  await page.getByRole('button', { name: 'Proposals' }).click()

  // Approve
  await page.getByText(/federal proposal/i).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(/approved/i)).toBeVisible()
})
```

## Multi-Tenancy Isolation Tests (Critical)

```ts
test('client cannot see another firms deliverables', async ({ page, request }) => {
  // Login as Firm A client
  const tokenA = await loginAs(request, 'firmA-client@example.com')

  // Try to fetch Firm B deliverable
  const res = await request.get(`${API_BASE}/api/client-deliverables/${firmBDeliverableId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  expect(res.status()).toBe(404)  // not visible
})
```

## What NOT to Test

- Tailwind class strings (brittle, low value)
- Lucide icon presence by class name (assert by `aria-label` if needed)
- Third-party library internals (TanStack Query, axios)
- Implementation details (state variable names, internal helpers)

**DO test:**
- User-visible behavior (text appears, click does X, form submits Y)
- Branding renders correctly per firm
- Tenant isolation (no cross-firm data leak)
- Error states (network failure, validation error)
- Loading states (spinner shown while fetching)

## Test Data

- Use the live test firms: `633962dd-...` (Mr GovCon), `8215901d-...` (Mr Freight Broker)
- Test client user: `client-test@apexfederal.com` / `testpass123`
- Reset test deliverables before E2E suites via `prisma.clientDocument.deleteMany({ where: { ... } })` in setup

## CI Integration

When set up in GitHub Actions:
```yaml
- run: npm install
- run: npm run test         # vitest
- run: npm run test:e2e     # playwright
- run: npx tsc --noEmit     # type check
- run: npm run build        # ensure prod build works
```

Block PR merges on test failures.

## Don't

- ❌ Test implementation details (rerender counts, internal state)
- ❌ Hardcode wait times (`await sleep(2000)`) — use Playwright auto-waiting
- ❌ Share state between tests (each test independent)
- ❌ Hit real APIs in unit tests (use MSW)
- ❌ Skip tests with `.skip` or `.only` in committed code
- ❌ Test third-party library behavior
- ❌ Snapshot test JSX trees (brittle, low signal)
