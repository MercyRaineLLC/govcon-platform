// =============================================================
// GovCon Advisory Intelligence Platform
// Production Express Server (Hardened)
// =============================================================

import "dotenv/config"
import express, { Request, Response, NextFunction } from "express"
import helmet from "helmet"
import cors from "cors"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import path from "path"
import http from "http"

import { config } from "./config/config"
import { connectDatabase, disconnectDatabase } from "./config/database"
import { connectRedis, disconnectRedis } from "./config/redis"
import { logger } from "./utils/logger"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"
import { startScoringWorker } from "./workers/scoringWorker"

import authRoutes from "./routes/auth"
import opportunityRoutes from "./routes/opportunities"
import clientRoutes from "./routes/clients"
import submissionRoutes from "./routes/submissions"
import penaltyRoutes from "./routes/penalties"
import firmRoutes from "./routes/firm"
import analyticsRoutes from "./routes/analytics"

let server: http.Server | null = null
let scoringWorker: any = null
let redisConnected = false
let dbConnected = false

async function bootstrap(): Promise<void> {
  const app = express()

  // =============================================================
  // Security Middleware
  // =============================================================

  app.use(helmet())

  app.use(
    cors({
      origin: "*",
      credentials: true,
    })
  )

  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    })
  )

  app.use(express.json({ limit: "5mb" }))
  app.use(express.urlencoded({ extended: true }))

  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  )

  // =============================================================
  // Static Files
  // =============================================================

  app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

  // =============================================================
  // Health Endpoint (Readiness + Liveness)
  // =============================================================

  app.get("/health", (_req: Request, res: Response) => {
    const healthy = dbConnected
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "degraded",
      database: dbConnected,
      redis: redisConnected,
      environment: config.env,
      timestamp: new Date().toISOString(),
    })
  })

  // =============================================================
  // API Routes
  // =============================================================

  const apiRouter = express.Router()

  apiRouter.use("/auth", authRoutes)
  apiRouter.use("/opportunities", opportunityRoutes)
  apiRouter.use("/clients", clientRoutes)
  apiRouter.use("/submissions", submissionRoutes)
  apiRouter.use("/penalties", penaltyRoutes)
  apiRouter.use("/firm", firmRoutes)
  apiRouter.use("/analytics", analyticsRoutes)

  app.use("/api", apiRouter)

  // =============================================================
  // 404 + Error Handlers
  // =============================================================

  app.use(notFoundHandler)
  app.use(errorHandler)

  // =============================================================
  // Service Connections
  // =============================================================

  try {
    await connectDatabase()
    dbConnected = true
    logger.info("Database connected")
  } catch (err) {
    logger.error("Database connection failed", err)
    process.exit(1)
  }

  try {
    await connectRedis()
    redisConnected = true
    logger.info("Redis connected")
  } catch (err) {
    logger.warn("Redis unavailable — continuing without cache")
    redisConnected = false
  }

  // =============================================================
  // Background Worker (Non-Critical)
  // =============================================================

  try {
    scoringWorker = startScoringWorker()
    logger.info("Scoring worker started")
  } catch (err) {
    logger.error("Scoring worker failed to start", err)
  }

  // =============================================================
  // Start Server
  // =============================================================

  server = app.listen(config.port, () => {
    logger.info("GovCon Platform running", {
      port: config.port,
      environment: config.env,
    })
  })

  // =============================================================
  // Graceful Shutdown
  // =============================================================

  const shutdown = async () => {
    logger.info("Shutdown initiated")

    if (server) {
      server.close(async () => {
        try {
          if (scoringWorker?.close) {
            await scoringWorker.close()
          }
        } catch (err) {
          logger.error("Worker shutdown error", err)
        }

        try {
          if (dbConnected) {
            await disconnectDatabase()
          }
        } catch (err) {
          logger.error("Database disconnect error", err)
        }

        try {
          if (redisConnected) {
            await disconnectRedis()
          }
        } catch (err) {
          logger.error("Redis disconnect error", err)
        }

        logger.info("Shutdown complete")
        process.exit(0)
      })
    }

    setTimeout(() => {
      logger.error("Forced shutdown")
      process.exit(1)
    }, 15000)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

// =============================================================
// Bootstrap
// =============================================================

bootstrap().catch((err) => {
  logger.error("Bootstrap failed", err)
  process.exit(1)
})