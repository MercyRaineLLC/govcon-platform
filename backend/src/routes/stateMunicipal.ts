import { Router } from "express"
import { prisma } from "../config/database"
import { authenticateJWT } from "../middleware/auth"
import { enforceTenantScope, getTenantId } from "../middleware/tenant"
import { AuthenticatedRequest } from "../types"

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// GET /api/state-municipal/subscription
router.get("/subscription", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)
    const sub = await prisma.stateMunicipalSubscription.findUnique({
      where: { consultingFirmId },
    })
    res.json({ success: true, subscription: sub })
  } catch (err) { next(err) }
})

// GET /api/state-municipal/opportunities
router.get("/opportunities", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)

    // Check subscription
    const sub = await prisma.stateMunicipalSubscription.findUnique({
      where: { consultingFirmId },
    })
    if (!sub || !sub.isActive) {
      return res.status(403).json({
        success: false,
        error: "State/Municipal contract access requires an active subscription.",
        code: "SUBSCRIPTION_REQUIRED",
      })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const skip = (page - 1) * limit

    const where: any = { consultingFirmId }
    if (req.query.state) where.state = req.query.state as string
    if (req.query.contractLevel) where.contractLevel = req.query.contractLevel as string
    if (req.query.status) where.status = req.query.status as string
    if (req.query.naicsCode) where.naicsCode = { contains: req.query.naicsCode as string }
    if (req.query.minValue) where.estimatedValue = { gte: parseFloat(req.query.minValue as string) }

    const [items, total] = await Promise.all([
      prisma.stateMunicipalOpportunity.findMany({
        where,
        orderBy: { responseDeadline: "asc" },
        skip,
        take: limit,
      }),
      prisma.stateMunicipalOpportunity.count({ where }),
    ])

    res.json({
      success: true,
      opportunities: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) { next(err) }
})

// GET /api/state-municipal/opportunities/:id
router.get("/opportunities/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)
    const opp = await prisma.stateMunicipalOpportunity.findFirst({
      where: { id: req.params.id, consultingFirmId },
    })
    if (!opp) return res.status(404).json({ success: false, error: "Not found" })
    res.json({ success: true, opportunity: opp })
  } catch (err) { next(err) }
})

// GET /api/state-municipal/stats
router.get("/stats", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)
    const [total, byLevel, byState, expiringSoon] = await Promise.all([
      prisma.stateMunicipalOpportunity.count({ where: { consultingFirmId, status: "ACTIVE" } }),
      prisma.stateMunicipalOpportunity.groupBy({
        by: ["contractLevel"],
        where: { consultingFirmId, status: "ACTIVE" },
        _count: true,
      }),
      prisma.stateMunicipalOpportunity.groupBy({
        by: ["state"],
        where: { consultingFirmId, status: "ACTIVE" },
        _count: true,
        orderBy: { _count: { state: "desc" } },
        take: 10,
      }),
      prisma.stateMunicipalOpportunity.count({
        where: {
          consultingFirmId,
          status: "ACTIVE",
          responseDeadline: {
            lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ])
    res.json({ success: true, stats: { total, byLevel, byState, expiringSoon } })
  } catch (err) { next(err) }
})

export default router
