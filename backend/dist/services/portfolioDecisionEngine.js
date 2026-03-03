"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPortfolioEvaluation = runPortfolioEvaluation;
const database_1 = require("../config/database");
const decisionEngine_1 = require("./decisionEngine");
async function runPortfolioEvaluation(consultingFirmId) {
    // ------------------------------------------------------------
    // 1. Fetch Active Opportunities
    // ------------------------------------------------------------
    const opportunities = await database_1.prisma.opportunity.findMany({
        where: {
            consultingFirmId,
            status: "ACTIVE"
        }
    });
    // ------------------------------------------------------------
    // 2. Fetch Active Clients
    // ------------------------------------------------------------
    const clients = await database_1.prisma.clientCompany.findMany({
        where: {
            consultingFirmId,
            isActive: true
        }
    });
    let totalEvaluations = 0;
    let createdOrUpdated = 0;
    for (const opportunity of opportunities) {
        for (const client of clients) {
            totalEvaluations++;
            await (0, decisionEngine_1.evaluateBidDecision)(opportunity.id, client.id);
            createdOrUpdated++;
        }
    }
    return {
        totalOpportunities: opportunities.length,
        totalClients: clients.length,
        totalEvaluations,
        decisionsCreatedOrUpdated: createdOrUpdated
    };
}
//# sourceMappingURL=portfolioDecisionEngine.js.map