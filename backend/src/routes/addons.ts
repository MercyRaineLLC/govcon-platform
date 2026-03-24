import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { ADDON_CATALOG, isAddonIncluded } from '../config/addons'
import { getFirmPlan } from '../middleware/tierGate'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// GET /api/addons — list all add-ons with purchased status
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const [firm, plan] = await Promise.all([
      prisma.consultingFirm.findUnique({ where: { id: consultingFirmId }, select: { purchasedAddons: true } }),
      getFirmPlan(consultingFirmId),
    ])
    const purchased = firm?.purchasedAddons ?? []
    const catalog = ADDON_CATALOG.map(addon => ({
      ...addon,
      purchased: purchased.includes(addon.slug) || isAddonIncluded(plan.slug, addon.slug),
      includedInPlan: isAddonIncluded(plan.slug, addon.slug),
    }))
    res.json({ success: true, data: catalog })
  } catch (err) { next(err) }
})

// POST /api/addons/:slug/purchase — admin only
router.post('/:slug/purchase', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { slug } = req.params
    const addon = ADDON_CATALOG.find(a => a.slug === slug)
    if (!addon) return res.status(404).json({ error: 'Add-on not found' })
    if (addon.status === 'coming_soon') return res.status(400).json({ error: 'This add-on is not yet available' })

    const firm = await prisma.consultingFirm.findUnique({ where: { id: consultingFirmId }, select: { purchasedAddons: true } })
    const current = firm?.purchasedAddons ?? []
    if (!current.includes(slug)) {
      await prisma.consultingFirm.update({
        where: { id: consultingFirmId },
        data: { purchasedAddons: [...current, slug] },
      })
    }
    res.json({ success: true, message: `${addon.name} activated` })
  } catch (err) { next(err) }
})

// DELETE /api/addons/:slug/cancel — admin only
router.delete('/:slug/cancel', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { slug } = req.params
    const firm = await prisma.consultingFirm.findUnique({ where: { id: consultingFirmId }, select: { purchasedAddons: true } })
    await prisma.consultingFirm.update({
      where: { id: consultingFirmId },
      data: { purchasedAddons: (firm?.purchasedAddons ?? []).filter((s: string) => s !== slug) },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
