"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoringQueue = exports.SCORING_QUEUE_NAME = void 0;
exports.startScoringWorker = startScoringWorker;
exports.enqueueAllOpportunitiesForScoring = enqueueAllOpportunitiesForScoring;
// =============================================================
// Scoring Worker — BullMQ
// Tier 1: Win probability scoring for all opportunities
// =============================================================
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const probabilityEngine_1 = require("../engines/probabilityEngine");
exports.SCORING_QUEUE_NAME = 'opportunity-scoring';
exports.scoringQueue = new bullmq_1.Queue(exports.SCORING_QUEUE_NAME, {
    connection: redis_1.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 50,
    },
});
function startScoringWorker() {
    const worker = new bullmq_1.Worker(exports.SCORING_QUEUE_NAME, async (job) => {
        const { opportunityId, consultingFirmId } = job.data;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id: opportunityId, consultingFirmId },
            select: {
                id: true,
                naicsCode: true,
                setAsideType: true,
                estimatedValue: true,
                agency: true,
                incumbentProbability: true,
                competitionCount: true,
                agencySdvosbRate: true,
                historicalAwardCount: true,
                documentIntelScore: true,
                isScored: true,
            },
        });
        if (!opportunity) {
            logger_1.logger.warn('Opportunity not found for scoring', { opportunityId });
            return;
        }
        const clients = await database_1.prisma.clientCompany.findMany({
            where: { consultingFirmId, isActive: true },
            select: {
                id: true,
                naicsCodes: true,
                sdvosb: true,
                wosb: true,
                hubzone: true,
                smallBusiness: true,
            },
        });
        if (clients.length === 0) {
            logger_1.logger.warn('No active clients for scoring', { consultingFirmId });
            return;
        }
        let bestProbability = 0;
        let bestExpectedValue = 0;
        for (const client of clients) {
            const result = (0, probabilityEngine_1.scoreOpportunityForClient)({
                opportunityNaics: opportunity.naicsCode,
                opportunitySetAside: opportunity.setAsideType,
                opportunityEstimatedValue: opportunity.estimatedValue,
                opportunityAgency: opportunity.agency,
                clientNaics: client.naicsCodes,
                clientProfile: {
                    sdvosb: client.sdvosb,
                    wosb: client.wosb,
                    hubzone: client.hubzone,
                    smallBusiness: client.smallBusiness,
                },
                // Tier 2 enrichment signals (null-safe)
                incumbentProbability: opportunity.incumbentProbability,
                competitionCount: opportunity.competitionCount,
                agencySdvosbRate: opportunity.agencySdvosbRate,
                historicalDistribution: opportunity.historicalAwardCount
                    ? Math.min(opportunity.historicalAwardCount / 1000, 0.8)
                    : 0.3,
                // Tier 3 document intelligence
                documentAlignmentScore: opportunity.documentIntelScore,
            });
            if (result.probability > bestProbability) {
                bestProbability = result.probability;
                bestExpectedValue = result.expectedValue;
            }
        }
        await database_1.prisma.opportunity.update({
            where: { id: opportunityId },
            data: {
                probabilityScore: bestProbability,
                expectedValue: bestExpectedValue,
                isScored: true,
            },
        });
        logger_1.logger.debug('Opportunity scored', {
            opportunityId,
            probability: bestProbability.toFixed(4),
        });
    }, {
        connection: redis_1.redis,
        concurrency: 10,
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error('Scoring job failed', { jobId: job?.id, error: err.message });
    });
    worker.on('error', (err) => {
        logger_1.logger.error('Scoring worker error', { error: err.message });
    });
    logger_1.logger.info('Scoring worker started');
    return worker;
}
/**
 * Enqueue all unscored opportunities for a firm.
 * Called after ingest and after enrichment completes.
 */
async function enqueueAllOpportunitiesForScoring(consultingFirmId) {
    const opportunities = await database_1.prisma.opportunity.findMany({
        where: { consultingFirmId, status: 'ACTIVE', isScored: false },
        select: { id: true },
        take: 500,
    });
    const jobs = opportunities.map((opp) => ({
        name: 'score-opportunity',
        data: { opportunityId: opp.id, consultingFirmId },
    }));
    if (jobs.length > 0) {
        await exports.scoringQueue.addBulk(jobs);
    }
    logger_1.logger.info('Scoring jobs enqueued', { consultingFirmId, count: opportunities.length });
    return opportunities.length;
}
//# sourceMappingURL=scoringWorker.js.map