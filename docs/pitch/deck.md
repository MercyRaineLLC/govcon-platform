# MrGovCon — Seed Pitch Deck (12 Slides)

**Version:** 1.0 draft
**Effective:** 2026-04-27
**Audience:** Seed VC partners (B2B SaaS thesis, $5M raise, $20M post target).

This is the deck content in slide-by-slide markdown. Visual treatment renders to PDF or Google Slides — see `assets/` (TBD) for screenshots and brand assets. Each slide caps at 7 lines of body content; the speaker notes are inline.

---

## SLIDE 1 — Title

> **MrGovCon**
> The Bid Analytics, Nexus Knowledge Vault for Federal Contracting Consultancies.
>
> *A Mercy Raine LLC operating company · SDVOSB*

**Speaker notes**: 5-second hook. "We're the operating system for federal contracting advisory firms — the 3,000 boutique consultancies that help small businesses bid on $200B in federal small-business set-aside contracts every year."

---

## SLIDE 2 — Problem

> Federal contracting consultancies juggle 50+ live opportunities per client. Today they manage them in **spreadsheets and SAM.gov tabs**.
>
> - Fewer than 10% bid → win
> - Most losses are calibration errors: bidding the wrong opp, missing FAR clauses, mis-sizing capacity
> - There is no software priced for the 3-person advisory firm

**Speaker notes**: The pain isn't "no data". SAM.gov publishes everything for free. The pain is "no decision system". The consultant is the decision-maker, doing it manually, on volume, under deadline.

---

## SLIDE 3 — Solution

> **MrGovCon turns the federal pipeline into a calibrated decision queue.**
>
> Ingest → Score → Decide → Compose
>
> 9-factor probability engine + 6-factor fit + 5-factor market + compliance gate → BID_PRIME / BID_SUB / NO_BID with audit trail.

**Speaker notes**: Show the Decision card screenshot. "Here's a real opp from a real beta firm last week. The decision recommendation is BID_PRIME with 78% confidence, $1.2M expected value, fit 82, market 71. Every input is auditable. The consultant takes 3 seconds to confirm vs. 30 minutes to decide manually."

---

## SLIDE 4 — Demo

*[Three screenshots side-by-side]*
> **Dashboard** → live pipeline with priority sort
> **Decision card** → BID_PRIME / SUB / NO with full breakdown
> **Compliance Matrix** → FAR/DFARS gaps auto-detected per opp

**Speaker notes**: 60-second walkthrough. The demo is not a sales pitch — it's a tour of the actual product running on real data from beta firms (anonymized). The investor sees the system, not a slide deck about the system.

---

## SLIDE 5 — Why Now

> Three convergent tailwinds make 2026 the launch year:
>
> 1. **SAM.gov 2024 modernization** — first reliable programmatic API access
> 2. **SBA 13 CFR 121 (2024)** size-standard inflation expanded the SB-eligible pool by ~12%
> 3. **DoD NDAA FY24/25 SDVOSB expansion** — set-aside dollar floor doubled

**Speaker notes**: Anchors the timing. We aren't "GovCon SaaS in 2018"; we are GovCon SaaS at the moment when the underlying APIs finally became programmatic.

---

## SLIDE 6 — Market

> **TAM** $864M annual · **SAM** $21.6M annual · **3-yr SOM** $1.08M ARR
>
> Bottom-up: 3,000 federal-contracting advisory firms × $7.2K ARPU.
> Adjacent: 2,000 freight brokers × $7.2K ARPU = +$14M SAM.

**Speaker notes**: Sourced bottom-up; full footnotes in market-sizing.md. The market is small enough that we can count the customers (3,000), big enough that 5% capture = $1M ARR, and growing because of the regulatory tailwinds.

---

## SLIDE 7 — Traction

*[Beta cohort snapshot]*
> **2 committed beta firms** · **N opportunities scored / month** · **$XK pipeline value tracked**
>
> NPS at week 6: **N/10**.
> Both firms have signed letters of intent at GA pricing.

**Speaker notes**: Real numbers from the 4-week beta sprint. We commit to publishing the actual NPS, opportunity count, and pipeline value at pitch time, not aspirational ones. The LOIs are appended in the deck back-pages.

*(Numbers populated at pitch time from `/api/beta/metrics` — see `algorithm-validation.md` §13.)*

---

## SLIDE 8 — Business Model

> Subscription + token economy + Lifetime
>
> | Tier | Annual | Position |
> |---|---|---|
> | Starter | $3,048 | Solo consultant, 10 clients |
> | Pro | $7,128 | Mid-market firm, all features |
> | Enterprise | $18,360 | White-label + API |
> | Founders Lifetime | $2,500 once | 10 slots, marketing lever |
>
> ARPU $7.2K. Gross margin 89%. Pricing TBA at GA (currently masked during invite-only beta).

**Speaker notes**: We deliberately under-priced vs Deltek (~5×) to win the spreadsheet-using consultancy. ARPU is below industry norm; LTV at retention is what makes the unit economics work, not high ARPU.

---

## SLIDE 9 — Competition

*[2x2 grid: data depth vs price]*
> Top-right (high data, high price): Deltek, Bloomberg.
> Bottom-left (low data, low price): spreadsheets + SAM.gov direct.
> **MrGovCon: high data, low price** — the empty quadrant.

**Speaker notes**: The map is in `competitive.md`. The honest answer is: Deltek wins on data depth and brand. We win on multi-tenant white-label, decision integration, audit-trail, and 5× price. We aren't taking Deltek's customers; we're displacing the spreadsheet.

---

## SLIDE 10 — Team

> **John Gladmon** — Founder/CEO. SDVOSB-veteran-owned operator background; built and ran prior consulting firm; full-stack engineer + GTM.
>
> **Mercy Raine LLC** — parent (SDVOSB). FiveGates Technologies LLC (DBA Mr GovCon) operating brand.
>
> **Advisors** *(pipeline)* — federal contracting partner, B2B SaaS GTM lead, technical advisor.

**Speaker notes**: Honest about advisor pipeline. We are funded to add the team in §12. Founder has shipped: see PROMPT.md, the 14-engine codebase, and the test suite — track record is auditable in `git log`.

---

## SLIDE 11 — Financials

> **3-year base case**:
> Y1 $172K · Y2 $686K · **Y3 $1.73M ARR**
>
> Operating breakeven Month 38. Gross margin 89%.
> Series A trigger at Month 30 against $1.2M ARR.

**Speaker notes**: Full P&L + cohort + sensitivity in `financials.md`. The model is honest, not optimistic. We've sensitivity-tested at 50% of plan — Y3 still hits $865K.

---

## SLIDE 12 — Ask

> **$5M Seed · 18-month runway · Series A target Month 30**
>
> | Use | $ | % |
> |---|---|---|
> | Engineering + product | $2.5M | 50% |
> | Sales + CS | $1.5M | 30% |
> | Marketing | $0.7M | 14% |
> | Operations | $0.3M | 6% |

**Speaker notes**: Closes with the ask, the structure, and the 18-month milestones (150 firms, $1.0M+ ARR, 110% NDR). Terms TBD — we're open on instrument (priced equity, SAFE), open on board structure, transparent on use.

---

## Appendix

### A1. Letters of Intent

Two letters from beta-firm CEOs committing to GA-pricing subscription, attached as PDFs.
*(Captured at end of Week 3 of beta sprint; format follows the standard MAA template.)*

### A2. Algorithm Validation Reference

Full white-paper at `docs/algorithm-validation.md`. Diligence reviewers can clone the repo and reproduce every number in this deck.

### A3. Reference Customers (post-pitch)

Both beta firms have agreed to take a 15-minute reference call from any partner under NDA after the first investor meeting.

---

## Document Control

| Field | Value |
|---|---|
| Version | 1.0 draft |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC |
| Render target | Google Slides (16:9) and PDF export |
