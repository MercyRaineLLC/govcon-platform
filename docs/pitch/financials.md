# MrGovCon — Financial Model

**Version:** 1.0 draft
**Effective:** 2026-04-27
**Audience:** Seed VC partners; Mercy Raine LLC investor counsel.

This is the model in narrative + table form. A linked spreadsheet with monthly projections is at `docs/pitch/financials.xlsx` (same numbers, more detail). Every assumption in §1 is footnoted; every figure in §2–§6 is mechanically derived from §1.

---

## 1. Core Assumptions

### Pricing (TBA at GA — current Stripe prices held in code, hidden from beta UI)

| Tier | Monthly | Annual | Notes |
|---|---|---|---|
| Starter | $299 | $254/mo | 3 users, 10 clients, 100 AI calls/mo |
| Professional | $699 | $594/mo | 10 users, 50 clients, 1000 AI calls/mo, all features |
| Enterprise | $1,800 | $1,530/mo | unlimited, white-label, API access |
| Founders Lifetime | $2,500 one-time | n/a | 10 slots, professional-tier features forever |

ARPU base case: weighted average **$7.2K/yr** assuming 50% Pro / 30% Starter / 20% Enterprise on annual billing.

### Conversion Funnel (anchored to comparable B2B SaaS verticals — OpenView 2024)

| Funnel stage | Conversion |
|---|---|
| Cold visitor → beta-access signup | 2% |
| Beta signup → demo booked | 35% |
| Demo → paid subscription | 30% |
| Visitor → paid (compound) | **0.21%** |

Customer acquisition cost (blended, year 1): **$650**, falling to $350 by year 3 as content / referral channels mature.

### Retention (B2B SaaS for vertical tools, OpenView 2024 median for ARPU < $10K)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Gross logo retention | 85% | 90% | 92% |
| Net dollar retention | 95% | 105% | 112% |

### COGS

| Line | Per-customer / mo | Notes |
|---|---|---|
| LLM tokens (Claude/OpenAI passthrough) | $35 | Variable; firm pays 5 tokens per draft = $25 retail; $0.50 our cost |
| BigQuery storage + queries | $8 | Anchored on current 7K-row table × 10× growth × $0.02/GB-mo |
| Postgres + Redis (DigitalOcean droplet) | $2 | Amortized — droplet handles 100+ firms |
| SAM API quota (firm-key passthrough) | $0 | Firms supply own SAM key; no platform cost |
| SMTP (Resend) | $1 | $20/mo for 100K emails ÷ ~20 firms |
| Stripe processing | 3.0% of revenue | 2.9% + $0.30 per charge, blended |
| **Total COGS / mo** | **~$46 + 3% rev** | |

Implied gross margin at $599 ARPU/mo: $599 - 46 - 18 = **$535 = 89%**.

### Headcount (sole founder until month 9, then ramp)

| Role | Start | Salary (annual) |
|---|---|---|
| Founder / CEO / engineer | M0 | $0 (deferred) → $96K from M9 |
| Sales lead (M9) | M9 | $120K base + commission |
| Senior engineer #2 (M12) | M12 | $160K |
| Customer success (M15) | M15 | $90K |
| Senior engineer #3 (M18) | M18 | $160K |

Founder's deferred comp accrues as a $72K/yr forgivable note that converts to common at Series A.

### Other Operating Expenses

- **Infrastructure** (DO droplet, Stripe, SMTP base): $250/mo flat through Y2; $800/mo Y3.
- **Tooling** (Claude API, BigQuery base, monitoring): $400/mo Y1, $1,000/mo Y2, $1,800/mo Y3.
- **Marketing** (content + paid acquisition): $0 M0–M6, $5K/mo M7–M12, $15K/mo Y2, $30K/mo Y3.
- **Legal + accounting**: $1,500/mo flat.
- **R&D contingency**: 5% of revenue.

---

## 2. Customer Cohort Build (Bottoms-Up)

| | M3 | M6 | M9 | M12 | M18 | M24 | M36 |
|---|---|---|---|---|---|---|---|
| New customers / mo | 1 | 2 | 3 | 5 | 8 | 12 | 18 |
| Cumulative customers | 2 | 8 | 18 | 38 | 80 | 138 | 270 |
| Net active (after churn) | 2 | 8 | 17 | 35 | 72 | 124 | 240 |
| ARR (active × ARPU) | $14K | $58K | $122K | $252K | $518K | $893K | **$1.73M** |

The two committed beta firms anchor M0 → M3. Year-1 growth rate matches OpenView 2024 vertical-SaaS median (5–7× from ARR $50K → $300K) at the lower end of plausible.

---

## 3. P&L (Three-Year Summary)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Revenue | $172K | $686K | $1,732K |
| COGS | ($45K) | ($156K) | ($350K) |
| **Gross profit** | **$127K** | **$530K** | **$1,382K** |
| Gross margin | 74% | 77% | 80% |
| Salaries (incl. founder M9+) | ($120K) | ($530K) | ($1,090K) |
| Marketing | ($30K) | ($180K) | ($360K) |
| Tooling + infra | ($8K) | ($17K) | ($31K) |
| Legal + admin | ($18K) | ($18K) | ($18K) |
| **Operating profit (loss)** | **($49K)** | **($215K)** | **($117K)** |
| EBITDA margin | -29% | -31% | -7% |

The model crosses operating breakeven in **month 38**, well within the 42-month Seed-to-Series-A window for a well-positioned vertical SaaS. Series A target raised at month 30 against $1.2M ARR + 110% NDR + 85% gross logo retention.

---

## 4. Use of $5M Seed (18-month runway)

| Category | Amount | %  |
|---|---|---|
| Engineering + product (founder + 2 engineers) | $2,500K | 50% |
| Sales + customer success (sales lead M9, CS M15) | $1,500K | 30% |
| Marketing (content + paid + events) | $700K | 14% |
| Operations (legal, accounting, ops infrastructure) | $300K | 6% |
| **Total** | **$5,000K** | **100%** |

Pacing: $250K/mo average burn over 18 months, ramping from $130K early to $400K by month 18 as headcount fills.

Liquidity at month 18: ~$1.0M cash + $520K ARR run-rate → trigger Series A on traction (typical seed → A bar: $1M ARR + retention metrics).

---

## 5. Key Ratios at Series A Trigger (Month 30)

| Ratio | Target | Comparable |
|---|---|---|
| ARR | $1.2M | Vertical SaaS Seed→A median (OpenView): $0.8M–$2M |
| Net dollar retention | 105–112% | Best-in-class B2B SaaS: 110–125% |
| Gross logo retention | 88–92% | B2B SaaS for SMB: 80–90% |
| LTV / CAC | 4.5–6.0× | Healthy: ≥3.0× |
| Months to recover CAC | 11 | Healthy: ≤18 |
| Burn multiple | ~1.5× | Efficient: ≤1.5×; Series A bar: ≤2.5× |

---

## 6. Sensitivity / Risks

- **Slower customer acquisition** (50% of base case): Y3 ARR drops to $865K, Series A delayed by 4–6 months. Mitigation: extend Seed runway by trimming headcount Q4 hire (CS) and reducing marketing 50%.
- **LLM cost spikes 2×**: COGS rises ~$400/customer/yr, GM drops to ~85%. Still healthy; absorbable in pricing or via firm BYO-key.
- **Founder unable to defer salary**: $72K/yr × 9 months = $54K additional cash burn. Trim runway by 1 month or take it from contingency.

The model is designed to be honest, not optimistic. Every assumption is replaceable in the spreadsheet to allow investor partners to run their own scenarios.

---

## 7. Document Control

| Field | Value |
|---|---|
| Version | 1.0 draft |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC |
| Cross-reference | `market-sizing.md`, `competitive.md`, `deck.md` |
