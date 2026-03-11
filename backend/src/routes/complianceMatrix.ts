import * as path from 'path'
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { NotFoundError, ValidationError } from '../utils/errors'
import { logger } from '../utils/logger'
import { generateComplianceMatrix, extractTextFromDocument } from '../services/complianceMatrixService'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// ---------------------------------------------------------------
// POST /api/compliance-matrix/:opportunityId/generate
// Generate (or regenerate) a compliance matrix for an opportunity.
// Uses the opportunity description + any uploaded solicitation docs.
// ---------------------------------------------------------------
router.post('/:opportunityId/generate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { opportunityId } = req.params

    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, consultingFirmId },
      include: {
        documents: {
          where: { analysisStatus: 'COMPLETE' },
          orderBy: { uploadedAt: 'desc' },
          take: 3,
        },
      },
    })
    if (!opp) throw new NotFoundError('Opportunity')

    // Build source text: uploaded docs first, then fall back to description
    let sourceText = ''
    for (const doc of opp.documents) {
      const filePath = path.join(process.cwd(), 'uploads', doc.storageKey)
      const txt = await extractTextFromDocument(filePath)
      if (txt.length > 200) {
        sourceText += `\n\n=== ${doc.fileName} ===\n${txt}`
      }
    }
    if (sourceText.length < 200 && opp.description) {
      sourceText = opp.description
    }
    if (!sourceText.trim()) {
      throw new ValidationError(
        'No solicitation text available. Upload the RFP/SOW document first, or ensure the opportunity has a description.'
      )
    }

    const requirements = await generateComplianceMatrix(sourceText, opp.title)

    // Upsert matrix record
    const matrix = await prisma.complianceMatrix.upsert({
      where: { opportunityId },
      update: {
        sourceText: sourceText.substring(0, 5000),
        generatedAt: new Date(),
      },
      create: {
        opportunityId,
        consultingFirmId,
        sourceText: sourceText.substring(0, 5000),
      },
    })

    // Delete old requirements and recreate
    await prisma.matrixRequirement.deleteMany({ where: { matrixId: matrix.id } })
    await prisma.matrixRequirement.createMany({
      data: requirements.map((r) => ({
        matrixId: matrix.id,
        section: r.section,
        sectionType: r.sectionType,
        requirementText: r.requirementText,
        isMandatory: r.isMandatory,
        farReference: r.farReference ?? null,
        sortOrder: r.sortOrder,
      })),
    })

    const full = await prisma.complianceMatrix.findUnique({
      where: { id: matrix.id },
      include: { requirements: { orderBy: { sortOrder: 'asc' } } },
    })

    logger.info('Compliance matrix generated', {
      opportunityId,
      consultingFirmId,
      requirementCount: requirements.length,
    })

    res.json({ success: true, data: full })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------
// GET /api/compliance-matrix/:opportunityId
// ---------------------------------------------------------------
router.get('/:opportunityId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { opportunityId } = req.params

    // Verify tenant owns the opportunity
    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, consultingFirmId },
      select: { id: true },
    })
    if (!opp) throw new NotFoundError('Opportunity')

    const matrix = await prisma.complianceMatrix.findUnique({
      where: { opportunityId },
      include: { requirements: { orderBy: { sortOrder: 'asc' } } },
    })

    res.json({ success: true, data: matrix ?? null })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------
// PATCH /api/compliance-matrix/requirements/:requirementId
// Update proposal section, status, or notes on a single row.
// ---------------------------------------------------------------
router.patch('/requirements/:requirementId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { requirementId } = req.params
    const { proposalSection, status, notes } = req.body

    const VALID_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'WAIVED', 'NON_COMPLIANT']
    if (status && !VALID_STATUSES.includes(status)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    }

    // Verify tenant owns the matrix this requirement belongs to
    const req2 = await prisma.matrixRequirement.findFirst({
      where: { id: requirementId },
      include: { matrix: { select: { consultingFirmId: true } } },
    })
    if (!req2 || req2.matrix.consultingFirmId !== consultingFirmId) {
      throw new NotFoundError('MatrixRequirement')
    }

    const updated = await prisma.matrixRequirement.update({
      where: { id: requirementId },
      data: {
        ...(proposalSection !== undefined && { proposalSection }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    })

    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

export default router
