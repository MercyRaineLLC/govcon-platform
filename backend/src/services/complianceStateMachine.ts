// =============================================================
// Compliance State Machine
// Enforces valid status transitions and writes an audit log.
// =============================================================
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export type ComplianceStatus = 'PENDING' | 'APPROVED' | 'BLOCKED' | 'REJECTED';
export type EntityType = 'SUBMISSION' | 'BID_DECISION';

// Valid transitions: what states can each status move to?
const ALLOWED_TRANSITIONS: Record<ComplianceStatus, ComplianceStatus[]> = {
  PENDING:  ['APPROVED', 'BLOCKED', 'REJECTED'],
  APPROVED: ['BLOCKED'],
  BLOCKED:  ['APPROVED'],
  REJECTED: [],  // terminal
};

export function isValidTransition(from: ComplianceStatus, to: ComplianceStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  success: boolean;
  error?: string;
}

/**
 * Transition a SubmissionRecord's compliance status.
 * Validates the transition, applies it, and writes an audit log entry.
 */
export async function transitionSubmissionStatus(params: {
  submissionId: string;
  toStatus: ComplianceStatus;
  consultingFirmId: string;
  triggeredBy?: string;
  reason?: string;
}): Promise<TransitionResult> {
  const submission = await prisma.submissionRecord.findFirst({
    where: { id: params.submissionId, consultingFirmId: params.consultingFirmId },
    select: { id: true, status: true },
  });

  if (!submission) {
    return { success: false, error: 'Submission not found' };
  }

  const fromStatus = (submission.status ?? 'PENDING') as ComplianceStatus;

  if (!isValidTransition(fromStatus, params.toStatus)) {
    return {
      success: false,
      error: `Invalid transition: ${fromStatus} → ${params.toStatus}`,
    };
  }

  await prisma.$transaction([
    prisma.submissionRecord.update({
      where: { id: params.submissionId },
      data: { status: params.toStatus },
    }),
    prisma.complianceLog.create({
      data: {
        consultingFirmId: params.consultingFirmId,
        entityType: 'SUBMISSION',
        entityId: params.submissionId,
        fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
        triggeredBy: params.triggeredBy,
      },
    }),
  ]);

  logger.info('Compliance status transitioned', {
    entityType: 'SUBMISSION',
    entityId: params.submissionId,
    fromStatus,
    toStatus: params.toStatus,
  });

  return { success: true };
}

/**
 * Transition a BidDecision's compliance status.
 * Validates the transition, applies it, and writes an audit log entry.
 */
export async function transitionBidDecisionStatus(params: {
  decisionId: string;
  toStatus: ComplianceStatus;
  consultingFirmId: string;
  triggeredBy?: string;
  reason?: string;
}): Promise<TransitionResult> {
  const decision = await prisma.bidDecision.findFirst({
    where: { id: params.decisionId, consultingFirmId: params.consultingFirmId },
    select: { id: true, complianceStatus: true },
  });

  if (!decision) {
    return { success: false, error: 'BidDecision not found' };
  }

  const fromStatus = (decision.complianceStatus ?? 'PENDING') as ComplianceStatus;

  if (!isValidTransition(fromStatus, params.toStatus)) {
    return {
      success: false,
      error: `Invalid transition: ${fromStatus} → ${params.toStatus}`,
    };
  }

  await prisma.$transaction([
    prisma.bidDecision.update({
      where: { id: params.decisionId },
      data: { complianceStatus: params.toStatus },
    }),
    prisma.complianceLog.create({
      data: {
        consultingFirmId: params.consultingFirmId,
        entityType: 'BID_DECISION',
        entityId: params.decisionId,
        fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
        triggeredBy: params.triggeredBy,
      },
    }),
  ]);

  logger.info('Compliance status transitioned', {
    entityType: 'BID_DECISION',
    entityId: params.decisionId,
    fromStatus,
    toStatus: params.toStatus,
  });

  return { success: true };
}

/**
 * Gate check: returns true if a submission for this client+opportunity
 * should be blocked based on the active BidDecision compliance state.
 */
export async function isSubmissionBlocked(
  opportunityId: string,
  clientCompanyId: string
): Promise<{ blocked: boolean; reason?: string }> {
  const decision = await prisma.bidDecision.findUnique({
    where: { opportunityId_clientCompanyId: { opportunityId, clientCompanyId } },
    select: { complianceStatus: true, rationale: true },
  });

  if (!decision) return { blocked: false };

  if (decision.complianceStatus === 'BLOCKED') {
    return {
      blocked: true,
      reason: decision.rationale ?? 'Bid decision is blocked by compliance review',
    };
  }

  return { blocked: false };
}
