// =============================================================
// Audit Service — first-class audit trail for every material
// action: mutations, AI inferences, decisions, exports, approvals.
// Replaces the thin ComplianceLog status-transition log.
//
// Writes are non-blocking (fire-and-forget) so audit pressure
// never slows the request path. Failures are logged, not thrown.
// =============================================================
import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACCESS'
  | 'LLM_INFERENCE'
  | 'DECISION_OVERRIDE'
  | 'EXPORT'
  | 'APPROVAL'
  | 'REJECTION'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EMAIL_VERIFIED'
  | 'AGREEMENT_ACCEPTED'

export interface AuditLogInput {
  consultingFirmId: string
  actorUserId?: string | null
  actorRole?: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  rationale?: string | null
  before?: unknown
  after?: unknown
  // FAR-grounded inference fields
  farContextHash?: string | null
  farClausesReferenced?: string[]
  llmProvider?: string | null
  llmModel?: string | null
  llmTask?: string | null
  promptHash?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  estimatedCostUsd?: number | null
  // Request context
  sourceIp?: string | null
  userAgent?: string | null
  requestId?: string | null
}

/**
 * Write an audit event. Non-blocking — caller does not await unless they
 * specifically want the write to complete before continuing.
 */
export function logAudit(input: AuditLogInput): Promise<void> {
  return prisma.auditEvent
    .create({
      data: {
        consultingFirmId: input.consultingFirmId,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        rationale: input.rationale ?? null,
        beforeJson: input.before === undefined ? undefined : (input.before as object),
        afterJson: input.after === undefined ? undefined : (input.after as object),
        farContextHash: input.farContextHash ?? null,
        farClausesReferenced: input.farClausesReferenced ?? [],
        llmProvider: input.llmProvider ?? null,
        llmModel: input.llmModel ?? null,
        llmTask: input.llmTask ?? null,
        promptHash: input.promptHash ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        sourceIp: input.sourceIp ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    })
    .then(() => undefined)
    .catch((err) => {
      logger.warn('Failed to write audit event', {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        error: (err as Error).message,
      })
    })
}

/**
 * Convenience helper: log an LLM inference. Wired by farGroundedComplete
 * so every grounded inference becomes a replayable audit row.
 */
export function logLlmInference(args: {
  consultingFirmId: string
  actorUserId?: string | null
  llmProvider: string
  llmModel: string
  llmTask: string
  promptHash: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  farContextHash: string
  farClausesReferenced: string[]
  entityType?: string
  entityId?: string | null
}): Promise<void> {
  return logAudit({
    consultingFirmId: args.consultingFirmId,
    actorUserId: args.actorUserId,
    action: 'LLM_INFERENCE',
    entityType: args.entityType ?? 'AiInference',
    entityId: args.entityId ?? null,
    farContextHash: args.farContextHash,
    farClausesReferenced: args.farClausesReferenced,
    llmProvider: args.llmProvider,
    llmModel: args.llmModel,
    llmTask: args.llmTask,
    promptHash: args.promptHash,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    estimatedCostUsd: args.estimatedCostUsd,
  })
}
