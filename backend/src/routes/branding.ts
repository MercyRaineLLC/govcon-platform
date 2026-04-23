import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope } from '../middleware/tenant'
import { ValidationError, NotFoundError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

// =============================================================
// GET /api/branding/:firmId
// Fetch branding configuration for a firm (public endpoint)
// =============================================================
router.get('/:firmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = req.params

    const firm = await prisma.consultingFirm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        isVeteranOwned: true,
        brandingLogoUrl: true,
        brandingPrimaryColor: true,
        brandingSecondaryColor: true,
        brandingDisplayName: true,
        brandingTagline: true,
        brandingFaviconUrl: true,
      },
    })

    if (!firm) {
      throw new NotFoundError('Firm not found')
    }

    // Return branding config with fallbacks
    const branding = {
      firmId: firm.id,
      firmName: firm.name,
      displayName: firm.brandingDisplayName || firm.name,
      tagline: firm.brandingTagline || 'Transporting Goods, Transforming Lives',
      logoUrl: firm.brandingLogoUrl || null,
      primaryColor: firm.brandingPrimaryColor || '#fbbf24',
      secondaryColor: firm.brandingSecondaryColor || '#f59e0b',
      faviconUrl: firm.brandingFaviconUrl || null,
      isVeteranOwned: firm.isVeteranOwned,
      platform: 'MrGovCon',
      engine: 'BANKV Engine',
    }

    res.json({
      success: true,
      data: branding,
    })
  } catch (err) {
    next(err)
  }
})

// =============================================================
// PUT /api/branding/admin/update
// Update branding configuration (admin only)
// =============================================================
router.put(
  '/admin/update',
  authenticateJWT,
  requireRole('ADMIN'),
  enforceTenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const firmId = (req as any).firmId
      const {
        displayName,
        tagline,
        logoUrl,
        primaryColor,
        secondaryColor,
        faviconUrl,
      } = req.body

      // Validate colors are hex format
      if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
        throw new ValidationError('Invalid primary color format (must be #RRGGBB)')
      }
      if (secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(secondaryColor)) {
        throw new ValidationError('Invalid secondary color format (must be #RRGGBB)')
      }

      const updated = await prisma.consultingFirm.update({
        where: { id: firmId },
        data: {
          brandingDisplayName: displayName || undefined,
          brandingTagline: tagline || undefined,
          brandingLogoUrl: logoUrl || undefined,
          brandingPrimaryColor: primaryColor || undefined,
          brandingSecondaryColor: secondaryColor || undefined,
          brandingFaviconUrl: faviconUrl || undefined,
        },
        select: {
          id: true,
          name: true,
          brandingLogoUrl: true,
          brandingPrimaryColor: true,
          brandingSecondaryColor: true,
          brandingDisplayName: true,
          brandingTagline: true,
          brandingFaviconUrl: true,
        },
      })

      logger.info('Firm branding updated', {
        firmId,
        displayName: updated.brandingDisplayName,
      })

      res.json({
        success: true,
        message: 'Branding configuration updated',
        data: updated,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
