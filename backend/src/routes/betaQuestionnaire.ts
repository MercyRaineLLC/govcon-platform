// =============================================================
// /api/beta/questionnaire — current week's questionnaire +
// per-user response endpoint. Login is gated by the same logic
// (in auth.ts), so this is also where the gated user lands to
// satisfy the requirement.
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { authenticateJWT, generateToken } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { rejectScopedToken } from '../middleware/rejectScopedToken'
import { AuthenticatedRequest } from '../types'
import { logAudit } from '../services/auditService'
import { ensureCurrentQuestionnaire } from '../workers/betaQuestionnaireWorker'

const router = Router()

// All endpoints below this line require a JWT — but the /complete
// endpoint accepts both full and scoped (beta_questionnaire) tokens.
// rejectScopedToken is applied per-endpoint instead of router-wide
// because /complete is intentionally reachable with a scoped token.
router.use(authenticateJWT)
router.use(enforceTenantScope)

/**
 * GET /api/beta/questionnaire/current
 * Returns the active questionnaire for the current ISO week, plus
 * a flag indicating whether THIS user has already responded.
 */
router.get('/current', rejectScopedToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // ensureCurrentQuestionnaire is the same idempotent helper the worker
    // uses — covers the case where the worker hasn't fired yet this week
    // (e.g., droplet was down at 13:00 UTC Monday).
    const q = await ensureCurrentQuestionnaire()
    const userId = req.user!.userId
    const responded = await prisma.betaQuestionnaireResponse.findUnique({
      where: { questionnaireId_userId: { questionnaireId: q.id, userId } },
      select: { id: true, submittedAt: true },
    })

    res.json({
      success: true,
      data: {
        id: q.id,
        weekStarting: q.weekStarting,
        title: q.title,
        questions: q.questionsJson,
        responded: Boolean(responded),
        respondedAt: responded?.submittedAt ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/beta/questionnaire/respond
 * Body: { questionnaireId, answers: { questionId: answer } }
 * Records the response and (effectively) lifts the login gate for this week.
 */
const RespondSchema = z.object({
  questionnaireId: z.string().min(1),
  answers: z.record(z.any()),
})

router.post('/respond', rejectScopedToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { questionnaireId, answers } = RespondSchema.parse(req.body)
    const userId = req.user!.userId
    const consultingFirmId = getTenantId(req)

    const q = await prisma.betaWeeklyQuestionnaire.findUnique({
      where: { id: questionnaireId },
      select: { id: true, isActive: true, questionsJson: true, weekStarting: true },
    })
    if (!q || !q.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Questionnaire not found or no longer active.',
        code: 'QUESTIONNAIRE_INACTIVE',
      })
    }

    // Validate required questions are answered.
    const questions = Array.isArray(q.questionsJson) ? (q.questionsJson as any[]) : []
    const missing: string[] = []
    for (const question of questions) {
      if (question.required && (answers[question.id] === undefined || answers[question.id] === null || answers[question.id] === '')) {
        missing.push(question.id)
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Required questions are missing answers.',
        code: 'MISSING_REQUIRED_ANSWERS',
        missingQuestionIds: missing,
      })
    }

    const ip = req.ip ?? null
    const userAgent = req.get('user-agent') ?? null

    // Upsert: a user can only respond once per questionnaire.
    const response = await prisma.betaQuestionnaireResponse.upsert({
      where: { questionnaireId_userId: { questionnaireId, userId } },
      create: {
        questionnaireId,
        userId,
        consultingFirmId,
        answersJson: answers,
        ip,
        userAgent,
      },
      update: {
        answersJson: answers,
        submittedAt: new Date(),
        ip,
        userAgent,
      },
    })

    void logAudit({
      consultingFirmId,
      actorUserId: userId,
      action: 'CREATE',
      entityType: 'BetaQuestionnaireResponse',
      entityId: response.id,
      rationale: `Submitted weekly questionnaire for week of ${q.weekStarting.toISOString().slice(0, 10)}`,
      sourceIp: ip,
      userAgent,
    })

    res.json({ success: true, data: { id: response.id, submittedAt: response.submittedAt } })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/beta/questionnaire/responses
 * Admin-only — list responses across the firm for the current week.
 */
router.get('/responses', rejectScopedToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin only', code: 'FORBIDDEN' })
    }
    const consultingFirmId = getTenantId(req)
    const weekParam = req.query.week as string | undefined
    const weekStarting = weekParam ? new Date(weekParam) : undefined

    const q = weekStarting
      ? await prisma.betaWeeklyQuestionnaire.findUnique({ where: { weekStarting } })
      : await ensureCurrentQuestionnaire()

    if (!q) {
      return res.json({ success: true, data: { questionnaire: null, responses: [] } })
    }

    const responses = await prisma.betaQuestionnaireResponse.findMany({
      where: { questionnaireId: q.id, consultingFirmId },
      orderBy: { submittedAt: 'desc' },
    })

    res.json({ success: true, data: { questionnaire: q, responses } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/beta/questionnaire/complete
 * Accepts EITHER a full session JWT OR a scoped completionToken
 * issued by login gate-3. On success: records the response and returns
 * a full session JWT so the user lands signed-in.
 *
 * This is the only endpoint a scoped token can reach.
 */
const CompleteSchema = z.object({
  questionnaireId: z.string().min(1),
  answers: z.record(z.any()),
})

router.post('/complete', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { questionnaireId, answers } = CompleteSchema.parse(req.body)
    const userId = req.user!.userId
    const consultingFirmId = req.user!.consultingFirmId
    const role = req.user!.role
    const email = req.user!.email

    const q = await prisma.betaWeeklyQuestionnaire.findUnique({
      where: { id: questionnaireId },
      select: { id: true, isActive: true, questionsJson: true, weekStarting: true },
    })
    if (!q || !q.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Questionnaire not found or no longer active.',
        code: 'QUESTIONNAIRE_INACTIVE',
      })
    }

    const questions = Array.isArray(q.questionsJson) ? (q.questionsJson as any[]) : []
    const missing: string[] = []
    for (const question of questions) {
      if (question.required && (answers[question.id] === undefined || answers[question.id] === null || answers[question.id] === '')) {
        missing.push(question.id)
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Required questions are missing answers.',
        code: 'MISSING_REQUIRED_ANSWERS',
        missingQuestionIds: missing,
      })
    }

    const ip = req.ip ?? null
    const userAgent = req.get('user-agent') ?? null

    const response = await prisma.betaQuestionnaireResponse.upsert({
      where: { questionnaireId_userId: { questionnaireId, userId } },
      create: {
        questionnaireId,
        userId,
        consultingFirmId,
        answersJson: answers,
        ip,
        userAgent,
      },
      update: {
        answersJson: answers,
        submittedAt: new Date(),
        ip,
        userAgent,
      },
    })

    void logAudit({
      consultingFirmId,
      actorUserId: userId,
      action: 'CREATE',
      entityType: 'BetaQuestionnaireResponse',
      entityId: response.id,
      rationale: `Submitted weekly questionnaire (gate-3 completion) for week of ${q.weekStarting.toISOString().slice(0, 10)}`,
      sourceIp: ip,
      userAgent,
    })

    // Issue a full (non-scoped) session JWT now that gate-3 passes.
    // gates 1+2 were already validated at login time before the scoped
    // token was issued; replaying them here would be redundant.
    const fullToken = generateToken({ userId, consultingFirmId, role: role as any, email })

    res.json({
      success: true,
      data: {
        token: fullToken,
        submittedAt: response.submittedAt,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
