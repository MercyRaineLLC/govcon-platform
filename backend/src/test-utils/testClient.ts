// =============================================================
// Test client — boots a test Express app instance with the same
// middleware stack as production, plus DB seeding helpers.
//
// Per engineering.md Rule 6 (deterministic): each test gets a
// freshly-seeded firm + admin + JWT. Tests are isolated by ID.
// Per engineering.md Rule 4: cleanup runs in afterAll to prevent
// test pollution leaking into next run.
// =============================================================

import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { config } from '../config/config'
import { errorHandler, notFoundHandler } from '../middleware/errorHandler'

// Route imports — same as server.ts (no workers, no shutdown handlers)
import authRoutes from '../routes/auth'
import opportunityRoutes from '../routes/opportunities'
import clientRoutes from '../routes/clients'
import firmRoutes from '../routes/firm'
import brandingRoutes from '../routes/branding'
import billingRoutes from '../routes/billing'
import clientDeliverablesRoutes from '../routes/clientDeliverables'
import clientPortalRoutes from '../routes/clientPortal'
import complianceMatrixRoutes from '../routes/complianceMatrix'
import stripeWebhookRoutes from '../routes/stripeWebhook'
import betaRoutes from '../routes/beta'
import submissionRoutes from '../routes/submissions'
import healthAdminRoutes from '../routes/health'
import { metricsMiddleware, metricsHandler } from '../config/observability'

export function buildTestApp(): Express {
  const app = express()
  app.set('trust proxy', 1)

  app.use(helmet({ contentSecurityPolicy: false, hsts: false }))
  app.use(cors({ origin: true, credentials: true }))

  // Webhook needs raw body BEFORE express.json
  app.use('/api/webhooks', stripeWebhookRoutes)

  app.use(express.json({ limit: '10mb' }))

  // Observability — same as production server (mounted under /api/
  // so reverse-proxy routing works in prod)
  app.use(metricsMiddleware)
  app.get('/api/metrics', metricsHandler)

  app.get('/health', (_req, res) => res.json({ status: 'healthy' }))

  const apiRouter = express.Router()
  apiRouter.use('/auth', authRoutes)
  apiRouter.use('/opportunities', opportunityRoutes)
  apiRouter.use('/clients', clientRoutes)
  apiRouter.use('/firm', firmRoutes)
  apiRouter.use('/branding', brandingRoutes)
  apiRouter.use('/billing', billingRoutes)
  apiRouter.use('/client-deliverables', clientDeliverablesRoutes)
  apiRouter.use('/client-portal', clientPortalRoutes)
  apiRouter.use('/compliance-matrix', complianceMatrixRoutes)
  apiRouter.use('/beta', betaRoutes)
  apiRouter.use('/submissions', submissionRoutes)
  apiRouter.use('/health', healthAdminRoutes)
  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

// -------------------------------------------------------------
// Test fixture helpers
// -------------------------------------------------------------

export interface TestFirm {
  id: string
  name: string
  contactEmail: string
}

export interface TestUser {
  id: string
  email: string
  role: 'ADMIN' | 'CONSULTANT'
  consultingFirmId: string
  token: string
}

let counter = 0
function uniq(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

export async function createTestFirm(overrides: Partial<TestFirm> = {}): Promise<TestFirm> {
  const id = overrides.id ?? uniq('test-firm')
  const firm = await prisma.consultingFirm.create({
    data: {
      id,
      name: overrides.name ?? `Test Firm ${id}`,
      contactEmail: overrides.contactEmail ?? `${id}@test.local`,
      isActive: true,
    },
  })
  return { id: firm.id, name: firm.name, contactEmail: firm.contactEmail }
}

export async function createTestUser(
  consultingFirmId: string,
  overrides: { role?: 'ADMIN' | 'CONSULTANT'; email?: string } = {}
): Promise<TestUser> {
  const email = overrides.email ?? `${uniq('test-user')}@test.local`
  const user = await prisma.user.create({
    data: {
      consultingFirmId,
      email,
      passwordHash: '$2b$10$dummytestpasswordhash',
      firstName: 'Test',
      lastName: 'User',
      role: overrides.role ?? 'ADMIN',
      isActive: true,
    },
  })
  const token = jwt.sign(
    {
      userId: user.id,
      consultingFirmId,
      email: user.email,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: '1h' }
  )
  return {
    id: user.id,
    email: user.email,
    role: user.role as 'ADMIN' | 'CONSULTANT',
    consultingFirmId,
    token,
  }
}

export async function cleanupFirm(firmId: string): Promise<void> {
  // Cascade deletes everything via Prisma onDelete: Cascade on firm relations
  await prisma.consultingFirm.delete({ where: { id: firmId } }).catch(() => {})
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect()
}
