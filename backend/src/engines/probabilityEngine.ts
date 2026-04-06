// =============================================================
// Win Probability Engine — 9-Factor Decision Model
// Tier 1-3 signals + Competitive Density + Agency History + Deadline Urgency
// =============================================================
import { ProbabilityFeatures, ProbabilityResult } from '../types';
import { logger } from '../utils/logger';

// -------------------------------------------------------------
// Feature Weights (must sum to 1.0)
// Added: agencyHistoryScore (agency set-aside affinity) + deadlineUrgencyScore
// competitionDensityScore upgraded: now uses NAICS-normalized density ratio
// -------------------------------------------------------------
const WEIGHTS: Record<keyof ProbabilityFeatures, number> = {
  naicsOverlapScore:       0.24,  // Domain match — strongest predictor
  incumbentWeaknessScore:  0.19,  // Incumbent dominance inversion (text + USAspending)
  documentAlignmentScore:  0.16,  // SOW scope match from uploaded documents
  agencyAlignmentScore:    0.12,  // Agency SDVOSB/SB award rate for client type
  awardSizeFitScore:       0.09,  // Capacity fit
  competitionDensityScore: 0.08,  // Bidder count vs NAICS norm
  agencyHistoryScore:      0.07,  // Agency historical set-aside affinity (new)
  historicalDistribution:  0.03,  // USAspending base rate
  deadlineUrgencyScore:    0.02,  // Quality of proposal prep window (new)
};

// Verify weights sum to 1.0
const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`Probability weights do not sum to 1.0: ${weightSum}`);
}

function computeZScore(features: ProbabilityFeatures): number {
  let z = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const feature = features[key as keyof ProbabilityFeatures];
    z += weight * feature;
  }
  return z;
}

/**
 * Logistic (sigmoid) transformation.
 * Bias of -3.0 reflects competitive federal market baseline.
 * Scale of 6.0 provides adequate spread across feature ranges.
 */
function logisticTransform(z: number): number {
  const SCALE = 6.0;
  const BIAS = -3.0;
  return 1 / (1 + Math.exp(-(SCALE * z + BIAS)));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// -------------------------------------------------------------
// Feature Computation Functions
// -------------------------------------------------------------

export function computeNaicsOverlap(
  clientNaics: string[],
  opportunityNaics: string
): number {
  if (clientNaics.length === 0) return 0;
  if (clientNaics.includes(opportunityNaics)) return 1.0;

  const oppSector = opportunityNaics.substring(0, 4);
  if (clientNaics.some((n) => n.substring(0, 4) === oppSector)) return 0.6;

  const oppSubsector = opportunityNaics.substring(0, 2);
  if (clientNaics.some((n) => n.substring(0, 2) === oppSubsector)) return 0.3;

  return 0;
}

export function computeAwardSizeFit(
  estimatedValue: number | null,
  clientPastAwardMin = 100000,
  clientPastAwardMax = 10000000
): number {
  if (!estimatedValue) return 0.5;
  if (estimatedValue >= clientPastAwardMin && estimatedValue <= clientPastAwardMax) return 1.0;
  if (estimatedValue < clientPastAwardMin) return clamp((estimatedValue / clientPastAwardMin) * 0.8);
  return clamp((clientPastAwardMax / estimatedValue) * 0.7);
}

/**
 * Incumbent weakness score.
 * High incumbentProbability (dominant winner) = low score for new entrant.
 * Low incumbentProbability (fragmented market) = high score for new entrant.
 * No data = neutral 0.5
 */
export function computeIncumbentWeaknessScore(
  incumbentProbability: number | null,
  competitionCount: number | null
): number {
  if (incumbentProbability === null) return 0.5;

  // Invert: a dominant incumbent is bad for new entrants
  const dominanceScore = 1 - incumbentProbability;

  // Bonus for fragmented competition (more bidders = more chaos = more opportunity)
  let competitionBonus = 0;
  if (competitionCount !== null) {
    if (competitionCount >= 5) competitionBonus = 0.1;
    else if (competitionCount >= 3) competitionBonus = 0.05;
    else if (competitionCount <= 1) competitionBonus = -0.1; // Sole source risk
  }

  return clamp(dominanceScore + competitionBonus);
}

// -------------------------------------------------------------
// Core Probability Computation
// -------------------------------------------------------------

export function computeProbability(
  features: ProbabilityFeatures,
  estimatedValue: number | null
): ProbabilityResult {
  try {
    for (const [key, val] of Object.entries(features)) {
      if (val < 0 || val > 1) {
        logger.warn('Feature out of range, clamping', { feature: key, value: val });
        features[key as keyof ProbabilityFeatures] = clamp(val);
      }
    }

    const rawScore = computeZScore(features);
    const probability = logisticTransform(rawScore);
    const expectedValue = estimatedValue ? probability * estimatedValue : 0;

    return { features, rawScore, probability, expectedValue };
  } catch (err) {
    logger.error('Probability computation failed', { error: err });
    return { features, rawScore: 0, probability: 0, expectedValue: 0 };
  }
}

// -------------------------------------------------------------
// Full Opportunity-Client Scoring Entry Point
// -------------------------------------------------------------

/**
 * Deadline urgency: 0-1 representing quality of the proposal prep window.
 * Sweet spot is 2-6 weeks out. Too tight or too far = lower score.
 */
export function computeDeadlineUrgency(responseDeadline: Date): number {
  const daysUntil = Math.ceil((responseDeadline.getTime() - Date.now()) / 86400000);
  if (daysUntil < 0)   return 0.0;  // expired
  if (daysUntil < 5)   return 0.1;  // too tight — rushed proposal
  if (daysUntil < 14)  return 0.5;  // urgent but possible
  if (daysUntil < 42)  return 1.0;  // sweet spot: 2-6 weeks
  if (daysUntil < 90)  return 0.7;  // good lead time
  if (daysUntil < 180) return 0.5;  // neutral
  return 0.3;                        // very far — requirements may change
}

export function scoreOpportunityForClient(params: {
  opportunityNaics: string;
  opportunityEstimatedValue: number | null;
  opportunityAgency: string;
  clientNaics: string[];
  clientProfile: { sdvosb: boolean; wosb: boolean; hubzone: boolean; smallBusiness: boolean };
  // Tier 2: USAspending enrichment
  incumbentProbability?: number | null;
  competitionCount?: number | null;
  offersReceived?: number | null;
  agencyAlignmentScore?: number;
  historicalDistribution?: number;
  agencySdvosbRate?: number | null;
  // Tier 3: Document intelligence
  documentAlignmentScore?: number | null;
  // Tier 4: Advanced signals (from new engines)
  agencyHistoryScore?: number | null;
  deadlineUrgencyScore?: number | null;
  densityScore?: number | null;
}): ProbabilityResult {

  // Agency alignment: if SDVOSB and we know agency SDVOSB rate, use it
  let agencyScore = params.agencyAlignmentScore ?? 0.5;
  if (params.clientProfile.sdvosb && params.agencySdvosbRate != null) {
    agencyScore = clamp(0.3 + params.agencySdvosbRate * 2);
  }

  // Use offersReceived (actual bidders) over competitionCount when available
  const competitorCount = params.offersReceived ?? params.competitionCount ?? null;

  // Density score: use the NAICS-normalized value if available, else simple formula
  const densityScore = params.densityScore != null
    ? params.densityScore
    : competitorCount
      ? clamp(1 - (competitorCount / 20))
      : 0.5;

  const features: ProbabilityFeatures = {
    naicsOverlapScore:       computeNaicsOverlap(params.clientNaics, params.opportunityNaics),
    incumbentWeaknessScore:  computeIncumbentWeaknessScore(
                               params.incumbentProbability ?? null,
                               competitorCount
                             ),
    documentAlignmentScore:  params.documentAlignmentScore ?? 0.5,
    agencyAlignmentScore:    agencyScore,
    awardSizeFitScore:       computeAwardSizeFit(params.opportunityEstimatedValue),
    competitionDensityScore: densityScore,
    historicalDistribution:  params.historicalDistribution ?? 0.3,
    agencyHistoryScore:      params.agencyHistoryScore ?? 0.5,
    deadlineUrgencyScore:    params.deadlineUrgencyScore ?? 0.5,
  };

  return computeProbability(features, params.opportunityEstimatedValue);
}