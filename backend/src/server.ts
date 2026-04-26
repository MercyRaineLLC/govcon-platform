// =============================================================
// GovCon Advisory Intelligence Platform
// Production-Grade Express Server
// =============================================================

import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { config } from './config/config'
import { connectDatabase, disconnectDatabase, prisma } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'
import { logger } from './utils/logger'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { startScoringWorker } from './workers/scoringWorker'
import { startEnrichmentWorker } from './workers/enrichmentWorker'
import { startRecalibrationWorker } from './workers/recalibrationWorker'
import { startDeadlineNotificationWorker } from './workers/deadlineNotificationWorker'

// Route imports
import authRoutes from './routes/auth'
import opportunityRoutes from './routes/opportunities'
import clientRoutes from './routes/clients'
import submissionRoutes from './routes/submissions'
import penaltyRoutes from './routes/penalties'
import firmRoutes from './routes/firm'
import decisionRoutes from './routes/decision'
import jobRoutes from './routes/jobs'
import documentsRoutes from './routes/documents'
import docRequirementsRoutes from './routes/docRequirements'
import clientPortalRoutes from './routes/clientPortal'
import clientDeliverablesRoutes from './routes/clientDeliverables'
import rewardsRoutes from './routes/rewards'
import templateRoutes from './routes/templates'
import clientDocumentsRoutes from './routes/clientDocuments'
import analyticsRoutes from './routes/analytics'
import complianceMatrixRoutes from './routes/complianceMatrix'
import billingRoutes from './routes/billing'
import marketAnalyticsRoutes from './routes/marketAnalytics'
import addonsRoutes from './routes/addons'
import proposalAssistRoutes from './routes/proposalAssist'
import stateMunicipalRoutes from './routes/stateMunicipal'
import subcontractingRoutes from './routes/subcontracting'
import contractsRoutes from './routes/contracts'
import assistantRoutes from './routes/assistant'
import brandingRoutes from './routes/branding'
import stripeWebhookRoutes from './routes/stripeWebhook'
import backtestRoutes from './routes/backtest'
import { getVerifiedCustomDomains, PLATFORM_ROOT_DOMAIN } from './services/hostResolver'

async function bootstrap(): Promise<void> {
  const app = express()

  app.set('trust proxy', 1)

  // -------------------------------------------------------------
  // Security Middleware
  // -------------------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction,
      hsts: config.isProduction,
    })
  )

  app.use(
    cors({
      origin: async (origin, cb) => {
        if (!config.isProduction) {
          cb(null, true)
          return
        }

        if (!origin) {
          cb(null, true)
          return
        }

        // Static allowlist from env
        const allowed = (process.env.ALLOWED_ORIGINS || '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)

        if (allowed.includes(origin)) {
          cb(null, true)
          return
        }

        // Always allow platform root + its subdomains
        try {
          const url = new URL(origin)
          const host = url.hostname.toLowerCase()
          if (host === PLATFORM_ROOT_DOMAIN || host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
            cb(null, true)
            return
          }

          // Check verified custom domains (cached 5min in hostResolver)
          const customDomains = await getVerifiedCustomDomains()
          if (customDomains.includes(host)) {
            cb(null, true)
            return
          }
        } catch {
          // fall through to deny
        }

        cb(new Error('Origin not allowed by CORS'))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )

  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      },
    })
  )

  // -------------------------------------------------------------
  // Stripe Webhook (BEFORE express.json — needs raw body for signature)
  // -------------------------------------------------------------
  app.use('/api/webhooks', stripeWebhookRoutes)

  // -------------------------------------------------------------
  // Parsing Middleware
  // -------------------------------------------------------------
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // -------------------------------------------------------------
  // Request Logging
  // -------------------------------------------------------------
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
      skip: (req) => req.url === '/health',
    })
  )

  // -------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.env,
        db: 'ok',
      })
    } catch {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        db: 'error',
      })
    }
  })

  // -------------------------------------------------------------
  // API Router
  // -------------------------------------------------------------
  const apiRouter = express.Router()

  apiRouter.use('/auth', authRoutes)
  apiRouter.use('/opportunities', opportunityRoutes)
  apiRouter.use('/clients', clientRoutes)
  apiRouter.use('/submissions', submissionRoutes)
  apiRouter.use('/penalties', penaltyRoutes)
  apiRouter.use('/firm', firmRoutes)
  apiRouter.use('/decision', decisionRoutes)
  apiRouter.use('/jobs', jobRoutes)
  apiRouter.use('/documents', documentsRoutes)
  apiRouter.use('/doc-requirements', docRequirementsRoutes)
  apiRouter.use('/client-portal', clientPortalRoutes)
  apiRouter.use('/client-deliverables', clientDeliverablesRoutes)
  apiRouter.use('/rewards', rewardsRoutes)
  apiRouter.use('/templates', templateRoutes)
  apiRouter.use('/client-documents', clientDocumentsRoutes)
  apiRouter.use('/analytics', analyticsRoutes)
  apiRouter.use('/compliance-matrix', complianceMatrixRoutes)
  apiRouter.use('/billing', billingRoutes)
  apiRouter.use('/market-analytics', marketAnalyticsRoutes)
  apiRouter.use('/addons', addonsRoutes)
  apiRouter.use('/proposal-assist', proposalAssistRoutes)
  apiRouter.use('/state-municipal', stateMunicipalRoutes)
  apiRouter.use('/subcontracting', subcontractingRoutes)
  apiRouter.use('/contracts', contractsRoutes)
  apiRouter.use('/assistant', assistantRoutes)
  apiRouter.use('/branding', brandingRoutes)
  apiRouter.use('/admin/backtest', backtestRoutes)

  app.use('/api', apiRouter)

  // -------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------
  app.use(notFoundHandler)
  app.use(errorHandler)

  // -------------------------------------------------------------
  // Infrastructure Connections
  // -------------------------------------------------------------
  await connectDatabase()
  await connectRedis()

  const scoringWorker = startScoringWorker()
  const enrichmentWorker = startEnrichmentWorker()
  const recalibrationWorker = startRecalibrationWorker()
  const deadlineNotificationWorker = startDeadlineNotificationWorker()

  // -------------------------------------------------------------
  // Start HTTP Server
  // -------------------------------------------------------------
  const server = app.listen(config.port, () => {
    logger.info('MrGovCon Platform running - BANKV Engine Active', {
      port: config.port,
      environment: config.env,
      pid: process.pid,
      tagline: 'Transporting Goods, Transforming Lives',
    })
  })

  // -------------------------------------------------------------
  // Graceful Shutdown
  // -------------------------------------------------------------
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`)

    server.close(async () => {
      logger.info('HTTP server closed')

      await scoringWorker.close()
      await enrichmentWorker.close()
      await recalibrationWorker.close()
      await deadlineNotificationWorker.close()
      logger.info('Workers stopped')

      await disconnectDatabase()
      await disconnectRedis()

      logger.info('Shutdown complete')
      process.exit(0)
    })

    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 15000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason })
  })

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    })
    process.exit(1)
  })
}

bootstrap().catch((err) => {
  try {
    logger.error('Bootstrap failed', { error: err?.message, stack: err?.stack })
  } catch {
    // Fall back to stderr only if Winston itself failed during bootstrap
    process.stderr.write(`Bootstrap failed: ${err?.message ?? err}\n`)
  }
  process.exit(1)
})
