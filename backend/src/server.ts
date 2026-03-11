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
import { connectDatabase, disconnectDatabase } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'
import { logger } from './utils/logger'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { startScoringWorker } from './workers/scoringWorker'
import { startEnrichmentWorker } from './workers/enrichmentWorker'

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
import rewardsRoutes from './routes/rewards'
import templateRoutes from './routes/templates'
import clientDocumentsRoutes from './routes/clientDocuments'
import analyticsRoutes from './routes/analytics'
import complianceMatrixRoutes from './routes/complianceMatrix'

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
      origin: (origin, cb) => {
        if (!config.isProduction) {
          cb(null, true)
          return
        }

        const allowed = (process.env.ALLOWED_ORIGINS || '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)

        if (!origin || allowed.includes(origin)) {
          cb(null, true)
          return
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
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.env,
    })
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
  apiRouter.use('/rewards', rewardsRoutes)
  apiRouter.use('/templates', templateRoutes)
  apiRouter.use('/client-documents', clientDocumentsRoutes)
  apiRouter.use('/analytics', analyticsRoutes)
  apiRouter.use('/compliance-matrix', complianceMatrixRoutes)

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

  // -------------------------------------------------------------
  // Start HTTP Server
  // -------------------------------------------------------------
  const server = app.listen(config.port, () => {
    logger.info('GovCon Platform server running', {
      port: config.port,
      environment: config.env,
      pid: process.pid,
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
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
