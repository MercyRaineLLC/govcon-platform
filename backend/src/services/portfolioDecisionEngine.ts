import { prisma } from "../config/database"
import { evaluateBidDecision } from "./decisionEngine"
import { logger } from "../utils/logger"

const CONCURRENCY_LIMIT = 5

/**
 * Simple concurrency limiter (avoids needing p-limit dependency).
 * Runs async tasks with bounded parallelism.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

export async function runPortfolioEvaluation(consultingFirmId: string) {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      consultingFirmId,
      status: "ACTIVE",
    },
    select: { id: true },
  })

  const clients = await prisma.clientCompany.findMany({
    where: {
      consultingFirmId,
      isActive: true,
    },
    select: { id: true },
  })

  // Build task list for all pairs
  const tasks = opportunities.flatMap((opp) =>
    clients.map((client) => () => evaluateBidDecision(opp.id, client.id))
  )

  logger.info("Portfolio evaluation starting", {
    opportunities: opportunities.length,
    clients: clients.length,
    totalPairs: tasks.length,
    concurrency: CONCURRENCY_LIMIT,
  })

  const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT)

  return {
    totalOpportunities: opportunities.length,
    totalClients: clients.length,
    totalEvaluations: tasks.length,
    decisionsCreatedOrUpdated: results.length,
  }
}
