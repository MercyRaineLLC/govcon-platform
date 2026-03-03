"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNaicsOverlap = computeNaicsOverlap;
exports.computeSetAsideAlignment = computeSetAsideAlignment;
exports.computeAwardSizeFit = computeAwardSizeFit;
exports.computeIncumbentWeaknessScore = computeIncumbentWeaknessScore;
exports.computeProbability = computeProbability;
exports.scoreOpportunityForClient = scoreOpportunityForClient;
const logger_1 = require("../utils/logger");
// -------------------------------------------------------------
// Feature Weights (must sum to 1.0)
// Calibrated for federal contracting competitive dynamics
// -------------------------------------------------------------
const WEIGHTS = {
    naicsOverlapScore: 0.22, // Domain match — strong predictor
    setAsideAlignmentScore: 0.20, // Qualification gate — binary high impact
    incumbentWeaknessScore: 0.18, // Incumbent dominance inversion
    documentAlignmentScore: 0.15, // SOW scope match from uploaded documents
    agencyAlignmentScore: 0.12, // Historical agency relationship
    awardSizeFitScore: 0.08, // Capacity fit
    competitionDensityScore: 0.03, // Market crowding
    historicalDistribution: 0.02, // USAspending base rate
};
// Verify weights sum to 1.0
const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(`Probability weights do not sum to 1.0: ${weightSum}`);
}
function computeZScore(features) {
    let z = 0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
        const feature = features[key];
        z += weight * feature;
    }
    return z;
}
/**
 * Logistic (sigmoid) transformation.
 * Bias of -3.0 reflects competitive federal market baseline.
 * Scale of 6.0 provides adequate spread across feature ranges.
 */
function logisticTransform(z) {
    const SCALE = 6.0;
    const BIAS = -3.0;
    return 1 / (1 + Math.exp(-(SCALE * z + BIAS)));
}
function clamp(value) {
    return Math.max(0, Math.min(1, value));
}
// -------------------------------------------------------------
// Feature Computation Functions
// -------------------------------------------------------------
function computeNaicsOverlap(clientNaics, opportunityNaics) {
    if (clientNaics.length === 0)
        return 0;
    if (clientNaics.includes(opportunityNaics))
        return 1.0;
    const oppSector = opportunityNaics.substring(0, 4);
    if (clientNaics.some((n) => n.substring(0, 4) === oppSector))
        return 0.6;
    const oppSubsector = opportunityNaics.substring(0, 2);
    if (clientNaics.some((n) => n.substring(0, 2) === oppSubsector))
        return 0.3;
    return 0;
}
function computeSetAsideAlignment(clientProfile, setAsideType) {
    switch (setAsideType) {
        case 'SDVOSB': return clientProfile.sdvosb ? 1.0 : 0.0;
        case 'WOSB': return clientProfile.wosb ? 1.0 : 0.0;
        case 'HUBZONE': return clientProfile.hubzone ? 1.0 : 0.0;
        case 'SMALL_BUSINESS':
        case 'TOTAL_SMALL_BUSINESS': return clientProfile.smallBusiness ? 1.0 : 0.0;
        case 'SBA_8A': return 0.0;
        case 'NONE': return 0.7;
        default: return 0.5;
    }
}
function computeAwardSizeFit(estimatedValue, clientPastAwardMin = 100000, clientPastAwardMax = 10000000) {
    if (!estimatedValue)
        return 0.5;
    if (estimatedValue >= clientPastAwardMin && estimatedValue <= clientPastAwardMax)
        return 1.0;
    if (estimatedValue < clientPastAwardMin)
        return clamp((estimatedValue / clientPastAwardMin) * 0.8);
    return clamp((clientPastAwardMax / estimatedValue) * 0.7);
}
/**
 * Incumbent weakness score.
 * High incumbentProbability (dominant winner) = low score for new entrant.
 * Low incumbentProbability (fragmented market) = high score for new entrant.
 * No data = neutral 0.5
 */
function computeIncumbentWeaknessScore(incumbentProbability, competitionCount) {
    if (incumbentProbability === null)
        return 0.5;
    // Invert: a dominant incumbent is bad for new entrants
    const dominanceScore = 1 - incumbentProbability;
    // Bonus for fragmented competition (more bidders = more chaos = more opportunity)
    let competitionBonus = 0;
    if (competitionCount !== null) {
        if (competitionCount >= 5)
            competitionBonus = 0.1;
        else if (competitionCount >= 3)
            competitionBonus = 0.05;
        else if (competitionCount <= 1)
            competitionBonus = -0.1; // Sole source risk
    }
    return clamp(dominanceScore + competitionBonus);
}
// -------------------------------------------------------------
// Core Probability Computation
// -------------------------------------------------------------
function computeProbability(features, estimatedValue) {
    try {
        for (const [key, val] of Object.entries(features)) {
            if (val < 0 || val > 1) {
                logger_1.logger.warn('Feature out of range, clamping', { feature: key, value: val });
                features[key] = clamp(val);
            }
        }
        const rawScore = computeZScore(features);
        const probability = logisticTransform(rawScore);
        const expectedValue = estimatedValue ? probability * estimatedValue : 0;
        return { features, rawScore, probability, expectedValue };
    }
    catch (err) {
        logger_1.logger.error('Probability computation failed', { error: err });
        return { features, rawScore: 0, probability: 0, expectedValue: 0 };
    }
}
// -------------------------------------------------------------
// Full Opportunity-Client Scoring Entry Point
// -------------------------------------------------------------
function scoreOpportunityForClient(params) {
    // Agency alignment: if SDVOSB and we know agency SDVOSB rate, use it
    let agencyScore = params.agencyAlignmentScore ?? 0.5;
    if (params.clientProfile.sdvosb && params.agencySdvosbRate != null) {
        agencyScore = clamp(0.3 + params.agencySdvosbRate * 2);
    }
    const features = {
        naicsOverlapScore: computeNaicsOverlap(params.clientNaics, params.opportunityNaics),
        setAsideAlignmentScore: computeSetAsideAlignment(params.clientProfile, params.opportunitySetAside),
        incumbentWeaknessScore: computeIncumbentWeaknessScore(params.incumbentProbability ?? null, params.competitionCount ?? null),
        documentAlignmentScore: params.documentAlignmentScore ?? 0.5,
        agencyAlignmentScore: agencyScore,
        awardSizeFitScore: computeAwardSizeFit(params.opportunityEstimatedValue),
        competitionDensityScore: params.competitionCount
            ? clamp(1 - (params.competitionCount / 20))
            : 0.5,
        historicalDistribution: params.historicalDistribution ?? 0.3,
    };
    return computeProbability(features, params.opportunityEstimatedValue);
}
//# sourceMappingURL=probabilityEngine.js.map