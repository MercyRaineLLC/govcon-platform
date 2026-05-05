# MrGovCon — Beta Onboarding Guide

**For:** Beta-cohort firm administrators
**Effective:** 2026-04-27
**Time required:** 30 minutes self-serve

---

## Welcome

You're one of the first firms onboarding to MrGovCon. This guide walks you through everything from account creation to your first scored opportunity, end-to-end, with no calls required. If you get stuck, email johngladmon917@gmail.com and we'll respond within 4 business hours.

**During beta, all subscription pricing is hidden and no payment is required.** Plan-tier features are unlocked for your firm at the **Professional tier equivalent** (10 users, 50 clients, 1000 AI calls/month, all features). Upgrade flows are disabled and replaced with "Available at GA" badges. You will not be billed for anything during the beta period.

---

## Step 1 — Account creation (5 min)

You should have received an invite link. If not, email us — we send links from `noreply@mrgovcon.co`.

1. Click the invite link → lands on `/register?invite=...`
2. Fill in your firm name, your name, email, password (12+ chars).
3. Click **Create account**.
4. You'll land on the dashboard. The first time you log in, an **Onboarding Wizard** appears.

That wizard is a 5-step tour. Skip it if you want and return via the help icon top-right.

---

## Step 2 — Configure your SAM.gov API key (3 min)

The platform pulls federal opportunities from SAM.gov on your behalf. You'll need a **free** SAM.gov API key.

1. Go to https://open.gsa.gov/api/get-opportunities-public-api/ and click "Get API Key"
2. Sign in with your existing SAM.gov account (or create one — also free)
3. Copy the API key
4. In MrGovCon: **Settings → API Keys → SAM.gov API Key**, paste, save

**Why this is BYO-key**: SAM.gov rate-limits per key. By keeping each firm on its own key, no single firm's heavy usage starves another firm's ingest.

---

## Step 3 — Configure an AI provider (5 min)

Compliance matrix generation, proposal drafting, and AI-assisted clause detection use a Large Language Model provider of your choice. Options:

| Provider | Cost | Get a key |
|---|---|---|
| **Claude (Anthropic)** *recommended* | $3 input / $15 output per 1M tokens | https://console.anthropic.com/ |
| OpenAI | $5 input / $15 output per 1M tokens | https://platform.openai.com/api-keys |
| DeepSeek | $0.27 input / $1.10 output per 1M tokens | https://platform.deepseek.com/api_keys |
| LocalAI / Ollama (on-prem) | $0 (your hardware) | https://ollama.ai/ |

In MrGovCon: **Settings → AI Intelligence Provider**, paste the API key, choose default provider, save.

**Cost transparency**: every AI call is metered. Outline = 1 token (~$0.03 LLM cost), full proposal draft = 5 tokens (~$0.26). During beta you have a starting balance of 50 tokens; we top up monthly.

---

## Step 4 — Add your first 3 clients (5 min)

A "client" is a small business your firm helps bid on federal contracts. Each client has:

- **Name + contact email**
- **NAICS codes** they bid in (you can add many; we'll match opportunities against any)
- **Set-aside certifications**: SDVOSB / WOSB / HUBZone / Small Business
- **Home state** (for geographic-fit scoring)

To add: **Clients → Add Client**. The fields are minimal; you can fill in the rest later.

For your first onboarding, add **3 representative clients** — ideally one strong fit, one weaker fit, and one in a different NAICS sector. This gives the scoring engine variety to work with.

---

## Step 5 — Sync federal opportunities (8 min)

1. **Opportunities → Sync Contracts** (top-right button)
2. The sync runs in the background. SAM.gov returns ~25–100 opportunities per page; we paginate up to 25 pages by default.
3. The button shows a spinner; you can navigate away — sync continues. The status banner will update when done (typically 3–7 minutes; cap at 15 minutes after which the UI flips to "complete" and you can review what landed).
4. If you see "Cancel" appear next to "Syncing...", you can stop the sync at any time.

After sync, the **Opportunities** list populates. Each opportunity is auto-scored against your most-recently-active client (the one you last viewed). To re-score against a different client, use the dropdown on each opportunity card.

---

## Step 6 — Read your first decision (5 min)

1. Click any opportunity to open its detail page.
2. The **Decision card** shows BID_PRIME / BID_SUB / NO_BID with:
   - Win probability (0–100%)
   - Expected value (probability × estimated contract value)
   - Fit score (0–100, your client's capability)
   - Market score (0–100, opportunity attractiveness)
   - Compliance gate status (ELIGIBLE / CONDITIONAL / INELIGIBLE)
   - Risk score (0–100, lower = safer)
3. Hover any sub-score to see the breakdown of contributing factors.
4. The **Compliance Gap Analysis** below the decision card lists FAR / DFARS clauses the platform detected as relevant. Clauses flagged "AI-suggested" need your confirmation before they enter the audit trail.

**Disagree with a decision?** That's the most valuable feedback you can give. Use the **Feedback button** (bottom-right of any opportunity page) to tell us why. The signal goes into our calibration backlog.

---

## Step 7 — Generate your first compliance matrix (3 min)

1. On any opportunity, click **Generate Compliance Matrix**.
2. The matrix uses Section L (Instructions to Offerors) and Section M (Evaluation Factors) text from the RFP if available, otherwise infers from title + description.
3. Output is a downloadable PDF + an editable in-app table.
4. Section L items become tasks assignable to your team or to the client.

This costs **0 tokens** — we believe compliance work shouldn't be metered.

---

## Step 8 — Generate your first proposal draft (10 min)

1. On any opportunity, click **Proposal Assistant**.
2. Step 1: **Outline** — 1 token. The AI sketches a Section L/M-aligned outline with win themes.
3. Step 2: **Interview** — 7–9 questions tailored to this opportunity. Fill in what you know; "AI Decide" anything you don't.
4. Step 3: **Generate Full Draft PDF** — 5 tokens. Takes 3–5 minutes. The page shows status; do not close the tab.
5. PDF downloads automatically when ready. A copy is saved server-side; reopening the opportunity shows a "draft on file" banner so you don't pay tokens twice.

---

## Step 9 — Submit feedback (any time)

Two channels:

1. **Inline feedback button** (lower-right on every opportunity page) — captures NPS-light + the kill/add-feature questions. Goes into your firm's `BetaFeedback` table; admins see aggregates at **Admin → Beta Metrics**.
2. **Direct email** — johngladmon917@gmail.com. Bug reports and surprises welcome; we triage daily and reply within 4 business hours.

---

## What we ask of you during beta

- **Use the platform on your real opportunities.** Synthetic data won't help us calibrate.
- **Tell us when the decision is wrong.** Even a one-line "this NO_BID was wrong" helps. The point of the beta is to find these.
- **Once at week 3, give us a 2-paragraph quote** for use in our investor materials, with permission to use your firm name. Optional but strongly appreciated.
- **15-minute reference call** with potential investors, after first pitch meeting, under NDA. Optional.

---

## What we won't do during beta

- Charge you a subscription. (Pricing is masked in the UI; checkout flows are disabled.)
- Share your firm's data, decisions, or pipeline with any other firm. Multi-tenancy is enforced at the database query layer; cross-tenant access is impossible by design.
- Use your firm's data to train any AI model. LLM calls use your configured provider; data flows firm → provider, never firm → competing firm or firm → MrGovCon training.

---

## Reference

| | Where |
|---|---|
| Algorithm validation | `docs/algorithm-validation.md` |
| Architecture / API contracts | `.ai/PROMPT.md` |
| Public repository | https://github.com/MercyRaineLLC/govcon-platform |
| Contact | johngladmon917@gmail.com |
| Status page (uptime, deploys) | TBD |

---

## Document Control

| Field | Value |
|---|---|
| Version | 1.0 |
| Effective | 2026-04-27 |
| Maintainer | Mercy Raine LLC |
