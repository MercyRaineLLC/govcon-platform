import cron from "node-cron"
import { prisma } from "../config/database"
import { samApiService } from "./samApi"
import { enqueueAllOpportunitiesForScoring } from "../workers/scoringWorker"
import { enqueueEnrichmentJobs } from "../workers/enrichmentWorker"
import { logger } from "../utils/logger"

let scheduledTasks: ReturnType<typeof cron.schedule>[] = []

async function runScheduledIngest() {
  logger.info("Scheduled ingest starting")

  const firms = await prisma.consultingFirm.findMany({
    where: { isActive: true },
  })

  for (const firm of firms) {
    try {
      const job = await prisma.ingestionJob.create({
        data: {
          consultingFirmId: firm.id,
          type: "INGEST",
          status: "RUNNING",
          triggeredBy: "SCHEDULED",
          startedAt: new Date(),
        },
      })

      const stats = await samApiService.searchAndIngest(
        { jobId: job.id, limit: 100 },
        firm.id
      )

      const scoringCount = await enqueueAllOpportunitiesForScoring(firm.id)

      await prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
          opportunitiesFound: stats.found || 0,
          opportunitiesNew: stats.ingested || 0,
          scoringJobsQueued: scoringCount,
          errors: stats.errors || 0,
          progressPhase: "COMPLETE",
        },
      })

      // Auto-enrich new opportunities
      if ((stats.ingested || 0) > 0) {
        const enrichJob = await prisma.ingestionJob.create({
          data: {
            consultingFirmId: firm.id,
            type: "ENRICH",
            status: "RUNNING",
            triggeredBy: "SCHEDULED",
            startedAt: new Date(),
          },
        })
        await enqueueEnrichmentJobs(firm.id, enrichJob.id)
      }

      logger.info("Scheduled ingest complete for firm", {
        firmId: firm.id,
        firmName: firm.name,
        found: stats.found,
        ingested: stats.ingested,
      })
    } catch (err: any) {
      logger.error("Scheduled ingest failed for firm", {
        firmId: firm.id,
        error: err.message,
      })
    }
  }
}

export function startScheduledIngest() {
  // 7:00 AM ET, 1:00 PM ET, 4:30 PM ET
  // Cron uses server timezone. These assume UTC, so convert ET to UTC:
  // ET = UTC-5 (EST) or UTC-4 (EDT)
  // Using EST (UTC-5): 7am=12:00 UTC, 1pm=18:00 UTC, 4:30pm=21:30 UTC
  const schedules = [
    { cron: "0 12 * * *", label: "7:00 AM ET" },
    { cron: "0 18 * * *", label: "1:00 PM ET" },
    { cron: "30 21 * * *", label: "4:30 PM ET" },
  ]

  for (const schedule of schedules) {
    const task = cron.schedule(schedule.cron, () => {
      runScheduledIngest().catch((err) => {
        logger.error("Scheduled ingest error", { error: err.message })
      })
    })
    scheduledTasks.push(task)
    logger.info("Scheduled ingest registered", { time: schedule.label, cron: schedule.cron })
  }

  return scheduledTasks
}

export function stopScheduledIngest() {
  for (const task of scheduledTasks) {
    task.stop()
  }
  scheduledTasks = []
}
