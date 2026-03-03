import { prisma } from "../config/database"
import { evaluateBidDecision } from "./decisionEngine"

export async function runPortfolioEvaluation(consultingFirmId: string) {
  // ------------------------------------------------------------
  // 1. Fetch Active Opportunities
  // ------------------------------------------------------------

  const opportunities = await prisma.opportunity.findMany({
    where: {
      consultingFirmId,
      status: "ACTIVE"
    }
  })

  // ------------------------------------------------------------
  // 2. Fetch Active Clients
  // ------------------------------------------------------------

  const clients = await prisma.clientCompany.findMany({
    where: {
      consultingFirmId,
      isActive: true
    }
  })

  let totalEvaluations = 0
  let createdOrUpdated = 0

  for (const opportunity of opportunities) {
    for (const client of clients) {
      totalEvaluations++

      await evaluateBidDecision(
        opportunity.id,
        client.id
      )

      createdOrUpdated++
    }
  }

  return {
    totalOpportunities: opportunities.length,
    totalClients: clients.length,
    totalEvaluations,
    decisionsCreatedOrUpdated: createdOrUpdated
  }
}