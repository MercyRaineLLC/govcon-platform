"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateOnTime = evaluateOnTime;
exports.calculatePenalty = calculatePenalty;
exports.enforceAndLogPenalty = enforceAndLogPenalty;
// =============================================================
// Financial Penalty Engine
// FR-16, FR-17, FR-18: Penalty calculation and enforcement
// =============================================================
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
/**
 * Determines whether a submission was on time.
 *
 * wasOnTime = submittedAt ≤ responseDeadline
 */
function evaluateOnTime(submittedAt, responseDeadline) {
    return submittedAt.getTime() <= responseDeadline.getTime();
}
/**
 * Calculates penalty amount based on firm configuration.
 *
 * Priority:
 * 1. Flat late fee (if configured)
 * 2. Percentage of estimated value (if flat fee not set)
 * 3. Zero (if neither configured)
 */
function calculatePenalty(config, estimatedValue) {
    if (config.flatLateFee != null && config.flatLateFee > 0) {
        return {
            amount: config.flatLateFee,
            penaltyType: 'FLAT_FEE',
            calculationBasis: `Flat late fee: $${config.flatLateFee.toFixed(2)}`,
        };
    }
    if (config.penaltyPercent != null && config.penaltyPercent > 0 && estimatedValue) {
        const amount = estimatedValue * config.penaltyPercent;
        return {
            amount,
            penaltyType: 'PERCENTAGE',
            calculationBasis: `${(config.penaltyPercent * 100).toFixed(2)}% of estimated value ($${estimatedValue.toLocaleString()}) = $${amount.toFixed(2)}`,
        };
    }
    return {
        amount: 0,
        penaltyType: 'FLAT_FEE',
        calculationBasis: 'No penalty configuration set for this firm',
    };
}
/**
 * Records a penalty in the database.
 * Called within a transaction alongside the submission record creation.
 */
async function enforceAndLogPenalty(params) {
    try {
        // Fetch firm penalty configuration
        const firm = await database_1.prisma.consultingFirm.findUnique({
            where: { id: params.consultingFirmId },
            select: { flatLateFee: true, penaltyPercent: true },
        });
        if (!firm)
            throw new errors_1.AppError('Consulting firm not found', 404);
        const calc = calculatePenalty(firm, params.estimatedValue);
        if (calc.amount > 0) {
            await database_1.prisma.financialPenalty.create({
                data: {
                    consultingFirmId: params.consultingFirmId,
                    clientCompanyId: params.clientCompanyId,
                    submissionRecordId: params.submissionRecordId,
                    penaltyType: calc.penaltyType,
                    amount: calc.amount,
                    calculationBasis: calc.calculationBasis,
                },
            });
            logger_1.logger.info('Penalty logged', {
                submissionRecordId: params.submissionRecordId,
                amount: calc.amount,
                type: calc.penaltyType,
            });
        }
        return { amount: calc.amount, logged: calc.amount > 0 };
    }
    catch (err) {
        logger_1.logger.error('Penalty enforcement failed', { error: err, params });
        throw err;
    }
}
//# sourceMappingURL=penaltyEngine.js.map