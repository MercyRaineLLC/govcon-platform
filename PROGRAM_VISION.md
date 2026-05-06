# MrGovCon Platform — Program Vision & Strategic Roadmap
## Powered by BANKV Engine (Bid Analytics, Nexus Knowledge Vault)
### "Bid Smarter. Win Bigger."

**Document Owner:** Mercy Raine LLC
**Last Updated:** 2026-04-23
**Status:** Living Document — Reviewed at Phase Boundaries

---

# PART I — CURRENT STATE ANALYSIS (As of Phase 4 Completion)

## 1.1 Mission & Brand Identity

**Parent Organization:** Mercy Raine LLC
**Operating Companies:**
- **FiveGates Technologies LLC** — DBA "Mr GovCon" (federal contracting analytics)
- **Mr Freight Broker** — DBA under Mercy Raine LLC (commercial freight brokerage)
- **Mercy Raine LLC** — Platform owner / parent

**Brand:** Patriotic, protective, professional. Yellow umbrella signature. Dark navy + gold + red + white palette.

## 1.2 Technology Stack (Production)

| Layer | Tech |
|---|---|
| Backend | Node.js 20, Express 4, TypeScript 5.9, Prisma 5.22, PostgreSQL 14+ |
| Queue/Cache | Redis 7, BullMQ 4 |
| Frontend | React 18, Vite 5, Tailwind, TanStack Query, Recharts, Lucide |
| Email | nodemailer (SMTP) |
| Auth | JWT (separate consultant + client tokens) |
| Multi-tenancy | `consultingFirmId` scope on every query |
| Infrastructure | Docker Compose (postgres:5432, redis:6379, backend:3001, frontend:3000) |

## 1.3 Built & Live (Phase 1–4)

### Backend Routes (26 routes registered in server.ts)
auth, opportunities, clients, submissions, penalties, firm, decision, jobs, documents, doc-requirements, client-portal, client-deliverables, rewards, templates, client-documents, analytics, compliance-matrix, billing, market-analytics, addons, proposal-assist, state-municipal, subcontracting, contracts, assistant, branding

### Backend Services (24 services)
- **Decision/scoring:** decisionEngine, probabilityEngine (8-factor logistic sigmoid + Bayesian Beta-binomial)
- **Forecasting:** revenueForecaster (Monte Carlo), portfolioDecisionEngine, riskRadar
- **Intelligence:** marketIntelligence (NAICS regression), trendAnalysis (EMA), opportunityMatcher
- **Documents:** complianceMatrixService, complianceGapAnalysis (FAR/DFARS), documentAnalysis, proposalAssist, proposalDraftService, proposalPdfBuilder
- **External APIs:** samApi, samEntityApi, usaSpending, stateProcurementScraper
- **Comms:** emailService, brandedEmailTemplates
- **State:** complianceStateMachine, performanceStats, vehicleDetector, anonymizer
- **LLM:** llm/ subdirectory (Claude/OpenAI/DeepSeek/LocalAI router)

### Frontend Pages (27 pages)
Dashboard, Opportunities, OpportunityDetail, Clients, ClientDetail, Decisions, Submissions, Penalties, Analytics, ComplianceLogs, DocRequirements, Templates, TemplateLibrary, Rewards, Billing, Settings, ContractUpload, StateMunicipalPage, SubcontractingPage, RoiCalculator, Landing, Login, Register, ForgotPassword, ResetPassword, ClientPortalLogin, ClientPortalDashboard, NotFound

### Frontend Components (Key)
AiAssistant, BrandingSettings, ClientDeliverableReview, ComplianceGapAnalysis, ErrorBoundary, NaicsPicker, NotificationPreferences, OnboardingWizard, ProtectedRoute, ScoreBreakdown, TierGate, Toast, layout, ui, cards/, charts/

### Workers (4 BullMQ workers)
scoringWorker, enrichmentWorker, recalibrationWorker (nightly 02:00 UTC), deadlineNotificationWorker (daily 09:00 UTC, 14/7/3/1 day milestones)

### Database Models (Key)
ConsultingFirm (with branding fields), User, ClientCompany, ClientPortalUser (with notify prefs), Opportunity, BidDecision, ComplianceMatrix, MatrixRequirement, ComplianceLog, DocumentRequirement, FinancialPenalty, SubmissionRecord, ClientDocument, Subscription, Invoice, ApiUsageLog, IngestionJob, StateMunicipalOpportunity, ComplianceReward, SharedTemplate

### Multi-Firm Portfolio (Live)
- FiveGates Technologies (Mr GovCon): `633962dd-94a0-4ca5-aa27-8e980861021c`
- Mr Freight Broker: `8215901d-3ce8-45fc-ace9-0810378d3b92`
- Mercy Raine LLC (parent): `34a4e6db-6422-4cd4-9c99-e9aaa4d3f067`

## 1.4 Algorithms in Production

- 8-factor logistic sigmoid probability model (weights sum to 1.0, SCALE=6.0, BIAS=-3.0)
- Bayesian Beta-binomial calibration (pseudo-count 10)
- Exponential penalty drag: `exp(-totalPenalties/200000)`
- EMA trend analysis: `alpha = 2/(span+1)`
- Linear regression slope for NAICS trend detection
- Monte Carlo revenue forecasting: `Bernoulli(prob) × lognormal(sigma=0.2)`, 1000 runs
- HHI concentration index for portfolio diversification
- Beta distribution late probability: `Beta(late+1, onTime+1)` mean
- FAR/DFARS clause matcher with severity scoring (12 clauses, set-aside aware)

## 1.5 Current Gaps & Technical Debt

| Area | Gap | Priority |
|---|---|---|
| SMS notifications | Twilio not yet integrated | P2 |
| Custom domains | Per-firm CNAME → portal subdomain | P2 |
| Threaded comments | Single-shot feedback only on deliverables | P3 |
| AI clause extraction | Currently keyword-based, not LLM-extracted from PDFs | P2 |
| Stripe billing flow | Schema exists, checkout flow incomplete | P1 |
| Test coverage | Manual test only, no automated test suite | P0 |
| Win probability calibration | Needs back-testing against historical wins | P1 |
| OneDrive Prisma client lock | Recurring file-lock issue on `npx prisma generate` | P1 |
| Email deliverability | Dev SMTP only, needs SendGrid/SES production setup | P1 |
| Observability | No APM/error tracking (Sentry/Datadog) | P1 |
| API rate limiting | Global limiter only, needs per-user/per-firm limits | P2 |

---

# PART II — STRATEGIC VISION (Where We Want To Be)

## 2.1 North Star

**MrGovCon becomes the dominant AI-powered intelligence platform for federal & state contracting consultants serving small businesses, with BANKV Engine as the analytical brain that turns RFP chaos into bid clarity — while Mercy Raine LLC operates parallel verticals (freight, training, possible adjacent SaaS) sharing the same brand DNA and back-office infrastructure.**

## 2.2 12-Month Strategic Pillars

### Pillar 1 — Production-Ready SaaS (Phase 5)
- Stripe billing live ($1,249 lifetime + add-ons)
- Production SMTP (SendGrid or SES) with domain SPF/DKIM/DMARC
- Sentry + Datadog APM
- Automated test suite (Vitest + Playwright, 70%+ coverage on critical paths)
- CI/CD: GitHub Actions → DigitalOcean App Platform / Render
- Secrets rotation, JWT secret >= 32 chars enforced
- Health probes + zero-downtime deploys
- API rate limiting per-user (100 req/min) and per-firm (1000 req/min)

### Pillar 2 — Enhanced Intelligence (Phase 6)
- LLM-powered clause extraction from solicitation PDFs (Claude/OpenAI)
- Win probability model back-testing + recalibration framework
- Competitive intelligence: incumbent detection, recompete probability scoring
- Past-performance matching: auto-link client past performance to opportunity requirements
- Pricing benchmarks from USAspending historical awards
- Document Q&A: ask questions about uploaded RFP, get cited answers

### Pillar 3 — Client Experience (Phase 7)
- Threaded comment discussions on deliverables
- Version control with diff viewer for proposals
- Digital signature integration (DocuSign/HelloSign) for approvals
- Custom firm domains (CNAME → tenant subdomain)
- Twilio SMS for urgent alerts (deadline <24h, deliverable ready)
- Slack/Teams webhook integrations
- Mobile-responsive client portal (currently desktop-first)

### Pillar 4 — Multi-Vertical Platform (Phase 8)
- Mr Freight Broker portal (separate UI, shared infrastructure)
  - Carrier matching engine (analog to opportunity matcher)
  - Load/lane analytics (analog to NAICS density)
  - Driver compliance tracking
- Shared identity layer: single Mercy Raine SSO across MrGovCon + Mr Freight Broker
- Cross-vertical analytics dashboard (Mercy Raine LLC executive view)

### Pillar 5 — Market Expansion (Phase 9)
- State/Municipal opportunity ingestion (currently scaffolded, needs production data sources)
- International contracting (NATO, FMS programs)
- Subcontracting marketplace (prime ↔ sub matchmaking)
- Mentorship matching (8(a) protégés ↔ mentors)
- Compliance certification fast-track (SDVOSB, WOSB, HUBZone application assistance)

### Pillar 6 — Operational Excellence
- 99.9% uptime SLA
- <500ms p95 API latency
- <2s p95 page load
- Daily encrypted backups, 30-day retention, monthly restore drill
- SOC 2 Type II readiness (controls documented, audit pending)
- CMMC Level 2 compliance (for DoD client data handling)
- Quarterly penetration testing
- GDPR-style data export for clients on request

## 2.3 Architectural Future-State

```
┌─────────────────────────────────────────────────────────────┐
│                    Mercy Raine LLC                          │
│              Identity Layer (SSO + RBAC)                    │
└─────────────┬───────────────┬───────────────┬───────────────┘
              │               │               │
       ┌──────┴────┐    ┌─────┴─────┐   ┌─────┴──────┐
       │ MrGovCon  │    │MrFreight  │   │  Future    │
       │  Portal   │    │ Broker    │   │  Verticals │
       │           │    │  Portal   │   │            │
       └──────┬────┘    └─────┬─────┘   └─────┬──────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                  ┌───────────┴────────────┐
                  │   BANKV Engine Core    │
                  │  (analytics + LLM)     │
                  └───────────┬────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
   ┌───┴────┐         ┌───────┴───────┐      ┌──────┴──────┐
   │Postgres│         │  Redis/BullMQ │      │  S3/Object  │
   │(tenant │         │  (queues +    │      │   Storage   │
   │ scoped)│         │   cache)      │      │             │
   └────────┘         └───────────────┘      └─────────────┘
```

## 2.4 Quality & Safety Standards

- **Multi-tenancy:** Every Prisma query scoped by `consultingFirmId` from JWT — verified by middleware, not handler logic
- **Auth:** JWT with separate consultant/client tokens, role checks at route level
- **PII:** Never log full payloads containing emails/names; use `userId` references
- **Audit:** Every state change logged to ComplianceLog with `triggeredBy` userId
- **Schema:** All status enums in Prisma, never raw strings in `data: { status: 'X' }`
- **API contracts:** All responses follow `{ success, data, error?, code? }` shape
- **Errors:** AppError subclasses (ValidationError, NotFoundError, UnauthorizedError) caught by errorHandler middleware — never `throw new Error('...')` in routes

## 2.5 Success Metrics (Year 1)

| Metric | Target |
|---|---|
| Active firms | 50 |
| Active client portal users | 500 |
| Opportunities ingested daily | 10,000 |
| Bid decisions generated | 5,000 |
| Deliverables exchanged | 2,000 |
| Email notifications sent | 50,000 |
| Avg time-to-decision (RFP → BID/NO-BID) | <5 min |
| Win rate uplift (vs. control) | +15% |
| NPS score (firm admins) | 50+ |
| Monthly recurring revenue | $50K MRR |

## 2.6 Risk Register

| Risk | Mitigation |
|---|---|
| Single-tenant data leak | Tenant middleware enforced + integration tests cover cross-firm isolation |
| LLM cost explosion | Per-firm token quotas + cache common prompts |
| SAM.gov API rate limits | Local cache + scheduled refresh, not real-time fetch |
| Solo founder bus factor | Documentation + automated runbooks, contractor playbook |
| OneDrive sync corruption | Production code lives in git, OneDrive only for local dev |
| FedRAMP requirement (gov customer) | Architect for it: no PII in logs, encrypt at rest, audit trail |

---

# PART III — DECOMPOSITION INTO RULE SUBCOMPONENTS

This master document is decomposed into Claude Code rule packages loaded via `.claude/rules/`:

### Highest Priority (Loads First)
- **`.claude/rules/engineering.md`** — Senior engineering operating contract: production-safe, compliance-aware behavior; output format, refusal rules, secure defaults. **Overrides** any conflicting guidance in other rule files.

### Core Subcomponents (As Discussed)
1. **`.claude/rules/agents.md`** — Agent spawning rules (when to use Explore vs Plan vs general-purpose), briefing template, multi-firm context awareness
2. **`.claude/rules/rules.md`** — Backend code rules (TypeScript, Prisma, multi-tenancy, error handling, security, schema corrections, algorithm catalog)
3. **`.claude/rules/frontend/`** — Frontend stack rules split into:
   - `frontend/styles.md` — Tailwind, branding tokens, color palette, severity colors, hex transparency patterns
   - `frontend/react.md` — Component patterns, hooks, branding-aware design, TanStack Query, routing
   - `frontend/code-style.md` — TS/JSX conventions, imports, file organization, naming
   - `frontend/testing.md` — Vitest + Playwright + MSW patterns, multi-tenant isolation tests

### Loading Order (Per Claude Code Spec)
Rules load in alphabetical order within scope. `engineering.md` is highest priority (declared via frontmatter). Frontend rules apply only to `frontend/**`. Backend `rules.md` applies only to `backend/**`. `agents.md` applies to Agent/Task tool calls.

Each subcomponent is self-contained and references this master vision document.
