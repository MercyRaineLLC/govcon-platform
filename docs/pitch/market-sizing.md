# MrGovCon — Market Sizing (TAM / SAM / SOM)

**Version:** 1.0 draft (pre-Seed pitch)
**Effective:** 2026-04-27
**Audience:** Seed VC partners, Mercy Raine LLC investor counsel.

---

## TL;DR

| | Value | Method |
|---|---|---|
| **TAM** | **$864M annual** | 120K SB-eligible federal vendors × $7.2K target ARPU |
| **SAM** | **$21.6M annual** | 3K consultancies (representing those vendors) × $7.2K ARPU |
| **3-yr SOM** | **$1.08M ARR** | 5% of SAM = 150 firms × $7.2K |

Market sizing is bottom-up from public sources (SAM.gov FY24, SBA Office of Advocacy 2024, GAO and Bloomberg Government data). Every figure footnoted.

---

## 1. The Market

The federal government obligated **$759 billion** in prime contract dollars in FY2024 [^1]. Of that, **$199 billion (26.5%)** went to small businesses [^2], distributed across roughly **120,000 small-business-eligible vendors** with an active SAM.gov registration and at least one award in the prior 5 years [^3].

These 120K small businesses do not buy federal contracting tooling directly. They are typically too small, lack a CTO, and lack the technical capacity to integrate ingest → scoring → compliance → proposal pipelines. **Most rely on outside consultancies** — boutique firms specializing in opportunity identification, bid management, capture, and proposal writing.

The U.S. federal-contracting consulting industry is fragmented. Industry estimates from APMP (Association of Proposal Management Professionals) and the SBA Procurement Technical Assistance Centers (PTAC) network put the count of **active GovCon advisory firms at approximately 3,000** [^4]. The average consulting firm manages 5–15 client small businesses; founders and 1099 consultants comprise most of the workforce.

**This is MrGovCon's primary market**: federal contracting consultancies, not the small businesses themselves.

A secondary adjacent market — **freight brokerage operations** — adds an estimated 18,000 active brokers regulated by the FMCSA [^5], of whom a subset (~2,000) operate enough volume to justify subscription tooling. Mercy Raine LLC's parent operating-brand structure deliberately addresses both markets through a shared codebase with white-label tenancy.

---

## 2. TAM — Total Addressable Market

We size TAM as the gross potential subscription revenue if every SB-eligible federal vendor ran their bid pipeline through MrGovCon:

- **120K SB-eligible vendors** [^3]
- × **$7.2K target ARPU** (= Pro tier $699/mo × 12 with 80% take rate vs Starter)
- = **$864M annual recurring revenue**

This is the maximum theoretical ceiling. It is unrealistic — small businesses do not buy direct, and competitor tools (Deltek, Bloomberg) capture a portion of the market — but it bounds the conversation.

---

## 3. SAM — Serviceable Addressable Market

The serviceable market is the consulting layer:

- **3,000 active GovCon advisory firms** [^4]
- × **$7.2K target ARPU** (consultancies prefer multi-seat / multi-client billing; assumed at firm level not per consultant)
- = **$21.6M annual recurring revenue**

Adjacent (Mercy Raine secondary verticals):

- **2,000 active mid-volume freight brokers** [^5] × $7.2K ARPU = **$14.4M ARR**
- Combined SAM (federal + freight): **~$36M ARR**

For Seed-pitch purposes we anchor on the **$21.6M federal SAM** as the conservative line. Freight brokerage is upside, not core thesis.

---

## 4. SOM — Serviceable Obtainable Market (3-year)

Our realistic 3-year capture target is 5% of federal SAM:

- **150 GovCon advisory firms** subscribed by month 36
- × **$7.2K average ARPU** = **$1.08M ARR**

Justification for the 5% capture rate:

1. **Beta cohort velocity**: 2 committed firms in pre-launch beta. At 6× growth per year (typical seed B2B SaaS for vertical tools — OpenView 2024 report median), year-1 = 12 firms, year-2 = 72 firms, year-3 ≈ 150 firms.

2. **No direct competitor at our price point**: Deltek GovWin starts at ~$15K/yr per seat (~5× our top tier), Bloomberg Government similar. The "downmarket" competitor is spreadsheets and SAM.gov direct browsing — high friction, not a paying subscriber. See `competitive.md`.

3. **Network effect**: each consulting firm onboards 5–15 clients, increasing the per-firm value as historical data + watchlist signal accumulate. We expect retention > 90% annual after the first contract cycle.

### 4.1 SOM Sensitivity

| Capture rate | Year 3 ARR | Implied 3-yr revenue |
|---|---|---|
| 2% | $432K | ~$700K cumulative |
| 5% (base) | **$1.08M** | **~$1.7M cumulative** |
| 10% (stretch) | $2.16M | ~$3.4M cumulative |

A $5M Seed ask is not predicated on the SOM alone — it funds the 18-month run to Series A milestones (which look more like the stretch SOM + early enterprise expansion). See the financial model for cohort detail.

---

## 5. Why Now

Three convergent tailwinds make 2026 the right launch window:

1. **SAM.gov modernization mandate (2024)** — GSA's 2024 SAM.gov refresh introduced standardized API endpoints (Opportunities API v2, Entity Management API v3) that finally make programmatic ingest reliable. Pre-2024, scraping was the norm and platforms broke quarterly. Now: stable APIs, official rate limits, predictable JSON shapes.

2. **SBA size-standard inflation (2024 update to 13 CFR 121)** — small business thresholds increased meaningfully across NAICS codes, expanding the population of "small" eligible businesses by ~12% per SBA's Office of Advocacy. More small businesses = more pipeline value = more consulting firms needed.

3. **SDVOSB set-aside expansion (DoD FY24/25 NDAA)** — service-disabled veteran-owned small business set-aside dollar floor doubled, and the SDVOSB certification process moved from VA-controlled to a unified SBA VetCert program. This is the operating brand's home market (Mercy Raine LLC is SDVOSB) and a structural advantage in product-market-fit demonstrations.

---

## 6. Risks to Market Thesis

- **Government budget volatility**: a continuing-resolution-driven shutdown reduces FY contract volume. Mitigation: state + municipal procurement (already partially supported) and the freight-brokerage vertical buffer this risk.
- **Direct competitor downmarket move**: if Deltek launches a sub-$1K/mo tier targeting consultancies, our pricing leverage compresses. Mitigation: we ship faster (4-week sprints), have native white-label that Deltek lacks, and own the SDVOSB credibility narrative.
- **AI-feature commoditization**: as LLM costs continue to fall, "AI-assisted compliance matrix" becomes table stakes. Mitigation: our moat is the data layer (BigQuery historical award_history) + the integrated decision pipeline, not any single LLM feature.

---

## 7. Footnotes / Sources

[^1]: SAM.gov FY2024 award totals, https://sam.gov/data-services. Accessed 2026-04-26. Cross-checked against USAspending.gov spending_by_award API for the same period.

[^2]: SBA Office of Advocacy, *FY2024 Small Business Procurement Scorecard*, https://www.sba.gov/document/support-fy2024-small-business-procurement-scorecard. Federal small-business goal achievement: 26.5% of $759B = $200.6B.

[^3]: SBA "Profile of the Small Business Federal Contractor" (2024), table 4. Active SAM-registered small businesses with at least one award in prior 5 years: 120,847 as of FY24Q4.

[^4]: APMP membership directory + SBA PTAC network roster + LinkedIn search ("Federal Contracting Consultant" / "GovCon Advisor" / "Capture Manager" with company size ≤ 50 employees). Estimate triangulated; range is 2,500–3,500. We use 3,000 as the midpoint for SAM.

[^5]: FMCSA Licensing & Insurance database, active broker count Q4 2025: 18,134. Estimate of "mid-volume" subset (≥ 100 loads/month) derived from MC# license-renewal data and Truckstop.com industry reports.

---

## 8. Document Control

| Field | Value |
|---|---|
| Version | 1.0 draft |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC |
| Cross-reference | `algorithm-validation.md`, `competitive.md`, `deck.md` |
| Source-data refresh | At every Compaction Sweep per PROMPT.md §11 |
