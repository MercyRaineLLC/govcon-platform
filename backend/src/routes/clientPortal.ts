import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs'
import { prisma } from '../config/database'
import { config } from '../config/config'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { UnauthorizedError, ValidationError, NotFoundError } from '../utils/errors'
import { logger } from '../utils/logger'
import { upload } from '../middleware/upload'

const router = Router()

// -------------------------------------------------------------
// Client JWT helpers — separate from consultant JWT
// -------------------------------------------------------------
interface ClientJwtPayload {
  clientPortalUserId: string
  clientCompanyId: string
  role: 'CLIENT'
  email: string
}

function generateClientToken(payload: ClientJwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '24h' } as jwt.SignOptions)
}

function authenticateClientJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided')
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, config.jwt.secret) as ClientJwtPayload
    if (payload.role !== 'CLIENT') throw new UnauthorizedError('Not a client token')
    ;(req as any).clientUser = payload
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Token expired')
    throw new UnauthorizedError('Invalid token')
  }
}

// -------------------------------------------------------------
// POST /api/client-portal/auth/register
// Called by consultants to create portal access for a client contact
// -------------------------------------------------------------
router.post(
  '/auth/register',
  authenticateJWT,
  enforceTenantScope,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId, email, password, firstName, lastName } = req.body
    if (!clientCompanyId || !email || !password || !firstName || !lastName) {
      throw new ValidationError('clientCompanyId, email, password, firstName, lastName all required')
    }

    const consultingFirmId = getTenantId(req as any)
    const client = await prisma.clientCompany.findFirst({
      where: { id: clientCompanyId, consultingFirmId, isActive: true },
      select: { id: true },
    })
    if (!client) throw new NotFoundError('Client not found')

    const existing = await prisma.clientPortalUser.findUnique({ where: { email } })
    if (existing) throw new ValidationError('Email already registered')

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.clientPortalUser.create({
      data: { clientCompanyId, email, passwordHash, firstName, lastName },
      select: { id: true, email: true, firstName: true, lastName: true, clientCompanyId: true, createdAt: true },
    })

    logger.info('Client portal user created', { id: user.id, clientCompanyId })
    res.status(201).json({ success: true, data: user })
  } catch (err) { next(err) }
  }
)

// -------------------------------------------------------------
// POST /api/client-portal/auth/login
// -------------------------------------------------------------
router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body
    if (!email || !password) throw new ValidationError('email and password required')

    const user = await prisma.clientPortalUser.findUnique({ where: { email } })
    if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Invalid credentials')

    await prisma.clientPortalUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const token = generateClientToken({
      clientPortalUserId: user.id,
      clientCompanyId: user.clientCompanyId,
      role: 'CLIENT',
      email: user.email,
    })

    const clientCompany = await prisma.clientCompany.findUnique({
      where: { id: user.clientCompanyId },
      select: { id: true, name: true },
    })

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
        clientCompany,
      },
    })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/client-portal/dashboard
// -------------------------------------------------------------
router.get('/dashboard', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload

    const [docRequirements, penalties, rewards, bidDecisions, client] = await Promise.all([
      prisma.documentRequirement.findMany({
        where: { clientCompanyId },
        include: { opportunity: { select: { id: true, title: true, responseDeadline: true, probabilityScore: true, expectedValue: true, scoreBreakdown: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.financialPenalty.findMany({
        where: { clientCompanyId },
        orderBy: { appliedAt: 'desc' },
        take: 20,
      }),
      prisma.complianceReward.findMany({
        where: { clientCompanyId, isRedeemed: false },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bidDecision.findMany({
        where: { clientCompanyId },
        include: { opportunity: { select: { id: true, title: true, agency: true, responseDeadline: true, probabilityScore: true, expectedValue: true, scoreBreakdown: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.clientCompany.findUnique({
        where: { id: clientCompanyId },
        include: { performanceStats: true },
      }),
    ])

    const now = new Date()
    const enrichedRequirements = docRequirements.map((r: any) => {
      const daysUntil = Math.ceil((new Date(r.dueDate).getTime() - now.getTime()) / 86400000)
      let urgency: string
      if (r.status === 'SUBMITTED') urgency = 'SUBMITTED'
      else if (daysUntil < 0) urgency = 'OVERDUE'
      else if (daysUntil <= 7) urgency = 'URGENT'
      else if (daysUntil <= 14) urgency = 'SOON'
      else urgency = 'OK'
      return { ...r, daysUntil, urgency }
    })

    const totalOutstandingFees = penalties
      .filter((p: any) => !p.isPaid)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0)

    res.json({
      success: true,
      data: {
        client,
        docRequirements: enrichedRequirements,
        penalties,
        rewards,
        bidDecisions,
        summary: {
          totalDocuments: docRequirements.length,
          submitted: docRequirements.filter((r: any) => r.status === 'SUBMITTED').length,
          pending: docRequirements.filter((r: any) => r.status === 'PENDING').length,
          overdue: enrichedRequirements.filter((r: any) => r.urgency === 'OVERDUE').length,
          totalOutstandingFees,
          activeRewards: rewards.length,
        },
      },
    })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/client-portal/score-breakdown/:opportunityId
// Returns score breakdown with plain-language explanations
// -------------------------------------------------------------
router.get('/score-breakdown/:opportunityId', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload

    const bidDecision = await prisma.bidDecision.findFirst({
      where: { opportunityId: req.params.opportunityId, clientCompanyId },
      include: {
        opportunity: {
          select: {
            id: true, title: true, agency: true, naicsCode: true, setAsideType: true,
            estimatedValue: true, expectedValue: true, probabilityScore: true, scoreBreakdown: true,
          },
        },
      },
    })

    if (!bidDecision) throw new NotFoundError('Score breakdown not found for this opportunity')

    const breakdown = bidDecision.opportunity.scoreBreakdown as any

    // Build plain-language explanations per factor
    const plainExplanations = breakdown?.factorContributions?.map((f: any) => ({
      ...f,
      plainText: buildPlainExplanation(f.factor, f.score),
    })) ?? []

    res.json({
      success: true,
      data: {
        opportunity: bidDecision.opportunity,
        breakdown,
        plainExplanations,
        summary: buildSummary(bidDecision.opportunity.probabilityScore),
      },
    })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/client-portal/rewards
// -------------------------------------------------------------
router.get('/rewards', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload
    const rewards = await prisma.complianceReward.findMany({
      where: { clientCompanyId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: rewards })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// PUT /api/client-portal/doc-requirements/:id/submit
// Allows client users to mark their own requirement as submitted.
// -------------------------------------------------------------
router.put(
  '/doc-requirements/:id/submit',
  authenticateClientJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload

      const existing = await prisma.documentRequirement.findFirst({
        where: { id: req.params.id, clientCompanyId },
        select: { id: true, status: true, submittedAt: true },
      })
      if (!existing) throw new NotFoundError('Document requirement not found')

      if (existing.status === 'SUBMITTED') {
        return res.json({ success: true, data: { id: existing.id, status: existing.status } })
      }

      const updated = await prisma.documentRequirement.update({
        where: { id: req.params.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: existing.submittedAt || new Date(),
        },
      })

      res.json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  }
)

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function buildPlainExplanation(factor: string, score: number): string {
  const pct = Math.round(score * 100)
  const map: Record<string, (p: number) => string> = {
    naicsOverlapScore: (p) => p >= 70
      ? `Your NAICS industry codes align well with this contract (${p}% match). You operate in the right space.`
      : `Your industry codes are a partial match (${p}%). This contract is somewhat outside your core focus area.`,
    setAsideAlignmentScore: (p) => p >= 80
      ? `Your business certifications (SDVOSB, WOSB, etc.) qualify you for this set-aside contract (${p}%).`
      : p === 0
      ? `This contract is set aside for certifications you don't currently hold.`
      : `Your certifications partially align with this contract's set-aside requirements (${p}%).`,
    incumbentWeaknessScore: (p) => p >= 60
      ? `The current contract holder appears weak or there is no strong incumbent, giving you a good opening (${p}%).`
      : `There is a strong incumbent contractor on this award, which reduces new entrant chances (${p}%).`,
    documentAlignmentScore: (p) => p >= 60
      ? `The work scope described in the solicitation documents matches your capabilities well (${p}%).`
      : `The technical requirements in this solicitation are a stretch from your typical work (${p}%).`,
    agencyAlignmentScore: (p) => p >= 60
      ? `This agency has a strong history of awarding to companies like yours (${p}% favorable rate).`
      : `This agency awards fewer contracts to small businesses similar to yours (${p}%).`,
    awardSizeFitScore: (p) => p >= 60
      ? `The contract value is well within your company's typical capacity to perform (${p}%).`
      : `This contract may be larger or smaller than what your company typically handles (${p}%).`,
    competitionDensityScore: (p) => p >= 60
      ? `There are relatively few competitors for this contract, improving your odds (${p}%).`
      : `This contract is expected to attract many bidders, increasing competition (${p}%).`,
    historicalDistribution: (p) => p >= 50
      ? `Historical data shows companies with your profile have won similar contracts (${p}% base rate).`
      : `Historically, companies like yours have a lower win rate on similar contracts (${p}% base rate).`,
  }
  return (map[factor] ?? ((p: number) => `Score: ${p}%`))(pct)
}

function buildSummary(probability: number): string {
  const pct = Math.round(probability * 100)
  if (pct >= 65) return `Strong fit — our model gives you a ${pct}% chance of winning this contract. You should seriously consider bidding.`
  if (pct >= 45) return `Moderate fit — our model gives you a ${pct}% chance. This is competitive but winnable with a strong proposal.`
  if (pct >= 25) return `Challenging — our model gives you a ${pct}% chance. Consider carefully whether the investment is worthwhile.`
  return `Low probability — our model gives you a ${pct}% chance. This contract may not be the best use of proposal resources.`
}

// -------------------------------------------------------------
// GET /api/client-portal/opportunities
// Returns opportunities matched to client's NAICS codes + their decline status
// -------------------------------------------------------------
router.get('/opportunities', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload
    const client = await prisma.clientCompany.findUnique({
      where: { id: clientCompanyId },
      select: { naicsCodes: true, consultingFirmId: true },
    })
    if (!client) throw new NotFoundError('Client')

    const declines = await prisma.clientOpportunityDecline.findMany({
      where: { clientCompanyId },
      select: { opportunityId: true },
    })
    const declinedIds = new Set(declines.map((d) => d.opportunityId))

    const where: any = {
      consultingFirmId: client.consultingFirmId,
      responseDeadline: { gte: new Date() },
    }
    if (client.naicsCodes.length > 0) {
      where.naicsCode = { in: client.naicsCodes }
    }

    const opps = await prisma.opportunity.findMany({
      where,
      orderBy: { probabilityScore: 'desc' },
      take: 50,
      select: {
        id: true, title: true, agency: true, naicsCode: true,
        setAsideType: true, noticeType: true, estimatedValue: true,
        probabilityScore: true, responseDeadline: true, recompeteFlag: true,
        description: true, placeOfPerformance: true,
      },
    })

    const result = opps.map((o) => ({ ...o, isDeclined: declinedIds.has(o.id) }))
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/client-portal/uploads   — client uploads a file to consultant
// -------------------------------------------------------------
router.post('/uploads', authenticateClientJWT, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload
    if (!req.file) throw new ValidationError('File required')
    const { title, notes } = req.body

    const client = await prisma.clientCompany.findUnique({
      where: { id: clientCompanyId },
      select: { consultingFirmId: true },
    })
    if (!client) throw new NotFoundError('Client')

    const record = await prisma.clientPortalUpload.create({
      data: {
        clientCompanyId,
        consultingFirmId: client.consultingFirmId,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        storageKey: req.file.filename,
        title: title || req.file.originalname,
        notes: notes || null,
      },
    })
    res.status(201).json({ success: true, data: record })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/client-portal/uploads   — list files the client has uploaded
// -------------------------------------------------------------
router.get('/uploads', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload
    const uploads = await prisma.clientPortalUpload.findMany({
      where: { clientCompanyId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: uploads })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/client-portal/uploads/:clientId  (ADMIN) — view uploads for a client
// -------------------------------------------------------------
router.get(
  '/admin/uploads/:clientId',
  authenticateJWT,
  enforceTenantScope,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req as any)
      const client = await prisma.clientCompany.findFirst({
        where: { id: req.params.clientId, consultingFirmId },
      })
      if (!client) throw new NotFoundError('Client')

      const uploads = await prisma.clientPortalUpload.findMany({
        where: { clientCompanyId: req.params.clientId },
        orderBy: { createdAt: 'desc' },
      })
      res.json({ success: true, data: uploads })
    } catch (err) { next(err) }
  }
)

// -------------------------------------------------------------
// GET /api/client-portal/admin/users/:clientId  (ADMIN)
// List all portal users for a client — so consultants can see who has access
// -------------------------------------------------------------
router.get(
  '/admin/users/:clientId',
  authenticateJWT,
  enforceTenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req as any)
      const client = await prisma.clientCompany.findFirst({
        where: { id: req.params.clientId, consultingFirmId },
        select: { id: true },
      })
      if (!client) throw new NotFoundError('Client')

      const users = await prisma.clientPortalUser.findMany({
        where: { clientCompanyId: req.params.clientId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          isActive: true, lastLoginAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      res.json({ success: true, data: users })
    } catch (err) { next(err) }
  }
)

// -------------------------------------------------------------
// PUT /api/client-portal/admin/users/:userId/reset-password  (ADMIN)
// Consultant sets a new temporary password for a locked-out client
// -------------------------------------------------------------
router.put(
  '/admin/users/:userId/reset-password',
  authenticateJWT,
  enforceTenantScope,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req as any)
      const { newPassword } = req.body
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' })
      }

      // Verify this user belongs to a client under this firm
      const user = await prisma.clientPortalUser.findFirst({
        where: { id: req.params.userId, clientCompany: { consultingFirmId } },
        select: { id: true, email: true },
      })
      if (!user) throw new NotFoundError('Portal user not found')

      const passwordHash = await bcrypt.hash(newPassword, 12)
      await prisma.clientPortalUser.update({
        where: { id: req.params.userId },
        data: { passwordHash, isActive: true },
      })

      logger.info('Portal user password reset by consultant', { userId: req.params.userId })
      res.json({ success: true, data: { message: `Password reset for ${user.email}` } })
    } catch (err) { next(err) }
  }
)

// -------------------------------------------------------------
// PUT /api/client-portal/admin/users/:userId/toggle-active  (ADMIN)
// Enable or disable a portal user's access
// -------------------------------------------------------------
router.put(
  '/admin/users/:userId/toggle-active',
  authenticateJWT,
  enforceTenantScope,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req as any)
      const user = await prisma.clientPortalUser.findFirst({
        where: { id: req.params.userId, clientCompany: { consultingFirmId } },
        select: { id: true, isActive: true },
      })
      if (!user) throw new NotFoundError('Portal user not found')

      const updated = await prisma.clientPortalUser.update({
        where: { id: req.params.userId },
        data: { isActive: !user.isActive },
        select: { id: true, isActive: true },
      })
      res.json({ success: true, data: updated })
    } catch (err) { next(err) }
  }
)

// -------------------------------------------------------------
// GET /api/client-portal/admin/uploads/:clientId/download/:uploadId  (ADMIN)
// -------------------------------------------------------------
router.get(
  '/admin/uploads/:clientId/download/:uploadId',
  authenticateJWT,
  enforceTenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req as any)
      const record = await prisma.clientPortalUpload.findFirst({
        where: { id: req.params.uploadId, consultingFirmId },
      })
      if (!record) throw new NotFoundError('Upload not found')

      const filePath = path.join(process.cwd(), 'uploads', record.storageKey)
      if (!fs.existsSync(filePath)) throw new NotFoundError('File not found on disk')
      res.download(filePath, record.fileName)
    } catch (err) { next(err) }
  }
)

export default router
