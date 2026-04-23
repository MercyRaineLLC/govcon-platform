import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { ValidationError, NotFoundError, UnauthorizedError } from '../utils/errors'
import { logger } from '../utils/logger'
import { upload } from '../middleware/upload'
import jwt from 'jsonwebtoken'
import { config } from '../config/config'
import { notifyDeliverableReady, notifyApprovalReceived } from '../services/emailService'
import { smsDeliverableReady } from '../services/smsService'

const router = Router()

// Client JWT type
interface ClientJwtPayload {
  clientPortalUserId: string
  clientCompanyId: string
  role: 'CLIENT'
  email: string
}

// Authenticate client token (same as in clientPortal.ts)
function authenticateClientJWT(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('No token provided'))
    }
    const token = authHeader.split(' ')[1]
    try {
      const payload = jwt.verify(token, config.jwt.secret) as ClientJwtPayload
      if (payload.role !== 'CLIENT') return next(new UnauthorizedError('Not a client token'))
      ;(req as any).clientUser = payload
      next()
    } catch (err) {
      return next(new UnauthorizedError('Invalid token'))
    }
  } catch (err) {
    next(err)
  }
}

// Dual auth — accepts either consultant JWT (consultingFirmId in payload)
// or client JWT (clientCompanyId in payload). Used by comment endpoints
// where both parties participate in the same thread.
interface ConsultantJwtPayload {
  userId: string
  consultingFirmId: string
  role: 'ADMIN' | 'CONSULTANT'
  email: string
}

interface DualAuthContext {
  authorType: 'CONSULTANT' | 'CLIENT'
  authorId: string
  authorName: string
  consultingFirmId?: string
  clientCompanyId?: string
}

async function authenticateAny(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('No token provided'))
    }
    const token = authHeader.split(' ')[1]
    let payload: any
    try {
      payload = jwt.verify(token, config.jwt.secret)
    } catch {
      return next(new UnauthorizedError('Invalid token'))
    }

    if (payload.role === 'CLIENT') {
      const portalUser = await prisma.clientPortalUser.findUnique({
        where: { id: payload.clientPortalUserId },
        select: { firstName: true, lastName: true },
      }).catch(() => null)
      const ctx: DualAuthContext = {
        authorType: 'CLIENT',
        authorId: payload.clientPortalUserId,
        authorName: portalUser
          ? `${portalUser.firstName} ${portalUser.lastName}`.trim()
          : payload.email || 'Client',
        clientCompanyId: payload.clientCompanyId,
      }
      ;(req as any).authCtx = ctx
      return next()
    }

    if (payload.role === 'ADMIN' || payload.role === 'CONSULTANT') {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { firstName: true, lastName: true },
      }).catch(() => null)
      const ctx: DualAuthContext = {
        authorType: 'CONSULTANT',
        authorId: payload.userId,
        authorName: user
          ? `${user.firstName} ${user.lastName}`.trim()
          : payload.email || 'Consultant',
        consultingFirmId: payload.consultingFirmId,
      }
      ;(req as any).authCtx = ctx
      return next()
    }

    next(new UnauthorizedError('Unrecognized token role'))
  } catch (err) {
    next(err)
  }
}

// Verify the deliverable is visible to the caller's tenant scope
async function loadDeliverableForCaller(deliverableId: string, ctx: DualAuthContext) {
  const where: any = { id: deliverableId }
  if (ctx.authorType === 'CLIENT') {
    where.clientCompanyId = ctx.clientCompanyId
  } else {
    where.consultingFirmId = ctx.consultingFirmId
  }
  return prisma.clientDocument.findFirst({
    where,
    select: {
      id: true,
      title: true,
      consultingFirmId: true,
      clientCompanyId: true,
    },
  })
}

// =============================================================
// Deliverable Management Routes
// =============================================================

/**
 * GET /api/client-deliverables/list
 * List all deliverables (proposals, capability statements, etc.) for this client
 * Scoped to authenticated client only
 */
router.get('/list', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload

    const deliverables = await prisma.clientDocument.findMany({
      where: { clientCompanyId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        documentType: true,
        fileName: true,
        fileSize: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json({
      success: true,
      data: deliverables,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/client-deliverables/create-for-review
 * Consultant creates a deliverable and sends it to client for review
 * This is called from the consultant backend (requires consultant JWT + enforceTenantScope)
 * Body: { clientCompanyId, title, documentType, notes, file }
 */
router.post(
  '/create-for-review',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientCompanyId, title, documentType, notes } = req.body
      const consultantToken = req.headers.authorization?.split(' ')[1]

      if (!consultantToken) {
        throw new UnauthorizedError('Consultant authentication required')
      }

      if (!clientCompanyId || !title || !req.file) {
        throw new ValidationError('clientCompanyId, title, and file are required')
      }

      // Verify the consultant owns this client
      const clientCompany = await prisma.clientCompany.findUnique({
        where: { id: clientCompanyId },
        select: { consultingFirmId: true },
      })

      if (!clientCompany) {
        throw new NotFoundError('Client not found')
      }

      // Create the deliverable
      const deliverable = await prisma.clientDocument.create({
        data: {
          clientCompanyId,
          consultingFirmId: clientCompany.consultingFirmId,
          title,
          documentType: documentType || 'OTHER',
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          storageKey: req.file.filename,
          notes: notes || null,
        },
      })

      logger.info('Deliverable created for client review', {
        deliverableId: deliverable.id,
        clientId: clientCompanyId,
      })

      // Fire-and-forget notifications to all opted-in client portal users
      // Email goes to notifyDeliverables=true users
      // SMS goes to smsEnabled=true users with valid smsPhone (urgent channel only)
      ;(async () => {
        try {
          const portalUsers = await prisma.clientPortalUser.findMany({
            where: {
              clientCompanyId,
              isActive: true,
              OR: [
                { notifyDeliverables: true },
                { smsEnabled: true },
              ],
            },
            select: {
              email: true,
              firstName: true,
              lastName: true,
              notifyDeliverables: true,
              smsEnabled: true,
              smsPhone: true,
            },
          })
          const portalUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/client-portal'

          // Fetch firm display name once for SMS branding
          const firm = await prisma.consultingFirm.findUnique({
            where: { id: clientCompany.consultingFirmId },
            select: { name: true, brandingDisplayName: true },
          })
          const firmDisplayName = firm?.brandingDisplayName || firm?.name || 'MrGovCon'

          await Promise.all(portalUsers.flatMap(u => {
            const tasks: Promise<unknown>[] = []
            if (u.notifyDeliverables) {
              tasks.push(notifyDeliverableReady({
                firmId: clientCompany.consultingFirmId,
                recipientEmail: u.email,
                recipientName: `${u.firstName} ${u.lastName}`.trim(),
                deliverableTitle: title,
                portalUrl,
              }))
            }
            if (u.smsEnabled && u.smsPhone) {
              tasks.push(smsDeliverableReady({
                to: u.smsPhone,
                consultingFirmId: clientCompany.consultingFirmId,
                firmDisplayName,
                deliverableTitle: title,
              }))
            }
            return tasks
          }))
        } catch (err: any) {
          logger.warn('Failed to send deliverable notifications', { error: err.message })
        }
      })()

      res.status(201).json({
        success: true,
        data: deliverable,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/client-deliverables/:id
 * Get deliverable details + approval history + comments
 */
router.get('/:id', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId } = (req as any).clientUser as ClientJwtPayload
    const { id } = req.params

    const deliverable = await prisma.clientDocument.findFirst({
      where: { id, clientCompanyId },
      include: {
        sharedTemplate: {
          select: { status: true, reviewNotes: true, updatedAt: true },
        },
      },
    })

    if (!deliverable) {
      throw new NotFoundError('Deliverable not found')
    }

    res.json({
      success: true,
      data: deliverable,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/client-deliverables/:id/approve
 * Client approves a deliverable
 * Body: { notes?: string }
 */
router.post('/:id/approve', authenticateClientJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientCompanyId, clientPortalUserId } = (req as any).clientUser as ClientJwtPayload
    const { id } = req.params
    const { notes } = req.body

    const deliverable = await prisma.clientDocument.findFirst({
      where: { id, clientCompanyId },
    })

    if (!deliverable) {
      throw new NotFoundError('Deliverable not found')
    }

    // Log approval in audit trail via ComplianceLog
    await prisma.complianceLog.create({
      data: {
        consultingFirmId: deliverable.consultingFirmId,
        entityType: 'DOCUMENT_REQUIREMENT',
        entityId: id,
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        reason: notes || 'Client approved deliverable',
        triggeredBy: clientPortalUserId,
      },
    })

    // Fire-and-forget: notify consultant firm of approval
    ;(async () => {
      try {
        const firm = await prisma.consultingFirm.findUnique({
          where: { id: deliverable.consultingFirmId },
          select: { contactEmail: true, name: true },
        })
        const portalUser = await prisma.clientPortalUser.findUnique({
          where: { id: clientPortalUserId },
          select: { firstName: true, lastName: true },
        })
        if (firm && portalUser) {
          const portalUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/clients'
          await notifyApprovalReceived({
            firmId: deliverable.consultingFirmId,
            recipientEmail: firm.contactEmail,
            recipientName: firm.name,
            deliverableTitle: `${deliverable.title} (approved by ${portalUser.firstName} ${portalUser.lastName})`,
            portalUrl,
          })
        }
      } catch (err: any) {
        logger.warn('Failed to send approval notification', { error: err.message })
      }
    })()

    res.json({
      success: true,
      data: { message: 'Deliverable approved', deliverableId: id },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/client-deliverables/:id/request-changes
 * Client requests revisions to a deliverable
 * Body: { feedback: string }
 */
router.post(
  '/:id/request-changes',
  authenticateClientJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientCompanyId, clientPortalUserId } = (req as any).clientUser as ClientJwtPayload
      const { id } = req.params
      const { feedback } = req.body

      if (!feedback) {
        throw new ValidationError('feedback is required')
      }

      const deliverable = await prisma.clientDocument.findFirst({
        where: { id, clientCompanyId },
      })

      if (!deliverable) {
        throw new NotFoundError('Deliverable not found')
      }

      // Log request for changes
      await prisma.complianceLog.create({
        data: {
          consultingFirmId: deliverable.consultingFirmId,
          entityType: 'DOCUMENT_REQUIREMENT',
          entityId: id,
          fromStatus: 'PENDING',
          toStatus: 'IN_PROGRESS',
          reason: feedback,
          triggeredBy: clientPortalUserId,
        },
      })

      res.json({
        success: true,
        data: { message: 'Changes requested', deliverableId: id },
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// THREADED COMMENTS — accepts both consultant and client JWTs
// Tenant scope enforced by loadDeliverableForCaller
// =============================================================

/**
 * GET /api/client-deliverables/:id/comments
 * Returns all comments for a deliverable as a flat list
 * (frontend rebuilds tree from parentId references)
 */
router.get(
  '/:id/comments',
  authenticateAny,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).authCtx as DualAuthContext
      const deliverable = await loadDeliverableForCaller(req.params.id, ctx)
      if (!deliverable) throw new NotFoundError('Deliverable not found')

      const comments = await prisma.deliverableComment.findMany({
        where: { deliverableId: deliverable.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          deliverableId: true,
          authorType: true,
          authorId: true,
          authorName: true,
          body: true,
          parentId: true,
          isResolved: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      res.json({ success: true, data: { comments } })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/client-deliverables/:id/comments
 * Create a new comment or reply
 * Body: { body: string, parentId?: string }
 */
router.post(
  '/:id/comments',
  authenticateAny,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).authCtx as DualAuthContext
      const deliverable = await loadDeliverableForCaller(req.params.id, ctx)
      if (!deliverable) throw new NotFoundError('Deliverable not found')

      const { body, parentId } = req.body
      if (!body || typeof body !== 'string' || !body.trim()) {
        throw new ValidationError('Comment body is required')
      }
      if (body.length > 5000) {
        throw new ValidationError('Comment too long (max 5000 chars)')
      }

      // If reply, verify parent exists on same deliverable
      if (parentId) {
        const parent = await prisma.deliverableComment.findFirst({
          where: { id: parentId, deliverableId: deliverable.id },
          select: { id: true },
        })
        if (!parent) throw new ValidationError('Parent comment not found on this deliverable')
      }

      const comment = await prisma.deliverableComment.create({
        data: {
          deliverableId: deliverable.id,
          authorType: ctx.authorType,
          authorId: ctx.authorId,
          authorName: ctx.authorName,
          body: body.trim(),
          parentId: parentId || null,
        },
      })

      // Audit trail (compliance)
      await prisma.complianceLog.create({
        data: {
          consultingFirmId: deliverable.consultingFirmId,
          entityType: 'DOCUMENT_REQUIREMENT',
          entityId: deliverable.id,
          fromStatus: parentId ? 'COMMENT_REPLY' : 'COMMENT_NEW',
          toStatus: 'POSTED',
          reason: `${ctx.authorType} ${ctx.authorName}: ${body.trim().slice(0, 200)}`,
          triggeredBy: `${ctx.authorType.toLowerCase()}:${ctx.authorId}`,
        },
      }).catch(err => {
        logger.warn('Failed to audit comment', { commentId: comment.id, error: err.message })
      })

      // Fire-and-forget notification to other party
      ;(async () => {
        try {
          if (ctx.authorType === 'CLIENT') {
            // Client commented -> notify consultant firm contact
            const firm = await prisma.consultingFirm.findUnique({
              where: { id: deliverable.consultingFirmId },
              select: { contactEmail: true, name: true },
            })
            if (firm) {
              await notifyApprovalReceived({
                firmId: deliverable.consultingFirmId,
                recipientEmail: firm.contactEmail,
                recipientName: firm.name,
                deliverableTitle: `New comment on "${deliverable.title}" from ${ctx.authorName}`,
                portalUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/clients',
              })
            }
          } else {
            // Consultant commented -> notify all opted-in client portal users
            const portalUsers = await prisma.clientPortalUser.findMany({
              where: {
                clientCompanyId: deliverable.clientCompanyId,
                isActive: true,
                notifyDeliverables: true,
              },
              select: { email: true, firstName: true, lastName: true },
            })
            const portalUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/client-portal'
            await Promise.all(portalUsers.map(u =>
              notifyDeliverableReady({
                firmId: deliverable.consultingFirmId,
                recipientEmail: u.email,
                recipientName: `${u.firstName} ${u.lastName}`.trim(),
                deliverableTitle: `New comment on "${deliverable.title}"`,
                portalUrl,
              })
            ))
          }
        } catch (err: any) {
          logger.warn('Failed to send comment notification', { commentId: comment.id, error: err.message })
        }
      })()

      res.status(201).json({ success: true, data: { comment } })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * PATCH /api/client-deliverables/:id/comments/:commentId/resolve
 * Mark a comment thread as resolved (toggle)
 * Body: { isResolved: boolean }
 */
router.patch(
  '/:id/comments/:commentId/resolve',
  authenticateAny,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).authCtx as DualAuthContext
      const deliverable = await loadDeliverableForCaller(req.params.id, ctx)
      if (!deliverable) throw new NotFoundError('Deliverable not found')

      const { isResolved } = req.body
      if (typeof isResolved !== 'boolean') {
        throw new ValidationError('isResolved must be boolean')
      }

      const updated = await prisma.deliverableComment.updateMany({
        where: {
          id: req.params.commentId,
          deliverableId: deliverable.id,
        },
        data: { isResolved },
      })

      if (updated.count === 0) throw new NotFoundError('Comment not found')

      res.json({ success: true, data: { commentId: req.params.commentId, isResolved } })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * DELETE /api/client-deliverables/:id/comments/:commentId
 * Author can delete their own comment (soft constraint via authorId match)
 */
router.delete(
  '/:id/comments/:commentId',
  authenticateAny,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).authCtx as DualAuthContext
      const deliverable = await loadDeliverableForCaller(req.params.id, ctx)
      if (!deliverable) throw new NotFoundError('Deliverable not found')

      const comment = await prisma.deliverableComment.findFirst({
        where: {
          id: req.params.commentId,
          deliverableId: deliverable.id,
        },
        select: { id: true, authorId: true, authorType: true },
      })
      if (!comment) throw new NotFoundError('Comment not found')
      if (comment.authorId !== ctx.authorId || comment.authorType !== ctx.authorType) {
        throw new UnauthorizedError('You can only delete your own comments')
      }

      await prisma.deliverableComment.delete({ where: { id: comment.id } })

      res.json({ success: true, data: { commentId: comment.id, deleted: true } })
    } catch (err) {
      next(err)
    }
  }
)

export default router
