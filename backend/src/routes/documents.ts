import { Router, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { upload } from '../middleware/upload'
import { NotFoundError, ValidationError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { opportunityId } = req.body
    if (!opportunityId) throw new ValidationError('opportunityId required')
    if (!req.file) throw new ValidationError('File required')

    const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, consultingFirmId } })
    if (!opportunity) throw new NotFoundError('Opportunity not found')

    const document = await prisma.opportunityDocument.create({
      data: {
        opportunityId,
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        storageKey: req.file.filename,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        isAmendment: req.body.isAmendment === 'true',
        analysisStatus: 'PENDING',
      },
    })

    logger.info('Document uploaded', { documentId: document.id, opportunityId })
    res.json({ success: true, data: document })
  } catch (err) { next(err) }
})

// GET /api/documents/:opportunityId
router.get('/:opportunityId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const opportunity = await prisma.opportunity.findFirst({ where: { id: req.params.opportunityId, consultingFirmId } })
    if (!opportunity) throw new NotFoundError('Opportunity not found')
    const documents = await prisma.opportunityDocument.findMany({ where: { opportunityId: req.params.opportunityId }, orderBy: { uploadedAt: 'desc' } })
    res.json({ success: true, data: documents })
  } catch (err) { next(err) }
})

// DELETE /api/documents/:documentId
router.delete('/:documentId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const doc = await prisma.opportunityDocument.findFirst({ where: { id: req.params.documentId }, include: { opportunity: { select: { consultingFirmId: true } } } })
    if (!doc || doc.opportunity.consultingFirmId !== consultingFirmId) throw new NotFoundError('Document not found')
    if (doc.storageKey) {
      const filePath = path.join(process.cwd(), 'uploads', doc.storageKey)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await prisma.opportunityDocument.delete({ where: { id: req.params.documentId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
