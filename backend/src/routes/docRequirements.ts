import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { NotFoundError, ValidationError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// GET /api/doc-requirements
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { clientCompanyId, opportunityId } = req.query

    const where: any = { consultingFirmId }
    if (clientCompanyId) where.clientCompanyId = clientCompanyId as string
    if (opportunityId) where.opportunityId = opportunityId as string

    const requirements = await prisma.documentRequirement.findMany({
      where,
      include: {
        clientCompany: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true, responseDeadline: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    res.json({ success: true, data: requirements })
  } catch (err) { next(err) }
})

// POST /api/doc-requirements
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { clientCompanyId, opportunityId, title, description, dueDate, isPenaltyEnabled, penaltyAmount, penaltyPercent, notes } = req.body

    if (!clientCompanyId) throw new ValidationError('clientCompanyId required')
    if (!title) throw new ValidationError('title required')
    if (!dueDate) throw new ValidationError('dueDate required')

    // Verify client belongs to this firm
    const client = await prisma.clientCompany.findFirst({ where: { id: clientCompanyId, consultingFirmId } })
    if (!client) throw new NotFoundError('Client not found')

    const requirement = await prisma.documentRequirement.create({
      data: {
        consultingFirmId,
        clientCompanyId,
        opportunityId: opportunityId || null,
        title,
        description: description || null,
        dueDate: new Date(dueDate),
        isPenaltyEnabled: isPenaltyEnabled !== false,
        penaltyAmount: penaltyAmount ? parseFloat(penaltyAmount) : null,
        penaltyPercent: penaltyPercent ? parseFloat(penaltyPercent) : null,
        notes: notes || null,
        status: 'PENDING',
      },
      include: {
        clientCompany: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
      },
    })

    logger.info('Document requirement created', { id: requirement.id, clientCompanyId })
    res.status(201).json({ success: true, data: requirement })
  } catch (err) { next(err) }
})

// PUT /api/doc-requirements/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const existing = await prisma.documentRequirement.findFirst({ where: { id: req.params.id, consultingFirmId } })
    if (!existing) throw new NotFoundError('Document requirement not found')

    const { title, description, dueDate, isPenaltyEnabled, penaltyAmount, penaltyPercent, status, notes } = req.body

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
    if (isPenaltyEnabled !== undefined) updateData.isPenaltyEnabled = isPenaltyEnabled
    if (penaltyAmount !== undefined) updateData.penaltyAmount = penaltyAmount ? parseFloat(penaltyAmount) : null
    if (penaltyPercent !== undefined) updateData.penaltyPercent = penaltyPercent ? parseFloat(penaltyPercent) : null
    if (notes !== undefined) updateData.notes = notes
    if (status !== undefined) {
      updateData.status = status
      if (status === 'SUBMITTED' && !existing.submittedAt) {
        updateData.submittedAt = new Date()
      }
    }

    const updated = await prisma.documentRequirement.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        clientCompany: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
      },
    })

    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

// DELETE /api/doc-requirements/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const existing = await prisma.documentRequirement.findFirst({ where: { id: req.params.id, consultingFirmId } })
    if (!existing) throw new NotFoundError('Document requirement not found')

    await prisma.documentRequirement.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// GET /api/doc-requirements/client/:clientId — client portal view
router.get('/client/:clientId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const requirements = await prisma.documentRequirement.findMany({
      where: { clientCompanyId: req.params.clientId, consultingFirmId },
      include: {
        opportunity: { select: { id: true, title: true, responseDeadline: true, probabilityScore: true, expectedValue: true, scoreBreakdown: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
    res.json({ success: true, data: requirements })
  } catch (err) { next(err) }
})

export default router
