"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateBidDecision = evaluateBidDecision;
const database_1 = require("../config/database");
async function evaluateBidDecision(opportunityId, clientCompanyId) {
    const opportunity = await database_1.prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: {
            pscCodes: {
                include: { psc: true }
            }
        }
    });
    const client = await database_1.prisma.clientCompany.findUnique({
        where: { id: clientCompanyId },
        include: { performanceStats: true }
    });
    if (!opportunity || !client) {
        throw new Error('Invalid opportunity or client');
    }
    // ------------------------------------------------------------
    // 1. Compliance Checks
    // ------------------------------------------------------------
    let complianceStatus = 'PASS';
    let riskScore = 0;
    const triggeredFlags = [];
    const requiredActions = [];
    const naicsMatch = client.naicsCodes.includes(opportunity.naicsCode);
    if (!naicsMatch) {
        complianceStatus = 'FAIL';
        triggeredFlags.push('NAICS code mismatch');
    }
    if (opportunity.setAsideType === 'SDVOSB' && !client.sdvosb) {
        complianceStatus = 'FAIL';
        triggeredFlags.push('SDVOSB set-aside but client not SDVOSB');
    }
    if (opportunity.setAsideType === 'WOSB' && !client.wosb) {
        complianceStatus = 'FAIL';
        triggeredFlags.push('WOSB set-aside but client not WOSB');
    }
    if (opportunity.setAsideType === 'HUBZONE' && !client.hubzone) {
        complianceStatus = 'FAIL';
        triggeredFlags.push('HUBZone set-aside but client not HUBZone');
    }
    const daysToDeadline = (new Date(opportunity.responseDeadline).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
    if (daysToDeadline < 7) {
        riskScore += 25;
        triggeredFlags.push('High time compression risk (<7 days)');
    }
    else if (daysToDeadline < 20) {
        riskScore += 10;
        triggeredFlags.push('Moderate time compression risk (<20 days)');
    }
    // ------------------------------------------------------------
    // 2. PSC Matching
    // ------------------------------------------------------------
    const opportunityPscCodes = opportunity.pscCodes.map((link) => link.psc.code);
    const pscMatch = client.preferredPscCodes?.some(code => opportunityPscCodes.includes(code)) ?? false;
    if (pscMatch) {
        triggeredFlags.push('PSC alignment match');
    }
    // ------------------------------------------------------------
    // 3. PSC Density Modeling (NEW)
    // ------------------------------------------------------------
    let densityPenalty = 0;
    if (opportunityPscCodes.length > 0) {
        const activeCount = await database_1.prisma.opportunityPSC.count({
            where: {
                psc: {
                    code: { in: opportunityPscCodes }
                },
                opportunity: {
                    status: 'ACTIVE'
                }
            }
        });
        if (activeCount > 15) {
            densityPenalty = 0.08;
            riskScore += 10;
            triggeredFlags.push('High PSC density in active pipeline');
        }
        else if (activeCount > 8) {
            densityPenalty = 0.04;
            riskScore += 5;
            triggeredFlags.push('Moderate PSC density in active pipeline');
        }
    }
    // ------------------------------------------------------------
    // 4. Base Win Probability Model
    // ------------------------------------------------------------
    const baseScore = 0.25;
    const naicsScore = naicsMatch ? 0.2 : 0;
    const pscScore = pscMatch ? 0.15 : 0;
    const setAsideScore = opportunity.setAsideType !== 'NONE' ? 0.15 : 0.05;
    const timeScore = daysToDeadline > 20 ? 0.15 : 0.05;
    const marketScore = 0.1;
    let winProbability = Math.min(baseScore +
        naicsScore +
        pscScore +
        setAsideScore +
        timeScore +
        marketScore -
        densityPenalty, 0.9);
    // ------------------------------------------------------------
    // 5. Performance Weighting
    // ------------------------------------------------------------
    const stats = client.performanceStats;
    if (stats && stats.totalSubmissions > 0) {
        const completionFactor = stats.completionRate || 0;
        const lateRatio = stats.totalSubmissions > 0
            ? stats.submissionsLate / stats.totalSubmissions
            : 0;
        const penaltyFactor = stats.totalPenalties > 0
            ? Math.min(stats.totalPenalties / 100000, 0.2)
            : 0;
        const experienceBoost = Math.min(stats.totalSubmissions / 50, 0.15);
        const performanceIndex = (completionFactor * 0.5) +
            ((1 - lateRatio) * 0.3) +
            experienceBoost -
            penaltyFactor;
        const multiplier = Math.min(Math.max(0.6 + performanceIndex, 0.6), 1.15);
        winProbability = Math.min(winProbability * multiplier, 0.95);
        triggeredFlags.push('Performance-weighted scoring applied');
    }
    // ------------------------------------------------------------
    // 6. Financial Modeling
    // ------------------------------------------------------------
    const estimatedValue = opportunity.estimatedValue ?? 100000;
    const proposalCostEstimate = estimatedValue * 0.05;
    const expectedValue = winProbability * estimatedValue;
    const netExpectedValue = expectedValue - proposalCostEstimate;
    const roiRatio = netExpectedValue / proposalCostEstimate;
    // ------------------------------------------------------------
    // 7. Recommendation Logic
    // ------------------------------------------------------------
    let recommendation = 'NO_BID';
    if (complianceStatus === 'FAIL') {
        recommendation = 'NO_BID';
    }
    else if (roiRatio > 3 && winProbability > 0.4) {
        recommendation = 'BID_PRIME';
    }
    else if (winProbability > 0.25) {
        recommendation = 'BID_SUB';
    }
    // ------------------------------------------------------------
    // 8. Persist Decision
    // ------------------------------------------------------------
    const decision = await database_1.prisma.bidDecision.upsert({
        where: {
            opportunityId_clientCompanyId: {
                opportunityId,
                clientCompanyId
            }
        },
        update: {
            winProbability,
            expectedRevenue: estimatedValue,
            proposalCostEstimate,
            expectedValue,
            netExpectedValue,
            roiRatio,
            complianceStatus,
            riskScore,
            recommendation,
            explanationJson: {
                triggeredFlags,
                requiredActions,
                daysToDeadline,
                naicsMatch,
                pscMatch
            }
        },
        create: {
            opportunityId,
            clientCompanyId,
            winProbability,
            expectedRevenue: estimatedValue,
            proposalCostEstimate,
            expectedValue,
            netExpectedValue,
            roiRatio,
            complianceStatus,
            riskScore,
            recommendation,
            explanationJson: {
                triggeredFlags,
                requiredActions,
                daysToDeadline,
                naicsMatch,
                pscMatch
            }
        }
    });
    return decision;
}
//# sourceMappingURL=decisionEngine.js.map