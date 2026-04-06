// =============================================================
// Scoring Worker — BullMQ
// Tier 1: Win probability scoring for all opportunities
// =============================================================
import { Worker, Queue, Job } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { scoreOpportunityForClient, computeDeadlineUrgency } from '../engines/probabilityEngine';
import { detectIncumbent } from '../engines/incumbentDetector';
import { getDensityScore } from '../engines/competitiveDensity';
import { getAgencyHistoryScore } from '../engines/agencyProfiler';

export const SCORING_QUEUE_NAME = 'opportunity-scoring';

export interface ScoringJobData {
  opportunityId: string;
  consultingFirmId: string;
}

export const scoringQueue = new Queue<ScoringJobData>(SCORING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 50,
  },
});

export function startScoringWorker(): Worker<ScoringJobData> {
  const worker = new Worker<ScoringJobData>(
    SCORING_QUEUE_NAME,
    async (job: Job<ScoringJobData>) => {
      const { opportunityId, consultingFirmId } = job.data;

      const opportunity = await prisma.opportunity.findFirst({
        where: { id: opportunityId, consultingFirmId },
        select: {
          id: true,
          naicsCode: true,
          estimatedValue: true,
          agency: true,
          incumbentProbability: true,
          incumbentSignalDetected: true,
          competitionCount: true,
          offersReceived: true,
          agencySdvosbRate: true,
          historicalAwardCount: true,
          documentIntelScore: true,
          responseDeadline: true,
          title: true,
          description: true,
          isScored: true,
        },
      });

      if (!opportunity) {
        logger.warn('Opportunity not found for scoring', { opportunityId });
        return;
      }

      const clients = await prisma.clientCompany.findMany({
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
        logger.warn('No active clients for scoring', { consultingFirmId });
        return;
      }

      // ── Incumbent detection from text (when USAspending data absent) ──
      let incumbentProb = opportunity.incumbentProbability;
      let incumbentDetected = opportunity.incumbentSignalDetected;
      if (incumbentProb === null) {
        const textForDetection = `${opportunity.title} ${opportunity.description ?? ''}`;
        const incResult = detectIncumbent(textForDetection);
        if (incResult.detected) {
          incumbentProb = incResult.inferredProbability;
          incumbentDetected = true;
        }
      }

      // ── Competitive density (NAICS-normalized bidder count) ──────────
      const densityResult = await getDensityScore(
        opportunity.naicsCode,
        opportunity.offersReceived ?? opportunity.competitionCount ?? null
      );

      // ── Deadline urgency ──────────────────────────────────────────────
      const deadlineUrgency = computeDeadlineUrgency(opportunity.responseDeadline);

      let bestProbability = 0;
      let bestExpectedValue = 0;

      for (const client of clients) {
        // ── Agency history score per client type ────────────────────────
        const agencyHistScore = await getAgencyHistoryScore(opportunity.agency, {
          sdvosb: client.sdvosb,
          wosb: client.wosb,
          hubzone: client.hubzone,
          smallBusiness: client.smallBusiness,
        });

        const result = scoreOpportunityForClient({
          opportunityNaics: opportunity.naicsCode,
          opportunityEstimatedValue: opportunity.estimatedValue ? Number(opportunity.estimatedValue) : null,
          opportunityAgency: opportunity.agency,
          clientNaics: client.naicsCodes,
          clientProfile: {
            sdvosb: client.sdvosb,
            wosb: client.wosb,
            hubzone: client.hubzone,
            smallBusiness: client.smallBusiness,
          },
          incumbentProbability: incumbentProb,
          competitionCount: opportunity.competitionCount,
          offersReceived: opportunity.offersReceived,
          agencySdvosbRate: opportunity.agencySdvosbRate,
          historicalDistribution: opportunity.historicalAwardCount
            ? Math.min(opportunity.historicalAwardCount / 1000, 0.8)
            : 0.3,
          documentAlignmentScore: opportunity.documentIntelScore,
          agencyHistoryScore: agencyHistScore,
          deadlineUrgencyScore: deadlineUrgency,
          densityScore: densityResult.score,
        });

        if (result.probability > bestProbability) {
          bestProbability = result.probability;
          bestExpectedValue = result.expectedValue;
        }
      }

      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: {
          probabilityScore: bestProbability,
          expectedValue: bestExpectedValue,
          isScored: true,
          deadlineUrgencyScore: deadlineUrgency,
          densityRatio: densityResult.densityRatio,
          ...(incumbentProb !== opportunity.incumbentProbability ? {
            incumbentProbability: incumbentProb,
            incumbentSignalDetected: incumbentDetected,
          } : {}),
        },
      });

      logger.debug('Opportunity scored', {
        opportunityId,
        probability: bestProbability.toFixed(4),
      });
    },
    {
      connection: redis,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Scoring job failed', { jobId: job?.id, error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Scoring worker error', { error: err.message });
  });

  logger.info('Scoring worker started');
  return worker;
}

/**
 * Enqueue all unscored opportunities for a firm.
 * Called after ingest and after enrichment completes.
 * Skips silently if no active clients exist — scoring requires client profiles.
 */
export async function enqueueAllOpportunitiesForScoring(
  consultingFirmId: string
): Promise<number> {
  // Check for clients first — no point queuing thousands of jobs that will each
  // hit the "No active clients" early-exit path and flood the logs.
  const clientCount = await prisma.clientCompany.count({
    where: { consultingFirmId, isActive: true },
  });

  if (clientCount === 0) {
    logger.info('Scoring skipped — no active clients yet', { consultingFirmId });
    return 0;
  }

  const opportunities = await prisma.opportunity.findMany({
    where: { consultingFirmId, status: 'ACTIVE', isScored: false },
    select: { id: true },
    take: 500,
  });

  const jobs = opportunities.map((opp) => ({
    name: 'score-opportunity',
    data: { opportunityId: opp.id, consultingFirmId },
  }));

  if (jobs.length > 0) {
    await scoringQueue.addBulk(jobs);
  }

  logger.info('Scoring jobs enqueued', { consultingFirmId, count: opportunities.length });
  return opportunities.length;
}