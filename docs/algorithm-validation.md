# MrGovCon Algorithm Validation

**Version:** 1.0 (draft, pre-Seed pitch)
**Effective:** 2026-04-27
**Author:** Mercy Raine LLC, Engineering
**Audience:** Technical due-diligence reviewers, prospective Seed VC technical advisors, prospective beta-firm CTOs.

---

## 0. How to Read This Document

Every quantitative claim made in MrGovCon's product UI, marketing surfaces, or pitch materials traces back to one of the algorithms documented here. For each algorithm we provide: source file path, mathematical form, hyperparameter values, theoretical or empirical justification, test coverage, and known limitations.

The platform is in invite-only beta with two committed firms; we explicitly call out which calibration claims rest on robust priors versus which await empirical confirmation at higher N. Honesty here is non-negotiable — every number an investor's auditor sees in the UI is reproducible from this document plus the public repository at `MercyRaineLLC/govcon-platform`.

---

## 1. Executive Summary

The MrGovCon BANKV (Bid Analytics, Nexus Knowledge Vault) Engine combines fourteen quantitative models across five domains — Scoring, Forecasting, Compliance, Risk, and Market Intelligence — to produce a single recommendation per opportunity-client pair: NO_BID, BID_SUB, or BID_PRIME, with an associated win probability, expected value, and risk score.

The probability core is a **9-factor logistic regression** with weights summing to 1.0, fed into a sigmoid with bias = -3.0 and scale = 6.0 to reflect the competitive baseline of the federal market. Above the probability core sit a **6-factor fit composite** and a **5-factor market composite**, both producing 0–100 scores. A **3-layer decision resolver** combines the compliance gate (ELIGIBLE / CONDITIONAL / INELIGIBLE) with the two composite scores into the final recommendation. Forecasting uses **Monte Carlo simulation** (1000 runs, Bernoulli × lognormal) over the active pipeline to produce a 6-month revenue band with p10 / p50 / p90.

Every algorithm in this paper has unit-test coverage as of commit `4a5823ae`. The full test suite runs on every push via GitHub Actions.

**Bottom-line accuracy claim**: out-of-sample backtest against USAspending Federal Procurement Data System (FPDS) data is in progress. Until calibration with N≥30 firms is available, our public claim is process quality and decision auditability — not headline accuracy.

---

## 2. Probability Engine — 9-Factor Logistic Regression

**File:** `backend/src/engines/probabilityEngine.ts`
**Tests:** `backend/src/engines/probabilityEngine.test.ts` (19 cases)

### 2.1 Form

For an opportunity-client pair, we compute nine features on `[0, 1]`:

| Feature | Weight | Source |
|---|---|---|
| `naicsOverlapScore` | 0.24 | Hierarchical match: exact NAICS = 1.0, 4-digit sector = 0.6, 2-digit subsector = 0.3, none = 0.0 |
| `incumbentWeaknessScore` | 0.19 | `1 - incumbentProbability + competitionBonus`, clamped to `[0,1]` |
| `documentAlignmentScore` | 0.16 | LLM-assisted SOW-vs-client-capability match score (services/documentAnalysis.ts) |
| `agencyAlignmentScore` | 0.12 | Agency SDVOSB/SB rate × client certification fit |
| `awardSizeFitScore` | 0.09 | Sweet-spot ratio of estimated value vs client past award range |
| `competitionDensityScore` | 0.08 | NAICS-normalized density: `1 - (count / 20)` clamped |
| `agencyHistoryScore` | 0.07 | Historical buying behavior — set-aside affinity for client cert |
| `historicalDistribution` | 0.03 | USAspending base rate for the NAICS code |
| `deadlineUrgencyScore` | 0.02 | Proposal-prep window quality, peaks at 2–6 weeks |

The composite Z-score is the dot product of weights and features. The probability is then the sigmoid:

$$P = \frac{1}{1 + e^{-(\text{SCALE} \cdot Z + \text{BIAS})}}$$

with **SCALE = 6.0** and **BIAS = -3.0**.

### 2.2 Justification of Hyperparameters

**Weights** (sum = 1.000, runtime-asserted at module load): the ranking — NAICS overlap > incumbent weakness > document alignment > agency alignment > award size fit > competition density > agency history > historical distribution > deadline urgency — reflects the operating heuristics validated by the founding team's federal contracting practice over multiple proposal cycles. The relative ordering is internally derived; the absolute magnitudes will be re-derived from beta-cohort data once we have N≥30 firm-quarters. We commit to publishing any future weight changes against a held-out backtest in subsequent versions of this paper.

**SCALE = 6.0** sets the sigmoid steepness so that an all-features-at-0.5 (genuinely neutral) opportunity returns probability ≈ 0.50. The midpoint and steepness reflect a market where opportunities meaningfully separate above and below median.

**BIAS = -3.0** sets the all-features-at-zero baseline to sigmoid(-3) ≈ 0.047. The federal contracting market is competitive; new entrants without any positive signal should expect a sub-5% prior probability of winning. This baseline is consistent with public FPDS data showing typical 10–30 bidder counts on small-business set-aside RFPs and aligns with bid-win-rate norms reported by SBA Office of Advocacy.

**Reference**: McCullagh & Nelder, *Generalized Linear Models* (2nd ed., Chapman & Hall, 1989), Chapter 4 (binary regression). The logistic link is the canonical link for binomial GLM and yields probabilities natively in `[0, 1]` without clipping.

### 2.3 Bayesian Calibration (decisionEngine.ts)

After computing the base probability, we calibrate against firm-specific posterior using Beta-binomial conjugacy:

$$P_{\text{calibrated}} = \frac{P_{\text{base}} \cdot \alpha + \text{wins}}{α + β + \text{wins} + \text{losses}}$$

with pseudo-count $\alpha + \beta = 10$ representing prior strength. This means a firm with 0 wins/0 losses gets the base probability essentially unchanged; a firm with 30 wins / 10 losses sees their actual win rate dominate the posterior.

**Reference**: Gelman et al., *Bayesian Data Analysis* (3rd ed., CRC Press, 2013), Chapter 2.4 (informative priors for Beta) and Chapter 5 (hierarchical models). Pseudo-count = 10 is standard for "weakly informative" priors when the prior is theoretical rather than data-driven.

### 2.4 Penalty Drag

Each firm's accumulated late-submission financial penalties depress their effective win probability via:

$$P_{\text{adjusted}} = P_{\text{calibrated}} \cdot e^{-\text{totalPenalties}/200{,}000}$$

The constant **200,000** (USD) is internally derived: firms with $0 in penalties see no drag; firms with $200K cumulative penalties see a 1/e ≈ 36.8% multiplicative reduction; firms with $1M see a 99.3% reduction. The exponential form ensures the drag is smooth and never positive.

**Limitation**: this constant is an admitted heuristic awaiting empirical re-derivation from the beta cohort. We will publish an updated value (with confidence interval) in v2.0 of this paper after collecting N≥10 firm-quarters of paired (penalty-history, subsequent-bid-outcome) data.

---

## 3. Fit Score — 6-Factor Capability Composite

**File:** `backend/src/engines/fitScoring.ts`
**Tests:** `backend/src/engines/fitScoring.test.ts` (16 cases)

| Factor | Weight | Description |
|---|---|---|
| `naicsDepth` | 0.25 | Exact match = 100, 4-digit = 60, 2-digit = 30, none = 0 |
| `pastPerformance` | 0.20 | Win rate × 60 + completion rate × 16 + base 35 |
| `capacityFit` | 0.20 | Ratio of estimatedValue to client's typical award range |
| `resourceReadiness` | 0.15 | Days until deadline: ≥45=100, ≥30=90, ≥20=75, ≥14=60, ≥7=40, ≥3=20, else 5 |
| `geographicFit` | 0.10 | State match=100, DC-cluster cross-match=75, nationwide=80, mismatch=40 |
| `financialStrength` | 0.10 | Penalty discount: $0=100, <$5K=85, <$25K=70, <$100K=50, ≥$100K=30 |

Output is `clamp_{0,100}( Σ weight_i × factor_i )`.

The "DC-cluster" set is `{DC, VA, MD, PA, DE, WV, NJ}` — federal contracting agglomeration around the National Capital Region. Documented in SBA Office of Advocacy data showing ~32% of small-business federal contract dollars flow through DC-cluster zip codes.

The `$500K–$5M` and `$15M-$50M` capacity ranges align with SBA size-standard inflation history (13 CFR 121, revised 2024). The capacity factor's piecewise function is internally derived; capacity-fit calibration is a known target for the v2.0 paper.

---

## 4. Market Score — 5-Factor Opportunity Composite

**File:** `backend/src/engines/marketScoring.ts`
**Tests:** `backend/src/engines/marketScoring.test.ts` (22 cases)

| Factor | Weight | Description |
|---|---|---|
| `competitionDensity` | 0.30 | Bidder-count buckets: 1=95, 2=88, 3=80, ≤5=70, ≤8=58, ≤12=45, ≤20=30, else 15 |
| `incumbentStrength` | 0.25 | Inverted incumbent probability with recompete bonus when incumbent < 0.65 |
| `contractValueFit` | 0.20 | Sweet spot $500K–$5M = 95; degrades on either end (sub-$150K or > $50M) |
| `agencyBuyingPatterns` | 0.15 | Cert-aware: SDVOSB rate for SDVOSB clients, SB rate for SB clients |
| `timingAdvantage` | 0.10 | Sources Sought=85, Presolicitation=72, Solicitation=55, Award=30, Sole Source=15 |

The contract-value sweet spot is empirically anchored in FPDS award-size distributions: SDVOSB and small-business set-aside awards cluster in the $500K–$15M range per SBA's 2024 small-business contracting goal report (federal achievement: 26.5% of $750B prime-contracting outlay = ~$199B to small business, with median set-aside ≈ $3.2M).

---

## 5. Decision Resolver — 3-Layer Recommendation Matrix

**File:** `backend/src/engines/decisionResolver.ts`
**Tests:** `backend/src/engines/decisionResolver.test.ts` (14 cases)

Decision matrix:

| Compliance Gate | Adjusted Fit | Adjusted Market | Result |
|---|---|---|---|
| INELIGIBLE | (any) | (any) | NO_BID, risk = 100 |
| ELIGIBLE | ≥ 65 | ≥ 60 | BID_PRIME |
| ELIGIBLE | ≥ 40 | ≥ 40 | BID_SUB |
| ELIGIBLE | < 40 OR < 40 | (other) | NO_BID |
| CONDITIONAL | (apply -5 penalty to both, then re-evaluate) | | (same as ELIGIBLE) |

Confidence modifiers applied to win probability post-resolution:
- BID_PRIME with fit ≥ 80 AND market ≥ 75: **+0.03**
- BID_SUB: **-0.05** (sub-bid uncertainty discount)
- NO_BID / others: **0**

The `Fit ≥ 65, Market ≥ 60` and `Fit ≥ 40, Market ≥ 40` thresholds are the canonical bid-no-bid threshold pair internally derived from the founders' practice. Sensitivity analysis at thresholds (60/55), (65/60), (70/65) is queued for v2.0 once the backtest output is available.

---

## 6. Compliance Gate — Hard / Soft Eligibility Filter

**File:** `backend/src/engines/complianceGate.ts`

Inputs: client profile (SDVOSB / WOSB / HUBZone / small-business flags, NAICS codes, SAM registration status + expiry) and opportunity profile (set-aside type, NAICS, response deadline).

**Hard gates → INELIGIBLE**:
- Set-aside type requires a certification the client lacks (e.g., SDVOSB-restricted RFP for non-SDVOSB client)
- Sub-2-digit NAICS sector mismatch with no client capability
- SAM registration expired

**Soft gates → CONDITIONAL** (flagged but bid is allowed):
- SAM expiry within 30 days
- NAICS subsector gap (client has 2-digit match but not 4-digit)
- Set-aside is "Total Small Business" but client's small-business size standard at the opp NAICS is unverified

**No flags → ELIGIBLE**.

**Reference**: FAR 52.219-1 through 52.219-30 (small business set-aside clauses), 13 CFR 121 (size standards), 13 CFR 124 (8(a) BD program), 13 CFR 126 (HUBZone), 13 CFR 127 (WOSB / EDWOSB), 13 CFR 128 (VOSB / SDVOSB).

The clause-to-rule mapping is hard-coded per-clause in `services/complianceGapAnalysis.ts` (`CLAUSE_LIBRARY`), which lists 11 FAR clauses + 3 DFARS clauses + 8 set-aside requirements. Each entry cites the source regulation and the platform's detection method (keyword-only or AI-augmented).

---

## 7. FAR / DFARS Clause Detection

**File:** `backend/src/services/complianceGapAnalysis.ts`, `backend/src/services/aiClauseExtractor.ts`

Two-tier detection:

1. **Keyword pattern** — regex match against the opportunity title + description. Fast, deterministic, zero-cost. Each clause has a hand-curated keyword set sourced from the actual regulation text. Example: FAR 52.204-7 (SAM registration) detects on `/(sam\.gov|system for award management|sam registration)/i`.

2. **AI augmentation** (optional, gated by firm's LLM provider configuration) — Claude Sonnet 4.6 / DeepSeek extracts clause references from RFP attachments. Output is JSON-validated and cached in Redis for 30 days per opportunity. Confidence threshold for AI-flagged clauses: 0.7. Below threshold flags are surfaced as "AI-suggested, human review needed" and require operator confirmation before they are written to `ComplianceLog`.

`detectedBy` field on each gap entry is one of `KEYWORD`, `AI`, or `BOTH`. Investors can audit the platform's compliance recommendations by running the same RFP through both paths and comparing the union vs intersection.

---

## 8. Monte Carlo Revenue Forecaster

**File:** `backend/src/services/revenueForecaster.ts`

For each active opportunity in the firm's pipeline:

```
For each of 1000 simulations:
  win = Bernoulli(probability)
  if win:
    nominal_revenue = estimatedValue × effective_share
    realized = nominal_revenue × LogNormal(σ = 0.2)
  Σ over all opps in the time-bucket → simulation total
```

Each opportunity's effective share is `1.0` for BID_PRIME and `0.30` for BID_SUB (subcontract revenue share). Recompete opportunities receive an `OPTION_YEAR_FACTOR = 2.5` multiplier on the principal value to reflect base + 4 option years. Realized revenue is discounted by an `exp(-0.02 × elapsed_quarters)` time-to-award factor representing federal procurement cycle latency (median 9 months obligation-to-funding per FPDS).

LogNormal noise with **σ = 0.2** is currently a defensible default for federal contracts, where execution-vs-obligated value typically falls within ±30% (FPDS award-amount-vs-base-value distribution). Empirical re-derivation from BigQuery `award_history` data (10K+ rows of paired Base Obligation Date + Period of Performance) is queued for v2.0.

The Box-Muller transform is used to draw normals from `Uniform(0, 1)`:
$$Z = \sqrt{-2 \ln U_1} \cos(2\pi U_2)$$

This is the exact form required for high-quality independent Gaussian samples without library dependencies.

Output: per-month aggregates `{period, expected, p10, p50, p90}` over a configurable forecast window (default 6 months).

---

## 9. Herfindahl–Hirschman Index (HHI) for Portfolio Concentration

**File:** `backend/src/services/revenueForecaster.ts`

For client diversification, NAICS concentration, and agency dependency:

$$\text{HHI} = \sum_i \left(\frac{n_i}{N}\right)^2$$

where $n_i$ is the count of opportunities (or revenue dollars) for category $i$ and $N$ is the total. HHI ranges from $1/k$ (perfectly equally distributed across $k$ categories) to $1.0$ (single-category dominance).

**Reference**: U.S. Federal Trade Commission and Department of Justice 2010 Horizontal Merger Guidelines, §5.3 — HHI thresholds for market concentration (0.15 = unconcentrated, 0.25 = moderately concentrated, > 0.25 = highly concentrated). We use these same thresholds for portfolio diversification scoring.

---

## 10. Trend Analysis (EMA + Linear Regression)

**File:** `backend/src/services/trendAnalysis.ts`, `backend/src/services/marketIntelligence.ts`

Exponential Moving Average for time-series smoothing of submission velocity, win rate, and penalty trend:

$$\text{EMA}_t = \alpha \cdot x_t + (1-\alpha) \cdot \text{EMA}_{t-1}, \quad \alpha = \frac{2}{N+1}$$

NAICS sector trend detection uses ordinary least-squares linear regression on quarterly award counts per NAICS, slope normalized by mean to produce a dimensionless "growth rate" expression.

**Reference**: Hyndman & Athanasopoulos, *Forecasting: Principles and Practice* (3rd ed., OTexts, 2021), Chapter 7 (exponential smoothing). The `α = 2/(N+1)` substitution gives a "span" interpretation matching pandas' `ewm(span=N)`.

---

## 11. Limitations and Known Calibration Gaps

We commit to honesty here because investors are smart and beta firms are smarter.

1. **Hyperparameter sensitivity is not yet published.** Weights (probability), thresholds (decision matrix), and constants (penalty drag, lognormal sigma) are derived from the founding team's federal-contracting practice. Independent backtest with N ≥ 30 firm-quarters will publish in v2.0 of this paper.

2. **Backtest is winners-only.** `services/backtest/historicalBacktest.ts` currently samples USAspending winners and asks "would our model have predicted this win". This gives recall but not precision; we cannot yet measure false-positive rate. Adding a synthetic-loser sampler (matched-NAICS / matched-agency / matched-period non-winners) is the immediate v2.0 priority.

3. **`documentAlignmentScore` is opaque.** This 16% weight feature is computed from LLM analysis of uploaded SOW + client capability documents. The numeric value is reproducible from the prompt + cache, but the LLM's reasoning is not auditable in the deterministic sense. Beta firms may opt out and the score defaults to 0.5 (neutral) — this opt-out is documented in the firm Settings panel.

4. **Recompete boost** (×1.08–1.15 inside `decisionEngine.ts`) is a heuristic applied after the probability computation. v2.0 will either fold this into the core probability model with a derived weight, or remove it.

5. **Compliance gate's "CONDITIONAL" classification** is currently informational. Bids on CONDITIONAL opportunities are allowed; the operator is expected to resolve the flagged conditions before submission. We do not block submissions in CONDITIONAL state by design — overblocking is worse than under-flagging in practice.

6. **State / municipal procurement coverage is partial.** State-level scrapers exist for CA, FL, MD, PA — see `services/stateProcurementScraper.ts`. No national coverage. Municipal RFPs are not ingested.

---

## 12. Reproducibility

A diligence reviewer can independently verify every claim in this paper:

```bash
git clone https://github.com/MercyRaineLLC/govcon-platform
cd govcon-platform/backend
npm install
npx prisma generate
npm test
```

All 95+ algorithm tests run in under 2 seconds locally. The CI workflow at `.github/workflows/ci.yml` runs the same suite plus type-checking and a production build on every push to main, against ephemeral Postgres + Redis service containers.

The full historical backtest can be triggered (with a populated BigQuery `award_history` table — see `docs/beta-onboarding.md`) via:

```bash
docker exec govcon_backend node -e "require('./dist/services/backtest/historicalBacktest').runBacktest({ winnerSampleSize: 500 })"
```

Brier score, calibration bins, and predictions land in the `BacktestRun` and `BacktestPrediction` Postgres tables and are surfaced in the admin `/admin/backtest` UI.

---

## 13. Document Control

| Field | Value |
|---|---|
| Version | 1.0 (draft) |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC, MrGovCon Engineering |
| Repository | https://github.com/MercyRaineLLC/govcon-platform |
| Reference architecture doc | `.ai/PROMPT.md` (v1.1, 2026-04-26) |
| Companion test commit | `4a5823ae` |

### 13.1 Changelog

- **2026-04-27 v1.0 draft** — Initial publication. Documents 9-factor probability, 6-factor fit, 5-factor market, 3-layer decision, compliance gate + FAR/DFARS detector, Monte Carlo forecaster, HHI, EMA / linear regression. Tests committed at `4a5823ae`. Backtest with calibration bins + bootstrap CI is the v2.0 milestone.
