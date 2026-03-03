// =============================================================
// GovCon Advisory Intelligence Platform
// Production Express Server
// =============================================================

import "dotenv/config"
import express from "express"
import helmet from "helmet"
import cors from "cors"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import path from "path"

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

async function bootstrap(): Promise<void> {
  const app = express()

  // Security
  app.use(helmet())
  app.use(cors({ origin: "*", credentials: true }))
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
    })
  )

  app.use(express.json({ limit: "5mb" }))
  app.use(express.urlencoded({ extended: true }))

  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  )

  // Static file serving (documents)
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

  // Health
  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: config.env,
    })
  })

  const apiRouter = express.Router()

  apiRouter.use("/auth", authRoutes)
  apiRouter.use("/opportunities", opportunityRoutes)
  apiRouter.use("/clients", clientRoutes)
  apiRouter.use("/submissions", submissionRoutes)
  apiRouter.use("/penalties", penaltyRoutes)
  apiRouter.use("/firm", firmRoutes)

  app.use("/api", apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  await connectDatabase()
  await connectRedis()

  const scoringWorker = startScoringWorker()

  const server = app.listen(config.port, () => {
    logger.info("GovCon Platform running", {
      port: config.port,
      environment: config.env,
    })
  })

  const shutdown = async () => {
    logger.info("Shutting down...")

    server.close(async () => {
      await scoringWorker.close()
      await disconnectDatabase()
      await disconnectRedis()
      process.exit(0)
    })

    setTimeout(() => process.exit(1), 15000)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err)
  process.exit(1)
})