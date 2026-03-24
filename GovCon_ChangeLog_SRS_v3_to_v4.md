# GovCon Advisory Intelligence Platform
## Change Log: SRS v3.0 → v4.0
**Date:** March 23, 2026
**Prepared by:** Mercy Raine LLC Development Team

---

## Summary

This document records all feature additions, modifications, and bug fixes applied to the GovCon Advisory Intelligence Platform after SRS v3.0 (March 22, 2026). Changes span backend services, frontend pages, database schema, middleware, and infrastructure.

---

## 1. SUBSCRIPTION TIER ENFORCEMENT

### 1.1 Backend — Tier Gate Middleware (`backend/src/middleware/tierGate.ts`) NEW
- Created `requireFeature(feature)` Express middleware factory — returns HTTP 403 `TIER_LIMIT` if the firm's plan does not include the requested feature
- Created `checkClientLimit(consultingFirmId)` — returns `{ allowed, current, max }` against per-tier client cap
- Created `checkAiCallLimit(consultingFirmId)` — returns `{ allowed, current, max }` against per-tier monthly AI call cap
- Defined `TIER_FEATURES` map: Starter / Professional / Enterprise / Elite feature sets
- Defined `TIER_OPP_LIMITS`: Starter 150, Professional 750, Enterprise/Elite unlimited
- `getFirmPlan()` helper queries live plan from DB and returns slug, maxUsers, maxClients, aiCallsPerMonth

### 1.2 Billing Service (`backend/src/services/billingService.ts`) UPDATED
- Tier pricing revised to: Starter $299/mo, Professional $699/mo, Enterprise $1,800/mo, Elite $4,500/mo
- Limits revised:
  - Starter: 3 users, 10 clients, 100 AI calls/month
  - Professional: 8 users, 30 clients, 500 AI calls/month
  - Enterprise: unlimited users, unlimited clients, unlimited AI calls
  - Elite (Business Professional Enterprise): same as Enterprise + all add-ons included
- Default trial plan changed from `professional` → `starter`

### 1.3 Clients Route (`backend/src/routes/clients.ts`) UPDATED
- POST / now calls `checkClientLimit()` before creating a client
- Returns HTTP 422 `ValidationError` with upgrade message if at tier limit

### 1.4 Compliance Matrix Route (`backend/src/routes/complianceMatrix.ts`) UPDATED
- Both `/generate` and `/bid-guidance` endpoints now call `checkAiCallLimit()` first
- `/bid-guidance` additionally requires `requireFeature('bid_guidance')` (Professional+ only)
- Returns HTTP 403 `AI_LIMIT` with current/max counts when limit exceeded

---

## 2. FRONTEND TIER ENFORCEMENT

### 2.1 `useTier` Hook (`frontend/src/hooks/useTier.ts`) NEW
- Queries `/api/billing/subscription` and `/api/addons` via TanStack Query
- Exposes: `slug`, `status`, `usage`, `plan`, `isLoading`
- Methods: `hasFeature(feature)`, `hasAddon(addonSlug)`, `atOrAbove(tier)`
- `hasAddon()` always returns `true` for Elite plan (all add-ons included)

### 2.2 `TierGate` Component (`frontend/src/components/TierGate.tsx`) NEW
- Full-card gate (default): renders lock icon, required tier name, monthly price, and "Upgrade" button linking to `/billing`
- Compact variant: blurs children and overlays inline lock badge
- Used throughout Analytics, Opportunities, and Opportunity Detail pages

---

## 3. ADD-ON MARKETPLACE

### 3.1 Add-On Config (`backend/src/config/addons.ts`) NEW
- Defined `ADDON_CATALOG` with 8 add-ons:
  | Slug | Name | Price | Status |
  |------|------|-------|--------|
  | `proposal_assistant` | Proposal Writing Assistant | $249/mo | Available |
  | `competitor_intel` | Competitor Intelligence | $179/mo | Available |
  | `auto_sync` | Auto Daily SAM Sync | $49/mo | Available |
  | `branded_reports` | Branded PDF Reports | $79/mo | Coming Soon |
  | `teaming_finder` | Teaming Partner Finder | $129/mo | Coming Soon |
  | `state_municipal` | State & Municipal Pipeline | $99/mo | Coming Soon |
  | `api_access` | API Access | $199/mo | Coming Soon |
  | `executive_briefing` | Executive Briefing | $149/mo | Coming Soon |
- `isAddonIncluded(planSlug, addonSlug)` returns `true` for all add-ons when plan is `elite`

### 3.2 Add-Ons Route (`backend/src/routes/addons.ts`) NEW
- `GET /api/addons` — lists all add-ons from catalog with purchased status per firm
- `POST /api/addons/:slug/purchase` — admin only, appends slug to `purchasedAddons[]` on ConsultingFirm
- `DELETE /api/addons/:slug/cancel` — admin only, removes slug from `purchasedAddons[]`

### 3.3 Schema Change (`backend/prisma/schema.prisma`) UPDATED
- Added `purchasedAddons String[] @default([])` to `ConsultingFirm` model
- `prisma db push` applied — no data loss

### 3.4 Billing Page (`frontend/src/pages/Billing.tsx`) UPDATED
- Added "Add-On Marketplace" section between plan grid and invoice history
- Available add-ons show purchase button with price; purchased add-ons show "Cancel" option
- Coming-soon add-ons display "Notify Me" button
- Elite plan displays "Included in Plan" badge on every add-on
- Added usage meters for clients, users, and AI calls with color-coded progress bars (green/yellow/red)

---

## 4. PROPOSAL WRITING ASSISTANT (ADD-ON)

### 4.1 Proposal Assist Service (`backend/src/services/proposalAssist.ts`) NEW
- `generateProposalOutline(title, agency, requirements, enrichment, consultingFirmId)`
- Uses `generateWithRouter` with task type `BID_GUIDANCE`
- Returns `ProposalOutline`:
  - `executiveSummary`, `winThemes[]`, `sections[]` (with title + guidance), `discriminators[]`, `riskMitigations[]`, `pastPerformanceHint`
- Graceful JSON parse fallback if LLM returns malformed response

### 4.2 Proposal Assist Route (`backend/src/routes/proposalAssist.ts`) NEW
- `POST /api/proposal-assist/:opportunityId/outline`
- Checks AI call limit before proceeding
- Fetches opportunity + compliance matrix requirements as context
- Gated: requires `proposal_assistant` add-on (or Elite plan)

### 4.3 Opportunity Detail Page (`frontend/src/pages/OpportunityDetail.tsx`) UPDATED
- Added "Proposal Assistant" tab gated by `hasAddon('proposal_assistant')`
- On generate: displays executive summary, win themes, section drafts, discriminators, risk mitigations, and past performance hint
- Non-subscribers see TierGate upsell card

---

## 5. MULTI-MODEL LLM ABSTRACTION LAYER

### 5.1 LLM Provider Interface (`backend/src/services/llm/provider.interface.ts`) NEW
- Defines `LLMRequest`, `LLMResponse`, `LLMProvider` interfaces

### 5.2 Claude Provider (`backend/src/services/llm/claude.provider.ts`) NEW
- Wraps raw `fetch()` to Anthropic API
- Model: `claude-sonnet-4-6`
- Cost tracking: $3/M input tokens, $15/M output tokens

### 5.3 OpenAI Provider (`backend/src/services/llm/openai.provider.ts`) NEW
- Uses `openai` npm package
- Model: `gpt-4o-mini`
- Cost tracking: $0.15/M input, $0.60/M output

### 5.4 Insight Engine Provider (`backend/src/services/llm/insight.provider.ts`) NEW
- Uses `openai` npm package with custom `baseURL`
- Model: `deepseek-chat`
- Branded as "Insight Engine" — no vendor name exposed in UI or logs
- Cost tracking: $0.27/M input, $1.10/M output

### 5.5 LocalAI Provider (`backend/src/services/llm/localai.provider.ts`) NEW
- OpenAI-compatible client pointing to `http://local-ai:8080`
- For on-premise deployments — zero per-token cost

### 5.6 LLM Router (`backend/src/services/llm/llmRouter.ts`) NEW
- `generateWithRouter(req, consultingFirmId, { task, useCache })` — central dispatch function
- Reads `llmProvider` from firm record in DB; falls back to env vars
- Throws `NO_LLM_KEY` if no key is available (callers handle gracefully)
- Redis response cache: 7-day TTL, key = `llm:{task}:{sha256(prompts)[0:32]}`
- Writes `ApiUsageLog` row on every call (tokens, cost, duration, provider, task, cacheHit)

### 5.7 Schema Change — ApiUsageLog (`backend/prisma/schema.prisma`) UPDATED
- Added `ApiUsageLog` model: `id, consultingFirmId, provider, model, task, inputTokens, outputTokens, estimatedCostUsd, cacheHit, durationMs, createdAt`
- Added `llmProvider String @default("claude")`, `openaiApiKey String?`, `insightEngineApiKey String?` to `ConsultingFirm`
- Added `apiUsageLogs ApiUsageLog[]` backref on `ConsultingFirm`

### 5.8 Service Refactors
- `documentAnalysis.ts`: replaced direct Anthropic `fetch()` with `generateWithRouter()`; signature changed to accept `consultingFirmId` instead of raw API key
- `complianceMatrixService.ts`: removed `resolveAnthropicApiKey`, replaced both fetch blocks with `generateWithRouter()`; added Redis caching for compliance matrix and bid guidance calls
- `marketIntelligence.ts` and `revenueForecaster.ts`: updated to route through LLM router

### 5.9 Firm Route (`backend/src/routes/firm.ts`) UPDATED
- `GET /api/firm` now exposes `llmProvider`, `openaiApiKey` (masked), `insightEngineApiKey` (masked)
- `PUT /api/firm/llm-provider` — admin: set provider to `claude | openai | insight_engine | localai`
- `PUT /api/firm/openai-api-key` — admin: save or clear OpenAI key
- `PUT /api/firm/insight-engine-api-key` — admin: save or clear Insight Engine key
- `GET /api/firm/ai-usage?days=30` — aggregate `ApiUsageLog` by provider + task; returns totals + recent 100 rows

---

## 6. SETTINGS PAGE OVERHAUL

### `frontend/src/pages/Settings.tsx` — FULL REWRITE
- **Removed:** All AI provider API key input fields (Claude, OpenAI, Insight Engine, LocalAI)
- **Removed:** All related state variables, mutation hooks, and save handlers for AI keys
- **Added:** Read-only "AI Intelligence Provider" status card showing:
  - Active provider name with colored badge (purple/green/amber/cyan)
  - "Active" indicator dot
  - "Managed by platform" message — no credentials exposed to users
  - Collapsible AI usage summary (total calls, estimated cost, breakdown by task)
- **Kept unchanged:** SAM.gov API key management (customer-managed, expires every 90 days), Contract Sync Settings, Penalty Engine, Platform Users, Template Library Review

---

## 7. UI/UX POLISH

### Footer (`frontend/src/components/layout.tsx`) UPDATED
- Changed: `© 2026 MERCY RAINE LLC · SDVOSB · "Transporting Freight, Lives."` → `© {new Date().getFullYear()} MERCY RAINE LLC · SDVOSB · All Rights Reserved`

### Analytics Page (`frontend/src/pages/Analytics.tsx`) UPDATED
- "BigQuery" label → "Historical Data"
- Removed raw internal API endpoint (`POST /api/market-analytics/ingest`) from empty-state message visible to all users
- Wrapped Portfolio Health section in `TierGate` requiring Professional+
- Wrapped Deep Market Intelligence section in `TierGate` requiring Enterprise+

### Opportunity Detail Page (`frontend/src/pages/OpportunityDetail.tsx`) UPDATED
- Removed 4 instances of environment variable references (`ANTHROPIC_API_KEY`, `backend/.env`) that were visible to end users in error and empty-state messages
- Replaced with user-friendly: "AI key not configured — contact your administrator to enable AI features."

### Rewards Page (`frontend/src/pages/Rewards.tsx`) UPDATED
- British spelling corrected: "Recognises" → "Recognizes"

---

## 8. BUG FIXES

### Admin Login — Corrupted bcrypt Hash (RESOLVED)
- **Root cause:** When running `UPDATE users SET "passwordHash" = '$2a$12$...'` via `docker exec psql`, the bash shell expanded `$2a` and `$12` as shell variables, corrupting the stored hash to `\a\2$/qrEASZ...`
- **Fix:** Used `docker exec govcon_backend node` with Prisma client directly inside the container to hash and update the password — bypassing shell variable expansion entirely
- Admin credentials confirmed working: `admin@mercyrainellc.com` / `Admin123!`

### Demo Account Tier
- Upgraded demo account from Starter (TRIALING) to Business Professional Enterprise (ACTIVE) to demonstrate all features without tier gates blocking the demo flow

---

## 9. API SURFACE ADDITIONS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/addons` | List all add-ons with purchased status |
| POST | `/api/addons/:slug/purchase` | Purchase an add-on (admin) |
| DELETE | `/api/addons/:slug/cancel` | Cancel an add-on (admin) |
| POST | `/api/proposal-assist/:id/outline` | Generate AI proposal outline |
| PUT | `/api/firm/llm-provider` | Set active AI provider (admin) |
| PUT | `/api/firm/openai-api-key` | Save OpenAI API key (admin) |
| PUT | `/api/firm/insight-engine-api-key` | Save Insight Engine API key (admin) |
| GET | `/api/firm/ai-usage` | AI usage summary with cost breakdown |

---

## 10. DEPENDENCY CHANGES

| Package | Change | Location |
|---------|--------|----------|
| `openai` | Added ^4.x | `backend/package.json` |
| `bcryptjs` | Already present, confirmed working | `backend/package.json` |

---

## 11. FILES MODIFIED

### New Files
- `backend/src/middleware/tierGate.ts`
- `backend/src/config/addons.ts`
- `backend/src/routes/addons.ts`
- `backend/src/services/proposalAssist.ts`
- `backend/src/routes/proposalAssist.ts`
- `backend/src/services/llm/provider.interface.ts`
- `backend/src/services/llm/claude.provider.ts`
- `backend/src/services/llm/openai.provider.ts`
- `backend/src/services/llm/insight.provider.ts`
- `backend/src/services/llm/localai.provider.ts`
- `backend/src/services/llm/llmRouter.ts`
- `frontend/src/hooks/useTier.ts`
- `frontend/src/components/TierGate.tsx`

### Modified Files
- `backend/prisma/schema.prisma`
- `backend/src/services/billingService.ts`
- `backend/src/services/documentAnalysis.ts`
- `backend/src/services/complianceMatrixService.ts`
- `backend/src/services/marketIntelligence.ts`
- `backend/src/services/revenueForecaster.ts`
- `backend/src/routes/clients.ts`
- `backend/src/routes/complianceMatrix.ts`
- `backend/src/routes/firm.ts`
- `backend/src/routes/jobs.ts`
- `backend/src/server.ts`
- `frontend/src/components/layout.tsx`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/pages/Analytics.tsx`
- `frontend/src/pages/OpportunityDetail.tsx`
- `frontend/src/pages/Rewards.tsx`
- `frontend/src/pages/Billing.tsx`
- `frontend/src/services/api.ts`

---

*GovCon Advisory Intelligence Platform — Mercy Raine LLC · SDVOSB*
*Change Log v4.0 — March 23, 2026*
