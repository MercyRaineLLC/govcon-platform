import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { NotFoundError } from '../utils/errors'
import { generateProposalOutline } from '../services/proposalAssist'
import { checkAiCallLimit } from '../middleware/tierGate'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// POST /api/proposal-assist/:opportunityId/outline
router.post('/:opportunityId/outline', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)

    const aiCheck = await checkAiCallLimit(consultingFirmId)
    if (!aiCheck.allowed) {
      return res.status(403).json({ error: 'AI_LIMIT', message: `AI call limit reached (${aiCheck.current}/${aiCheck.max} this month).` })
    }

    const { opportunityId } = req.params

    const [opp, matrix] = await Promise.all([
      prisma.opportunity.findFirst({
        where: { id: opportunityId, consultingFirmId },
        select: { id: true, title: true, agency: true, naicsCode: true, setAsideType: true, estimatedValue: true, historicalWinner: true },
      }),
      prisma.complianceMatrix.findUnique({
        where: { opportunityId },
        include: { requirements: { orderBy: { sortOrder: 'asc' }, take: 30 } },
      }),
    ])

    if (!opp) throw new NotFoundError('Opportunity')

    const requirements = (matrix?.requirements ?? []).map(r => ({
      section: r.section,
      requirementText: r.requirementText,
      isMandatory: r.isMandatory,
    }))

    const outline = await generateProposalOutline(
      opp.title,
      opp.agency,
      requirements,
      {
        naicsCode: opp.naicsCode ?? undefined,
        setAsideType: opp.setAsideType,
        estimatedValue: opp.estimatedValue ? Number(opp.estimatedValue) : null,
        historicalWinner: opp.historicalWinner,
      },
      consultingFirmId
    )

    res.json({ success: true, data: outline })
  } catch (err) { next(err) }
})

export default router
