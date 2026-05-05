# MrGovCon — Competitive Landscape

**Version:** 1.0 draft
**Effective:** 2026-04-27
**Audience:** Seed VC partners; product / GTM advisors.

---

## 1. The Honest Map

The federal-contracting tooling space has four classes of competitor. We win in two, tie in one, and acknowledge the fourth.

| Class | Examples | Where they win | Where we win |
|---|---|---|---|
| **Enterprise data platforms** | Deltek GovWin IQ, Bloomberg Government, Bizgnus | Data depth (15+ years of FPDS), entrenched at top-100 federal primes, Fortune-500-grade BI | Price (~5× ours), white-label tenancy (none), integrated decision pipeline (theirs is read-only data + reports) |
| **Federal-data API providers** | HigherGov, FedScout, GovTribe, USAspending direct | API access for in-house teams that build their own tooling | Out-of-the-box SaaS, compliance gate, proposal pipeline, multi-firm management |
| **Proposal-only tools** | RFPIO, Loopio, Responsive | Proposal automation for any vertical (commercial + federal) | Full federal context (NAICS, set-asides, FAR/DFARS), bid/no-bid decisioning, opportunity scoring |
| **Spreadsheets + SAM.gov direct** | (incumbent) | Familiar; zero subscription cost; works at very low volume | Everything we built |

The **fourth row is our actual competition** for 80% of consultancies under 10 FTE. Almost no one in this market is paying $15K/yr for Deltek today; they are using a Google Sheet and SAM.gov's native UI. We are pricing and positioning to displace the spreadsheet, not Deltek.

---

## 2. Feature Matrix vs Direct Comparators

| Capability | MrGovCon | Deltek GovWin | Bloomberg Gov | HigherGov / FedScout | RFPIO / Loopio | Spreadsheet |
|---|---|---|---|---|---|---|
| SAM.gov live ingest | ✅ Auto, scheduled | ✅ | ✅ | ✅ | ❌ | ❌ |
| FPDS / USAspending historical (BigQuery) | ✅ Native | ✅ | ✅ | ✅ | ❌ | ❌ |
| Win-probability scoring (calibrated) | ✅ 9-factor + Bayesian | ⚠️ Heuristic | ⚠️ Heuristic | ⚠️ Heuristic | ❌ | ❌ |
| Fit + market + compliance composite scoring | ✅ 3-layer | ⚠️ Score only | ❌ | ❌ | ❌ | ❌ |
| Bid / No-Bid decision engine with audit trail | ✅ ComplianceLog immutable | ⚠️ Note fields | ❌ | ❌ | ❌ | ❌ |
| FAR / DFARS clause detection | ✅ Keyword + AI | ⚠️ Manual library | ❌ | ❌ | ⚠️ Generic RFP | ❌ |
| Compliance gap matrix per opportunity | ✅ Section L/M auto | ⚠️ Manual | ❌ | ❌ | ⚠️ Generic | ❌ |
| Monte Carlo revenue forecast (1000-run) | ✅ Per-firm | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-tenant white-label (consultancy → clients) | ✅ Built-in | ❌ Single-org | ❌ | ❌ | ⚠️ Per-org | ❌ |
| Client portal (deliverable review + approval) | ✅ Branded per firm | ❌ | ❌ | ❌ | ❌ | ❌ |
| Proposal token economy (LLM-cost passthrough) | ✅ | ❌ Bundled | ❌ | ❌ | ❌ Per seat | ❌ |
| AI proposal draft (per-firm provider) | ✅ Claude/OpenAI/DeepSeek | ⚠️ Bundled GPT | ❌ | ❌ | ⚠️ Generic | ❌ |
| Penalty / financial-tracking | ✅ Per-client | ❌ | ❌ | ❌ | ❌ | ❌ |
| Federal compliance audit log (immutable) | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ |
| **Entry-level annual price** | **TBA at GA (target $3.6K)** | **$15K+** | **$24K+** | **$1.2K–$3.6K** | **$5K+** | **$0** |

`✅` = first-class feature. `⚠️` = present but limited. `❌` = absent.

---

## 3. Positioning Statement

> **MrGovCon is the only platform that combines federal data, calibrated decisioning, and consultancy-native multi-tenancy at a price point a 3-person advisory firm can actually pay.**

The three-way intersection — *federal data depth* AND *calibrated quantitative decisioning* AND *consultancy multi-tenancy* — is unoccupied by any competitor. Deltek has the data + some scoring but no multi-tenancy and a 5× price. RFPIO has the multi-tenancy pattern but no federal context. The downmarket players (HigherGov, FedScout) are read-only data subscriptions; they do not produce decisions, just lists.

---

## 4. Where We Are Honestly Behind

- **Data depth.** Deltek's federal data goes back 15+ years; ours is FPDS / USAspending direct, going back to 2000-10-01 per their API constraint. Practically equivalent for active-bid decisioning, weaker for "longitudinal market trend" analytics. This is not a moat we contest in the Seed-stage pitch.
- **Brand recognition.** GovCon advisory firms know Deltek by name. Most have not heard of us. Mitigation: our beta cohort + LOI'd firms become reference customers; SDVOSB credibility opens a parallel channel.
- **State-procurement coverage.** We support CA / FL / MD / PA via portal scrapers; Deltek supports all 50. Roadmap item, not a Seed-pitch issue.

---

## 5. Where Direct Competitors Are Honestly Behind

- **Multi-tenant white-label**: Deltek and Bloomberg are single-org tools. Consultancies using them must maintain a separate instance per client or do everything in their own org with client data co-mingled. We treat consultancy-managing-N-clients as a first-class architecture (`consultingFirmId` + `clientCompanyId` separation, branding per firm, per-firm AI provider key).
- **Decision auditability**: every state transition in MrGovCon writes to `ComplianceLog` with `triggeredBy`, `fromStatus`, `toStatus`, `reason`, and `entityType`. This is not a feature in Deltek or Bloomberg. For SDVOSB / 8(a) firms going through CPSR (Contractor Purchasing System Review) audits, the immutable audit trail is meaningful.
- **Cost transparency**: our LLM cost passes through to the firm via the proposal-token economy. Firms see exactly what an AI-drafted proposal costs in their balance. Deltek bundles AI features into the seat price; small firms subsidize Fortune-500 AI usage.
- **Speed to ship**: we deploy weekly, in-place via `bash scripts/deploy.sh`. Deltek's release cadence is quarterly. For a regulatory environment that mutates faster than that (FAR/DFARS amendments, DoD CMMC waves), velocity is structural.

---

## 6. The Defensibility Argument

Three layers of moat:

1. **Data layer (BigQuery)**: cumulative ingest of federal award history, normalized per-NAICS competitive density, agency profiles. This compounds. At 12 months in beta we will have 4× the data we ingested in week 1.
2. **Decision-engine calibration**: every beta firm contributes paired (decision, outcome) data into the Bayesian Beta-binomial calibration. Each subsequent firm benefits from the cumulative posterior. This is the kind of data moat Deltek's enterprise model cannot harvest because their customers don't share decisions cross-org.
3. **Network effect at the consultancy tier**: a consulting firm using MrGovCon for 5 clients sees the watchlist signal compound across those clients. As we add the 6th, 7th, 8th client to that firm, the per-firm ROI accelerates (constant subscription, more pipeline value tracked). Lifetime value scales superlinearly.

---

## 7. Document Control

| Field | Value |
|---|---|
| Version | 1.0 draft |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC |
| Refresh cadence | Annually + on any major competitor pricing change |
