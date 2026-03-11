"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPortfolioEvaluation = runPortfolioEvaluation;
const database_1 = require("../config/database");
const decisionEngine_1 = require("./decisionEngine");
const logger_1 = require("../utils/logger");
const CONCURRENCY_LIMIT = 5;
/**
 * Simple concurrency limiter (avoids needing p-limit dependency).
 * Runs async tasks with bounded parallelism.
 */
async function runWithConcurrency(tasks, concurrency) {
    const results = [];
    let index = 0;
    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
async function runPortfolioEvaluation(consultingFirmId) {
    const opportunities = await database_1.prisma.opportunity.findMany({
        where: {
            consultingFirmId,
            status: "ACTIVE",
        },
        select: { id: true },
    });
    const clients = await database_1.prisma.clientCompany.findMany({
        where: {
            consultingFirmId,
            isActive: true,
        },
        select: { id: true },
    });
    // Build task list for all pairs
    const tasks = opportunities.flatMap((opp) => clients.map((client) => () => (0, decisionEngine_1.evaluateBidDecision)(opp.id, client.id)));
    logger_1.logger.info("Portfolio evaluation starting", {
        opportunities: opportunities.length,
        clients: clients.length,
        totalPairs: tasks.length,
        concurrency: CONCURRENCY_LIMIT,
    });
    const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
    return {
        totalOpportunities: opportunities.length,
        totalClients: clients.length,
        totalEvaluations: tasks.length,
        decisionsCreatedOrUpdated: results.length,
    };
}
//# sourceMappingURL=portfolioDecisionEngine.js.map