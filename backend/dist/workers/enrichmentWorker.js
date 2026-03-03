"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichmentQueue = exports.ENRICHMENT_QUEUE_NAME = void 0;
exports.startEnrichmentWorker = startEnrichmentWorker;
exports.enqueueEnrichmentJobs = enqueueEnrichmentJobs;
// =============================================================
// Enrichment Worker — BullMQ
// Tier 2: USAspending award history enrichment
// =============================================================
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const usaSpending_1 = require("../services/usaSpending");
const probabilityEngine_1 = require("../engines/probabilityEngine");
exports.ENRICHMENT_QUEUE_NAME = 'opportunity-enrichment';
exports.enrichmentQueue = new bullmq_1.Queue(exports.ENRICHMENT_QUEUE_NAME, {
    connection: redis_1.redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});
function startEnrichmentWorker() {
    const worker = new bullmq_1.Worker(exports.ENRICHMENT_QUEUE_NAME, async (job) => {
        const { opportunityId, consultingFirmId } = job.data;
        logger_1.logger.info('Enrichment job started', { opportunityId, jobId: job.id });
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id: opportunityId, consultingFirmId },
            select: {
                id: true,
                naicsCode: true,
                setAsideType: true,
                estimatedValue: true,
                agency: true,
                title: true,
                description: true,
                isEnriched: true,
            },
        });
        if (!opportunity) {
            logger_1.logger.warn('Opportunity not found for enrichment', { opportunityId });
            return;
        }
        if (opportunity.isEnriched) {
            logger_1.logger.info('Opportunity already enriched - skipping', { opportunityId });
            return;
        }
        const enrichment = await usaSpending_1.usaSpendingService.enrichOpportunity({
            naicsCode: opportunity.naicsCode,
            agency: opportunity.agency,
        });
        const recompeteKeywords = ['recompete', 're-compete', 'option year', 'bridge', 're-solicitation', 'follow-on'];
        const titleLower = (opportunity.title + ' ' + (opportunity.description || '')).toLowerCase();
        const recompeteFlag = recompeteKeywords.some((kw) => titleLower.includes(kw));
        if (enrichment.awards.length > 0) {
            await database_1.prisma.awardHistory.createMany({
                data: enrichment.awards.slice(0, 50).map((award) => ({
                    opportunityId,
                    awardingAgency: opportunity.agency,
                    recipientName: award.recipientName,
                    recipientUei: award.recipientUei,
                    awardAmount: award.awardAmount,
                    awardDate: award.awardDate ? new Date(award.awardDate) : new Date(),
                    baseAndAllOptions: award.baseAndAllOptions,
                    naics: opportunity.naicsCode,
                    awardType: award.awardType,
                    contractNumber: award.contractNumber,
                })),
                skipDuplicates: true,
            });
        }
        await database_1.prisma.opportunity.update({
            where: { id: opportunityId },
            data: {
                isEnriched: true,
                historicalWinner: enrichment.historicalWinner,
                historicalAvgAward: enrichment.historicalAvgAward,
                historicalAwardCount: enrichment.historicalAwardCount,
                competitionCount: enrichment.competitionCount,
                incumbentProbability: enrichment.incumbentProbability,
                agencySmallBizRate: enrichment.agencySmallBizRate,
                agencySdvosbRate: enrichment.agencySdvosbRate,
                recompeteFlag,
                isScored: false,
            },
        });
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
                incumbentProbability: enrichment.incumbentProbability,
                competitionCount: enrichment.competitionCount,
                agencySdvosbRate: enrichment.agencySdvosbRate,
                historicalDistribution: enrichment.historicalAwardCount > 0
                    ? Math.min(enrichment.historicalAwardCount / 1000, 0.8)
                    : 0.3,
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
        logger_1.logger.info('Enrichment job complete', {
            opportunityId,
            historicalWinner: enrichment.historicalWinner,
            competitionCount: enrichment.competitionCount,
            incumbentProbability: enrichment.incumbentProbability.toFixed(3),
            newProbability: bestProbability.toFixed(4),
        });
    }, {
        connection: redis_1.redis,
        concurrency: 3,
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error('Enrichment job failed', { jobId: job?.id, error: err.message });
    });
    worker.on('error', (err) => {
        logger_1.logger.error('Enrichment worker error', { error: err.message });
    });
    logger_1.logger.info('Enrichment worker started');
    return worker;
}
async function enqueueEnrichmentJobs(consultingFirmId, jobRecordId) {
    const opportunities = await database_1.prisma.opportunity.findMany({
        where: { consultingFirmId, status: 'ACTIVE', isEnriched: false },
        select: { id: true },
        take: 500,
    });
    const jobs = opportunities.map((opp) => ({
        name: 'enrich-opportunity',
        data: { opportunityId: opp.id, consultingFirmId, jobRecordId },
    }));
    if (jobs.length > 0) {
        await exports.enrichmentQueue.addBulk(jobs);
    }
    logger_1.logger.info('Enrichment jobs enqueued', { consultingFirmId, count: opportunities.length });
    return opportunities.length;
}
//# sourceMappingURL=enrichmentWorker.js.map