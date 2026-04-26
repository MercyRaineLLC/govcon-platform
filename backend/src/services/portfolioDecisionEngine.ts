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
  // Only evaluate the top-scored, active opportunities that haven't been decided recently.
  // Cap is configurable via PORTFOLIO_SCORING_CAP (default 1000) to prevent O(N×M)
  // blowup at scale.
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
  const cap = Math.max(50, parseInt(process.env.PORTFOLIO_SCORING_CAP || '1000', 10))

  const opportunities = await prisma.opportunity.findMany({
    where: {
      consultingFirmId,
      status: "ACTIVE",
      isScored: true,
      probabilityScore: { gt: 0 },
      responseDeadline: { gte: new Date() }, // skip expired
    },
    select: { id: true, probabilityScore: true },
    orderBy: { probabilityScore: "desc" },
    take: cap,
  })

  const clients = await prisma.clientCompany.findMany({
    where: {
      consultingFirmId,
      isActive: true,
    },
    select: { id: true },
  })

  if (opportunities.length === 0 || clients.length === 0) {
    return { totalOpportunities: 0, totalClients: 0, totalEvaluations: 0, decisionsCreatedOrUpdated: 0 }
  }

  // For each pair, skip if a recent decision already exists (updated within 24h)
  const existingDecisions = await prisma.bidDecision.findMany({
    where: {
      consultingFirmId,
      opportunityId: { in: opportunities.map((o) => o.id) },
      updatedAt: { gte: staleCutoff },
    },
    select: { opportunityId: true, clientCompanyId: true },
  })

  const recentSet = new Set(
    existingDecisions.map((d) => `${d.opportunityId}:${d.clientCompanyId}`)
  )

  const tasks = opportunities.flatMap((opp) =>
    clients
      .filter((client) => !recentSet.has(`${opp.id}:${client.id}`))
      .map((client) => () => evaluateBidDecision(opp.id, client.id))
  )

  logger.info("Portfolio evaluation starting", {
    opportunities: opportunities.length,
    clients: clients.length,
    newPairs: tasks.length,
    skippedRecent: existingDecisions.length,
    concurrency: CONCURRENCY_LIMIT,
  })

  if (tasks.length === 0) {
    return {
      totalOpportunities: opportunities.length,
      totalClients: clients.length,
      totalEvaluations: 0,
      decisionsCreatedOrUpdated: 0,
      note: "All decisions are fresh (< 24h old)",
    }
  }

  const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT)

  return {
    totalOpportunities: opportunities.length,
    totalClients: clients.length,
    totalEvaluations: tasks.length,
    decisionsCreatedOrUpdated: results.length,
  }
}
