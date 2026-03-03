"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateClientStats = recalculateClientStats;
exports.getFirmMetrics = getFirmMetrics;
// =============================================================
// Performance Stats Service
// =============================================================
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
async function recalculateClientStats(clientCompanyId, consultingFirmId) {
    try {
        const submissions = await database_1.prisma.submissionRecord.findMany({
            where: { clientCompanyId, consultingFirmId },
            select: {
                wasOnTime: true,
                penaltyAmount: true,
            },
        });
        const totalSubmissions = submissions.length;
        const submissionsOnTime = submissions.filter((s) => s.wasOnTime).length;
        const submissionsLate = totalSubmissions - submissionsOnTime;
        const completionRate = totalSubmissions > 0 ? submissionsOnTime / totalSubmissions : 0;
        const totalPenalties = submissions.reduce((sum, s) => sum + (s.penaltyAmount || 0), 0);
        const opportunityCount = await database_1.prisma.opportunity.count({
            where: { consultingFirmId },
        });
        await database_1.prisma.performanceStats.upsert({
            where: { clientCompanyId },
            update: {
                totalOpportunities: opportunityCount,
                totalSubmissions,
                submissionsOnTime,
                submissionsLate,
                completionRate,
                totalPenalties,
                lastCalculatedAt: new Date(),
                updatedAt: new Date(),
            },
            create: {
                clientCompanyId,
                totalOpportunities: opportunityCount,
                totalSubmissions,
                submissionsOnTime,
                submissionsLate,
                completionRate,
                totalPenalties,
            },
        });
        logger_1.logger.info('Client performance stats updated', {
            clientCompanyId,
            completionRate: (completionRate * 100).toFixed(1) + '%',
            totalSubmissions,
        });
    }
    catch (err) {
        logger_1.logger.error('Failed to recalculate client stats', { clientCompanyId, error: err });
        throw err;
    }
}
async function getFirmMetrics(consultingFirmId) {
    const firm = await database_1.prisma.consultingFirm.findUnique({
        where: { id: consultingFirmId },
        include: {
            clientCompanies: {
                include: { performanceStats: true },
            },
        },
    });
    if (!firm)
        throw new errors_1.NotFoundError('ConsultingFirm');
    const clients = firm.clientCompanies;
    const totalClients = clients.length;
    const stats = clients
        .map((c) => c.performanceStats)
        .filter((s) => s !== null);
    const totalSubmissions = stats.reduce((sum, s) => sum + s.totalSubmissions, 0);
    const totalOnTime = stats.reduce((sum, s) => sum + s.submissionsOnTime, 0);
    const aggregateCompletionRate = totalSubmissions > 0 ? totalOnTime / totalSubmissions : 0;
    const totalPenaltiesGenerated = stats.reduce((sum, s) => sum + s.totalPenalties, 0);
    return {
        totalClients,
        totalSubmissions,
        aggregateCompletionRate,
        totalPenaltiesGenerated,
        clientBreakdown: clients.map((c) => ({
            id: c.id,
            name: c.name,
            completionRate: c.performanceStats?.completionRate || 0,
            totalPenalties: c.performanceStats?.totalPenalties || 0,
        })),
    };
}
//# sourceMappingURL=performanceStats.js.map