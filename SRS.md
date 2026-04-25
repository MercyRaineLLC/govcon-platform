# MrGovCon — BANKV Engine
## Software Requirements Specification

**Version:** 1.0 (current production state)
**Date:** 2026-04-25
**Owner:** Mercy Raine LLC
**Operating Brands:** FiveGates Technologies LLC (DBA: Mr GovCon), Mr Freight Broker

---

## 1. Purpose & Scope

MrGovCon is a multi-tenant SaaS platform for federal contracting consultants. It helps consulting firms manage client portfolios, ingest opportunities from SAM.gov, score them with an 8-factor probability engine, generate AI-assisted proposals and compliance matrices, and run a white-label client portal.

The BANKV Engine (Bid Analytics, Nexus Knowledge Vault) is the analytics core — probability scoring, market intelligence, decision recommendations, revenue forecasting.

### In scope
- Federal opportunity ingestion (SAM.gov), state/municipal opportunities (add-on)
- Probabilistic bid/no-bid decision engine
- Client portfolio management with tenant isolation
- AI-assisted document analysis, compliance matrix generation, proposal drafting (Claude / OpenAI / DeepSeek / LocalAI)
- White-label branding (per-firm colors, logos, taglines, subdomains, custom domains)
- Client portal (separate JWT) for deliverable review/approval and document uploads
- Stripe billing — recurring subscription tiers + lifetime access + add-ons
- Compliance audit trail (FAR/DFARS clause matching, state transitions logged)

### Out of scope (current release)
- Direct contract submission to government portals
- Real-time collaboration (multi-user editing)
- Mobile native apps
- DCAA-compliant accounting integration
- E-signature workflow

---

## 2. Stakeholders

| Role | Description |
|---|---|
| Platform Owner | Mercy Raine LLC — operates the platform, sets pricing, holds data |
| Consulting Firm (Tenant) | Pays for subscription; manages clients, opportunities, decisions |
| Firm Admin | Top-level user within a firm; manages users, billing, branding |
| Firm User | Consultant; analyzes opportunities, drafts proposals, manages clients |
| Client Company | A government contractor served by a consulting firm |
| Client Portal User | Authorized contact at a client company; reviews deliverables, uploads documents |
| Government Agency | External — source of opportunities (SAM.gov) |

---

## 3. Architecture

### Stack
- **Backend:** Node 20 · Express 4 · TypeScript 5.9 · Prisma 5.22
- **Database:** PostgreSQL 16
- **Cache / Jobs:** Redis 7 · BullMQ
- **Frontend:** React 18 · Vite 5 · TypeScript · TanStack Query · React Router 6 · Tailwind · Recharts · Lucide
- **AI providers:** Claude (default), OpenAI, DeepSeek, Insight Engine, LocalAI / Ollama (self-hosted fallback)
- **Payment:** Stripe (live mode)
- **Email:** SMTP (configurable per environment)
- **SMS:** Twilio
- **Analytics:** Google BigQuery (federal contracting historical data)
- **Infrastructure:** Docker Compose on DigitalOcean droplet, host nginx + Let's Encrypt for SSL

### Container topology (production)
- `govcon_postgres` — Postgres 16
- `govcon_redis` — Redis 7
- `govcon_backend` — Node API + workers (port 3001 internal, 127.0.0.1:3001 host-bound)
- `govcon_frontend` — nginx serving Vite-built static assets (port 80 internal, 127.0.0.1:3000 host-bound)
- `govcon_ollama` — local LLM (optional fallback)
- Host `nginx` — public TLS terminator, proxies `/` → frontend, `/api/` → backend

### Multi-tenancy model
- Every tenant-scoped DB query MUST filter by `consultingFirmId` from JWT
- Client portal uses a separate JWT (`ClientJwtPayload` with `clientPortalUserId`, `clientCompanyId`, `role: 'CLIENT'`)
- Three live operating firms: FiveGates Technologies, Mr Freight Broker, Mercy Raine LLC
- Tenant isolation enforced at middleware (`enforceTenantScope`) AND query layer

---

## 4. Functional Requirements

### 4.1 Authentication & Authorization
| ID | Requirement |
|---|---|
| AUTH-1 | Firm registration creates `ConsultingFirm` + first `ADMIN` user atomically |
| AUTH-2 | Beta slot cap (`MAX_BETA_SLOTS` env, default 15); excess registrations return 403 `BETA_FULL` |
| AUTH-3 | Login issues JWT with `userId`, `consultingFirmId`, `role`; bcrypt cost 10 |
| AUTH-4 | Forgot/reset password flow via SMTP-delivered token (one-time, time-limited) |
| AUTH-5 | Client portal users authenticate separately via `/api/client-portal/login` and receive `ClientJwtPayload` |
| AUTH-6 | Roles: `ADMIN`, `CONSULTANT`, `CLIENT` (portal-only) |
| AUTH-7 | Rotating `JWT_SECRET` invalidates all sessions; documented operational practice |

### 4.2 Opportunity Management
| ID | Requirement |
|---|---|
| OPP-1 | Ingest opportunities from SAM.gov via `samApi.ts` (`searchAndIngest`); deduplication by `samNoticeId` |
| OPP-2 | Each opportunity scored on 8 factors: keyword match, NAICS alignment, set-aside fit, agency familiarity, competition density, incumbent risk, value range, deadline proximity |
| OPP-3 | Probability engine: logistic sigmoid (SCALE=6.0, BIAS=-3.0, weights sum to 1.0) + Bayesian Beta-binomial calibration (pseudo-count 10) |
| OPP-4 | Background scoring worker (`scoringWorker`) processes new ingestions |
| OPP-5 | Background enrichment worker (`enrichmentWorker`) pulls historical data (USAspending) |
| OPP-6 | Background recalibration worker (`recalibrationWorker`) retunes weights from outcomes |
| OPP-7 | Opportunities filterable by client NAICS, agency, value, set-aside, deadline |
| OPP-8 | Solicitation document upload (PDF, DOCX, TXT, ZIP) with multi-file support and per-file failure isolation |
| OPP-9 | Document analysis runs LLM-driven scope/feasibility extraction; falls back to placeholder defaults if LLM unavailable |
| OPP-10 | "Win Strategy" feature: AI-extracted plain-English bid strategy from RFP |

### 4.3 Client Management
| ID | Requirement |
|---|---|
| CLI-1 | Each `ClientCompany` belongs to one `ConsultingFirm` (`consultingFirmId` foreign key) |
| CLI-2 | Client profile includes UEI, NAICS codes (multi), certifications (SDVOSB/WOSB/HUBZone/Small Business), contacts |
| CLI-3 | NAICS picker supports search by code or keyword + sector category browse + manual add fallback |
| CLI-4 | NAICS lookup table seeded with ~277 federal-contracting-relevant codes; standalone codes supported |
| CLI-5 | Client portal access: each `ClientCompany` can have N `ClientPortalUser` accounts; emails restricted to allowlist |
| CLI-6 | Client matching: `opportunityMatcher` pairs clients to opportunities using probability engine + NAICS pre-filter |
| CLI-7 | Bulk import via CSV upload (max 2 MB) |

### 4.4 Decision Engine
| ID | Requirement |
|---|---|
| DEC-1 | `BidDecision` recommendation: `BID_PRIME` / `BID_SUB` / `NO_BID` |
| DEC-2 | Decision includes 3-layer scoring: complianceGate, fitScore, marketScore + `featureBreakdown` JSON |
| DEC-3 | Portfolio decision engine evaluates all (client × opportunity) pairs with bounded concurrency (5 parallel) |
| DEC-4 | Compliance gap analysis (FAR/DFARS clause matcher) flags blockers BEFORE decision |
| DEC-5 | Decisions logged to `ComplianceLog` with `triggeredBy: userId`; immutable audit trail |

### 4.5 Compliance & Submissions
| ID | Requirement |
|---|---|
| COMP-1 | Compliance matrix auto-generated from solicitation text (LLM extracts Section L/M requirements) |
| COMP-2 | Each requirement: `INSTRUCTION` / `EVALUATION` / `CLAUSE` / `CERTIFICATION` kind, status cycles |
| COMP-3 | `SubmissionRecord` tracks each bid submission with `wasOnTime` boolean and `ComplianceStatus` |
| COMP-4 | Late submissions trigger configurable `FinancialPenalty` (`appliedAt`, `reason`, `clientCompany` relation) |
| COMP-5 | All state transitions write to `ComplianceLog` (entityType, fromStatus, toStatus, reason, triggeredBy) |
| COMP-6 | `ComplianceLog` rows are never deleted (soft-delete or archive only) |

### 4.6 AI Services
| ID | Requirement |
|---|---|
| AI-1 | LLM router resolves provider per-firm (DB) with platform env-var fallback |
| AI-2 | Supported providers: Claude, OpenAI, DeepSeek, Insight Engine, LocalAI |
| AI-3 | Default platform provider configurable via `DEFAULT_LLM_PROVIDER` env (currently `claude`) |
| AI-4 | LLM responses cached in Redis (7-day TTL) for non-document tasks |
| AI-5 | Per-firm `proposalTokens` (Int) tracked; consumed on draft generation |
| AI-6 | Token allocation: monthly base by tier + bonus if `proposal_assistant` add-on owned |
| AI-7 | Rate-limit errors (429) surface immediately; provider failures fall back to LocalAI when configured |
| AI-8 | All LLM calls logged to `ApiUsageLog` (firm, provider, model, task, tokens, cost, cache hit, duration) |

### 4.7 Proposal Generation
| ID | Requirement |
|---|---|
| PROP-1 | Outline generation (1 token) — bullet structure of proposal sections |
| PROP-2 | Full draft PDF (5 tokens) — narrative content, formatted via `proposalPdfBuilder` |
| PROP-3 | Drafts include scope match, win themes, compliance check |
| PROP-4 | **PENDING:** Persist generated drafts so reopening doesn't double-bill (see `project_pending_features.md`) |

### 4.8 Billing & Subscriptions (Stripe)
| ID | Requirement |
|---|---|
| BILL-1 | Recurring tiers: Starter ($299/mo), Professional ($699/mo), Enterprise ($1,800/mo), Elite (contact sales) |
| BILL-2 | Annual cycle: 15% discount over monthly |
| BILL-3 | Founders Lifetime ($2,500 one-time, capped at 10 total slots, enforced at route + service layer) |
| BILL-4 | Marketplace add-ons: state_municipal ($199), compliance_matrix_ai ($149), proposal_assist_pro ($99) |
| BILL-5 | Token packs (one-time, never expire): tied to `proposalTokens` balance |
| BILL-6 | Veteran-owned firms receive 10% discount (`isVeteranOwned: true`) |
| BILL-7 | Customer portal accessible via `createCustomerPortalSession` (Stripe-hosted) |
| BILL-8 | Webhook endpoint `/api/webhooks/stripe` handles 5 events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` |
| BILL-9 | Webhook signature verification via `STRIPE_WEBHOOK_SECRET`; raw body required (express.raw before json) |
| BILL-10 | Tier upgrades from in-app Billing page redirect to `checkout.stripe.com` (no in-app fake activation) |

### 4.9 White-Label Branding
| ID | Requirement |
|---|---|
| BRAND-1 | Each firm has overridable: `brandingDisplayName`, `brandingTagline`, `brandingLogoUrl`, `brandingPrimaryColor` (#RRGGBB), `brandingSecondaryColor`, `brandingFaviconUrl` |
| BRAND-2 | Public branding endpoint `GET /api/branding/:firmId` (no auth) for login pages |
| BRAND-3 | Admin update `PUT /api/branding/admin/update` (ADMIN role + tenant scope) |
| BRAND-4 | Subdomain support (`{slug}.mrgovcon.co`); custom domain support (CNAME → mrgovcon.co) |
| BRAND-5 | `useBranding` hook applied to ALL logged-in components (consultant + client portal) |
| BRAND-6 | Default branding: `#fbbf24` primary (gold), `#f59e0b` secondary (amber); MrGovCon display |
| BRAND-7 | Veteran-owned indicator displayed when `isVeteranOwned: true` |

### 4.10 Client Portal (separate JWT scope)
| ID | Requirement |
|---|---|
| CP-1 | Client login at `/client-login?firm={firmId}` with branded UI |
| CP-2 | Dashboard shows assigned deliverables, recent uploads, branded firm info |
| CP-3 | Deliverable review: clients can approve/reject with threaded comments |
| CP-4 | Document upload: clients can submit RFP responses, supporting docs |
| CP-5 | All client portal queries scoped by `clientCompanyId` (NOT `consultingFirmId`) |
| CP-6 | Client cannot access another firm's deliverables (404 on cross-firm attempt) |

### 4.11 Notifications
| ID | Requirement |
|---|---|
| NOTIF-1 | Email via `emailService` (firm-branded templates from `brandedEmailTemplates`) |
| NOTIF-2 | SMS via Twilio (`smsService`) for critical alerts |
| NOTIF-3 | Deadline notification worker scans nightly, sends reminders 7/3/1 day(s) before deadline |
| NOTIF-4 | Per-user notification preferences (email/SMS toggle per category) |
| NOTIF-5 | Never send raw `nodemailer.sendMail` — all email goes through `notify*` helpers |

### 4.12 Analytics & Dashboards
| ID | Requirement |
|---|---|
| ANALY-1 | Dashboard: 5 KPI cards + 6 charts (pipeline funnel, win distribution, penalty trend, submission velocity, revenue forecast, client portfolio pie) |
| ANALY-2 | Time-series via EMA (alpha = 2/(span+1)) |
| ANALY-3 | NAICS sector trends via linear regression |
| ANALY-4 | Monte Carlo revenue forecast (1000 runs, lognormal noise σ=0.2) |
| ANALY-5 | HHI concentration index for portfolio diversification |
| ANALY-6 | Beta-distribution late-submission probability |
| ANALY-7 | CSV export available for all major data tables (`useExportCsv` hook) |
| ANALY-8 | Onboarding wizard shown once per browser (localStorage flag) |

---

## 5. Non-Functional Requirements

### 5.1 Security
| ID | Requirement |
|---|---|
| SEC-1 | All routes (except `/health`, `/api/branding/:firmId`, public auth) require `authenticateJWT` |
| SEC-2 | Tenant isolation enforced via `enforceTenantScope` middleware + Prisma where-clause `consultingFirmId` |
| SEC-3 | Inputs validated via Zod schemas at route entry |
| SEC-4 | File uploads filtered by MIME (PDF, DOC, DOCX, XLS, XLSX, ZIP) and capped at `MAX_UPLOAD_MB` (default 25) |
| SEC-5 | Rate limiting: global 500 requests / 15 min window |
| SEC-6 | CORS whitelist via `ALLOWED_ORIGINS` env in production |
| SEC-7 | JWT secret minimum 32 chars in production |
| SEC-8 | Passwords bcrypt-hashed (cost 10); never logged |
| SEC-9 | API keys (Stripe, Anthropic, OpenAI, etc.) stored in env vars or per-firm DB columns; never in code |
| SEC-10 | Stripe webhook signature verification mandatory |
| SEC-11 | TLS via Let's Encrypt; HTTP redirects to HTTPS |
| SEC-12 | Per-firm AI keys override platform keys; firm cannot read other firm's data |

### 5.2 Performance
| ID | Requirement |
|---|---|
| PERF-1 | API response time: p95 < 500 ms for non-LLM endpoints |
| PERF-2 | LLM calls: 7-day Redis cache for repeat content; per-firm token quotas to bound spend |
| PERF-3 | Background workers prevent blocking on long-running operations (scoring, enrichment, document analysis) |
| PERF-4 | Bounded concurrency on portfolio decisions (5 parallel) |
| PERF-5 | TanStack Query caches frontend data with `staleTime` (30s subscription, 10min plans) |
| PERF-6 | Vite production build minimal — no third-party UI libraries (Tailwind + Lucide only) |

### 5.3 Reliability & Operations
| ID | Requirement |
|---|---|
| REL-1 | Health check endpoint `/health` returns `{ status, db: 'ok' }` |
| REL-2 | Graceful shutdown closes BullMQ workers and Prisma client |
| REL-3 | Database snapshots via `scripts/deploy.sh` before each deploy; auto-rollback on health-check failure |
| REL-4 | Structured logging via Winston (`logger`); levels: error/warn/info/debug |
| REL-5 | All errors flow through `errorHandler` middleware with stable `code` strings |
| REL-6 | Errors include `path`, `userId`, `firmId`, relevant IDs (no raw PII / passwords / JWTs) |
| REL-7 | Stripe customer ID and subscription ID idempotency keys for payment-related state changes |

### 5.4 Compliance & Audit
| ID | Requirement |
|---|---|
| COMP-A1 | All state changes (status, approvals, decisions) write to `ComplianceLog` |
| COMP-A2 | Financial penalties recorded with `appliedAt`, `reason`, `clientCompany` relation |
| COMP-A3 | Bid decisions retained indefinitely; never hard-deleted |
| COMP-A4 | Submission records retain `wasOnTime` and full `ComplianceStatus` |
| COMP-A5 | API usage log retained for billing audit (per-firm, per-provider, per-task) |

### 5.5 Multi-Tenancy
| ID | Requirement |
|---|---|
| TEN-1 | Three live firms, each independent: FiveGates Technologies (633962dd-...), Mr Freight Broker (8215901d-...), Mercy Raine LLC (34a4e6db-...) |
| TEN-2 | Cross-firm queries are forbidden at code review (no SELECT without `consultingFirmId`) |
| TEN-3 | Client portal data scoped by `clientCompanyId` only (never `consultingFirmId` directly) |
| TEN-4 | Per-firm branding independent — no global override of firm-level config |

---

## 6. Data Model (Prisma Models)

37 models in `backend/prisma/schema.prisma`. Top-level entities:

| Model | Purpose |
|---|---|
| `ConsultingFirm` | Tenant root; firm-level settings, branding, billing, API keys |
| `User` | Firm-scoped user with role |
| `ClientCompany` | Federal contractor served by a firm |
| `ClientPortalUser` | Portal-only auth for client contacts |
| `Opportunity` | Federal opportunity from SAM.gov; enriched with historical/agency data |
| `OpportunityDocument` | Solicitation docs, amendments |
| `BidDecision` | Recommendation + 3-layer score breakdown |
| `SubmissionRecord` | Bid submitted; on-time / late |
| `FinancialPenalty` | Late-submission consequences |
| `ComplianceLog` | Immutable audit trail |
| `ComplianceMatrix` + `ComplianceMatrixRequirement` | RFP requirement extraction |
| `DocumentRequirement` / `DocumentTemplate` | Required deliverable tracking |
| `SubscriptionPlan` / `Subscription` / `Invoice` | Billing |
| `ApiUsageLog` | LLM usage audit |
| `IngestionJob` | Background job tracking |
| `NaicsCode` / `NaicsCompetitiveDensity` | Industry classification + competitive cache |
| `StateMunicipalOpportunity` / `SubcontractOpportunity` | Add-on opportunity feeds |
| `SharedTemplate` | Cross-firm template marketplace |

---

## 7. External Integrations

| System | Purpose | Auth |
|---|---|---|
| SAM.gov | Federal opportunity feed | API key (`SAM_API_KEY`) |
| USAspending | Historical contract data | Public, no auth |
| Stripe | Payments + subscriptions | Secret key + webhook secret |
| Anthropic Claude | Default LLM | API key (`ANTHROPIC_API_KEY`) |
| OpenAI | Alternate LLM | API key (`OPENAI_API_KEY`) |
| DeepSeek | Cost-optimized LLM | API key |
| Twilio | SMS notifications | Account SID + Auth Token |
| SMTP (configurable) | Email | Username + password |
| Google BigQuery | Long-term analytics, NAICS competitive cache | Application default credentials or service account JSON |
| Ollama (self-hosted) | Local LLM fallback | None (network) |

---

## 8. Deployment

### Production
- DigitalOcean droplet (`Govcon-beta-01`, 137.184.207.229)
- `/opt/govcon/app` — code repo
- Docker Compose (`docker-compose.prod.yml`)
- Host nginx terminates TLS, proxies to backend (3001) and frontend (3000) on 127.0.0.1
- Env config: `.env.prod` at project root (symlinked as `.env` for compose substitution)
- Deploy: `bash scripts/deploy.sh` — backs up DB, pulls main, rebuilds, health-checks, auto-rolls back on failure

### Domains
- Primary: `mrgovcon.co`
- Future: per-firm subdomains (`{slug}.mrgovcon.co`) and custom domains

### Backups
- Manual via `scripts/deploy.sh` (`/opt/govcon/backups/db_<timestamp>.sql`)
- **Gap:** no automated nightly backup (recommended addition)

---

## 9. Known Gaps / Roadmap

### Critical (pre-public launch)
- [ ] End-to-end Stripe webhook verification with real (refundable) charge
- [ ] Persist proposal drafts to prevent token double-billing (PROP-4)
- [ ] Direct link from client matched-opportunities to opportunity detail
- [ ] Automated nightly DB backups (cron)
- [ ] Container healthchecks for backend/frontend
- [ ] Persistent log volume (currently lost on container recreate)

### Operational hygiene
- [ ] Full NAICS 2022 list seed (currently ~277 of ~1,012)
- [ ] SAM.gov ingest enum coverage audit (e.g., `setAsideType: "SBA"` mismatch)
- [ ] Test suite expansion + CI integration (Vitest infrastructure exists, not in CI)
- [ ] Dependency upgrade: Prisma 5.22 → 7.x (deferred, large migration)
- [ ] Stripe Customer Portal Dashboard configuration verification

### Feature additions (planned)
- [ ] Full state/municipal procurement scraping (8 states currently scaffolded)
- [ ] Subcontracting marketplace integration
- [ ] Real-time deliverable collaboration (multi-user editing)
- [ ] Stripe webhook secret rotation reminder

---

## 10. Glossary

| Term | Definition |
|---|---|
| **BANKV Engine** | Bid Analytics, Nexus Knowledge Vault — the analytics core |
| **Set-aside** | Federal contracting designation (SDVOSB, WOSB, HUBZone, 8(a), etc.) |
| **NAICS** | North American Industry Classification System (6-digit industry codes) |
| **FAR/DFARS** | Federal Acquisition Regulation / Defense supplement (clause taxonomy) |
| **UEI** | Unique Entity ID (replaces DUNS for federal contracting) |
| **Section L/M** | RFP "Instructions" (L) and "Evaluation Factors" (M) |
| **Tenant** | A consulting firm with isolated data scope |
| **Token** | Internal credit unit consumed by AI proposal generation (1 outline, 5 PDF) |
| **Add-on** | Marketplace feature available for purchase separately from base subscription |
| **Lifetime** | One-time purchase ($2,500) granting indefinite access to base features |

---

## 11. Document Control

| Field | Value |
|---|---|
| Document version | 1.0 |
| Generated | 2026-04-25 |
| Source of truth | Git repository at `https://github.com/MercyRaineLLC/govcon-platform` (branch `main`) |
| Schema reference | `backend/prisma/schema.prisma` |
| Routes reference | `backend/src/routes/*.ts` (28 files) |
| Pages reference | `frontend/src/pages/*.tsx` (28 files) |
| Workers reference | `backend/src/workers/*.ts` (4 files) |
| Services reference | `backend/src/services/*.ts` (28 files including tests) |

---

*This SRS describes the current production state. For roadmap decisions, in-progress work, or design discussions, see project memory files and PROGRAM_VISION.md.*
