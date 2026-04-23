---
description: Backend code rules — TypeScript, Prisma, multi-tenancy, security, error handling
scope: project
appliesTo: backend/**/*.ts
---

# Backend Rules — MrGovCon Backend

## Stack
Node 20 · Express 4 · TypeScript 5.9 · Prisma 5.22 · PostgreSQL · Redis · BullMQ · nodemailer · JWT.

## TypeScript

- `strict: true` is mandatory. Never silence with `// @ts-ignore` — fix the type.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- No `any`. If unavoidable at a boundary, narrow immediately: `const x = raw as unknown as Foo`.
- Enums from Prisma schema, NEVER raw strings: use `Status.PENDING`, not `'PENDING'`, in `data: { status }`.
- Async functions return `Promise<T>` explicitly when exported.

## Prisma & Multi-Tenancy

**Hard rule:** Every query that touches a tenant-scoped model MUST filter by `consultingFirmId` from the JWT. No exceptions.

```ts
// CORRECT
const opps = await prisma.opportunity.findMany({
  where: { consultingFirmId, ...otherFilters }
})

// WRONG — leaks data across firms
const opps = await prisma.opportunity.findMany({ where: otherFilters })
```

- Get tenant ID via `getTenantId(req)` from `middleware/tenant.ts`
- For client-portal routes: scope by `clientCompanyId` from `ClientJwtPayload`
- Never join across firms even if foreign keys exist

### Schema Field Corrections (verified, do not re-bug)
- `FinancialPenalty`: use `appliedAt` not `issuedDate`, `reason` not `description`
- `SubmissionRecord`: use `wasOnTime` boolean, status is `ComplianceStatus`
- `PerformanceStats.totalSubmitted` (NOT `totalSubmissions`)
- `StateMunicipalOpportunity.contractLevel`: enum STATE/MUNICIPAL/COUNTY/FEDERAL
- `ClientCompany` ↔ `ClientPortalUser` relation is `clientPortalUsers` (not `portalUsers`)
- `Opportunity` enrichment fields: `historicalWinner`, `competitionCount`, `incumbentProbability`, `agencySdvosbRate`, `agencySmallBizRate`, `recompeteFlag`, `historicalAwardCount`, `historicalAvgAward`, `isEnriched`
- `BidDecision.recommendation`: enum BID_PRIME/BID_SUB/NO_BID; `explanationJson` includes `featureBreakdown`
- `ComplianceLog.entityType` is `ComplianceLogEntityType` enum, NOT raw string
- For Prisma JSON fields: spread typed objects with `{ ...obj }` to satisfy `InputJsonObject`

### Prisma Migrations
- Schema changes: `npx prisma db push --accept-data-loss --skip-generate` from `backend/`
- Always set `DATABASE_URL="postgresql://govcon_user:govcon_pass@localhost:5432/govcon_platform"` from host (Docker uses `postgres:5432`)
- After schema change, regenerate: `npx prisma generate` (kill node first if OneDrive locks file)

## Express Routes

### Standard Shape
```ts
router.get('/path', authenticateJWT, enforceTenantScope, async (req, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)
    // ... logic ...
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})
```

### Response Contract
ALL responses follow:
```ts
{ success: true, data: T }                   // success
{ success: false, error: string, code: string } // error
```
Never return bare data, never return `{ ok: true }` or other shapes.

### Error Handling
- Throw `AppError` subclasses from `utils/errors.ts`: `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ConflictError`, `ForbiddenError`
- Never `throw new Error('...')` in routes — won't get proper status code
- Always wrap async route handlers in `try { ... } catch (err) { next(err) }`
- For middleware that may throw, use `next(err)` not `throw` — Express needs explicit error pass-through

### Middleware Order
```ts
authenticateJWT       // sets req.user
requireRole('ADMIN')  // optional, gates by role
enforceTenantScope    // sets req.firmId
checkAiCallLimit      // optional, for LLM endpoints
requireFeature(flag)  // optional, for tier-gated features
```

### Client Portal Routes (Separate JWT)
- Use `authenticateClientJWT` (not `authenticateJWT`)
- Payload type: `ClientJwtPayload` with `clientPortalUserId`, `clientCompanyId`, `role: 'CLIENT'`
- Scope by `clientCompanyId`, never `consultingFirmId` directly
- See `routes/clientPortal.ts` for canonical implementation

## Security

- **Secrets:** Never commit `.env`. JWT_SECRET >=32 chars in production (config.ts enforces).
- **PII:** Don't log full request bodies. Log `userId` references, not emails/names.
- **Audit:** State changes (status transitions, approvals, bid decisions) MUST write to `ComplianceLog` with `triggeredBy: userId`.
- **Rate limiting:** Global limiter is in place; do not bypass with custom middleware.
- **CORS:** Origin whitelist via `ALLOWED_ORIGINS` env var in production. Localhost only in dev.
- **File uploads:** Use `middleware/upload.ts` (multer), validate MIME types, cap size at 10MB per express.json setting.
- **SQL:** Prisma only — no raw SQL except via `$queryRaw` with tagged templates (never string concat).
- **Passwords:** bcryptjs with cost 10. Never log password fields.

## Algorithms (Already Implemented — Do Not Reinvent)

| Algorithm | File |
|---|---|
| 8-factor logistic sigmoid (probability) | `services/decisionEngine.ts` |
| Bayesian Beta-binomial calibration | (in decisionEngine) |
| EMA trend (alpha = 2/(span+1)) | `services/trendAnalysis.ts` |
| Linear regression (NAICS trends) | `services/marketIntelligence.ts` |
| Monte Carlo (Bernoulli × lognormal) | `services/revenueForecaster.ts` |
| HHI concentration index | `services/revenueForecaster.ts` |
| Beta late probability | `services/riskRadar.ts` |
| FAR/DFARS clause matcher | `services/complianceGapAnalysis.ts` |

## Workers (BullMQ)

- Workers live in `backend/src/workers/`
- Each worker exports a `start*Worker()` function called from `server.ts` bootstrap
- Connection: parse `config.redis.url` into `{ host, port, password }` for BullMQ (it doesn't accept URL directly)
- Repeat pattern: `repeat: { pattern: '0 9 * * *' }` (cron syntax)
- Always handle `worker.on('failed', ...)` to log errors
- Always close workers in shutdown handler

## LLM Calls

- Route through `services/llm/` providers (Claude/OpenAI/DeepSeek/LocalAI)
- Per-firm provider preference via `ConsultingFirm.llmProvider`
- Per-firm token quotas via `ConsultingFirm.proposalTokens`
- Cache prompts where possible to reduce cost
- Never log full prompt/response in production (PII risk)

## File Conventions

- Routes: `backend/src/routes/<resource>.ts` — kebab-case URL, camelCase filename
- Services: `backend/src/services/<topic>.ts` — pure logic, no Express concerns
- Middleware: `backend/src/middleware/<purpose>.ts`
- Workers: `backend/src/workers/<topic>Worker.ts`
- Config: import from `config/config.ts`, never read `process.env` directly in route handlers
- Logger: import from `utils/logger.ts`, use levels: error/warn/info/debug

## Branding-Aware Endpoints

For features that touch the client portal or notifications:
- Use `services/brandedEmailTemplates.ts` for emails (auto-applies firm branding)
- Use `services/emailService.ts` `notify*` helpers, not raw `nodemailer.sendMail`
- Public branding endpoint: `GET /api/branding/:firmId` (no auth required)
- Admin branding update: `PUT /api/branding/admin/update` (requires ADMIN role)

## Don't Do

- ❌ Add fields to schema without considering migration impact (existing rows)
- ❌ Hard-code firm IDs in routes (use JWT scope)
- ❌ Send raw email without going through `brandedEmailTemplates`
- ❌ Add new top-level routes without registering in `server.ts` apiRouter
- ❌ Skip `next(err)` — silent failures destroy debuggability
- ❌ Run `prisma migrate dev` (broken shadow DB — use `db push` instead)
- ❌ Use `node -e` from project root for Prisma — use backend's regenerated client only
