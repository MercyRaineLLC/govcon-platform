"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const decisionEngine_1 = require("../services/decisionEngine");
const portfolioDecisionEngine_1 = require("../services/portfolioDecisionEngine");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const complianceStateMachine_1 = require("../services/complianceStateMachine");
const StatusTransitionSchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING", "APPROVED", "BLOCKED", "REJECTED"]),
    reason: zod_1.z.string().optional(),
});
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
// ============================================================
// POST /api/decision/run
// ============================================================
router.post("/run", async (req, res) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { opportunityId, clientCompanyId } = req.body;
        if (!opportunityId || !clientCompanyId) {
            return res.status(400).json({
                success: false,
                error: "opportunityId and clientCompanyId are required",
            });
        }
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id: opportunityId, consultingFirmId },
        });
        if (!opportunity) {
            return res.status(404).json({ success: false, error: "Opportunity not found" });
        }
        const client = await database_1.prisma.clientCompany.findFirst({
            where: { id: clientCompanyId, consultingFirmId, isActive: true },
            select: { id: true },
        });
        if (!client) {
            return res.status(404).json({ success: false, error: "Client not found" });
        }
        const decision = await (0, decisionEngine_1.evaluateBidDecision)(opportunityId, clientCompanyId);
        const winProb = decision.winProbability ?? 0;
        const roiRatio = decision.roiRatio ?? 0;
        const riskScore = decision.riskScore ?? 0;
        const winProbabilityPercent = Math.round(winProb * 100);
        const roiMultiple = roiRatio.toFixed(1) + "x";
        let riskLevel = "LOW";
        if (riskScore >= 20)
            riskLevel = "HIGH";
        else if (riskScore >= 10)
            riskLevel = "MODERATE";
        const decisionScore = Math.min(Math.round((winProb * 0.4 +
            Math.min(roiRatio / 20, 1) * 0.3 +
            (1 - riskScore / 100) * 0.3) *
            100), 99);
        let deadlineSummary = null;
        if (decision.explanationJson &&
            typeof decision.explanationJson === "object" &&
            !Array.isArray(decision.explanationJson)) {
            const explanation = decision.explanationJson;
            if ("daysToDeadline" in explanation &&
                typeof explanation.daysToDeadline === "number") {
                deadlineSummary = `${Math.floor(explanation.daysToDeadline)}d remaining`;
            }
        }
        return res.status(200).json({
            success: true,
            data: {
                id: decision.id,
                decisionScore,
                winProbabilityPercent: winProbabilityPercent + "%",
                roiMultiple,
                riskLevel,
                complianceStatus: decision.complianceStatus,
                recommendation: (decision.recommendation ?? "NO_BID").replace("_", " "),
                expectedRevenue: decision.expectedRevenue,
                netExpectedValue: decision.netExpectedValue,
                deadlineSummary,
            },
        });
    }
    catch (error) {
        console.error("Decision engine error:", error.message);
        return res.status(500).json({ success: false, error: "Decision evaluation failed" });
    }
});
// ============================================================
// POST /api/decision/run-all
// ============================================================
router.post("/run-all", async (req, res) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const results = await (0, portfolioDecisionEngine_1.runPortfolioEvaluation)(consultingFirmId);
        return res.status(200).json({ success: true, data: results });
    }
    catch (error) {
        console.error("Portfolio decision error:", error.message);
        return res.status(500).json({ success: false, error: "Portfolio evaluation failed" });
    }
});
// ============================================================
// GET /api/decision
// ============================================================
router.get("/", async (req, res) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { clientCompanyId, recommendation, complianceStatus, sortBy = "createdAt", order = "desc" } = req.query;
        if (clientCompanyId) {
            const client = await database_1.prisma.clientCompany.findFirst({
                where: { id: String(clientCompanyId), consultingFirmId },
                select: { id: true },
            });
            if (!client) {
                return res.status(404).json({ success: false, error: "Client not found" });
            }
        }
        const where = { consultingFirmId };
        if (clientCompanyId)
            where.clientCompanyId = String(clientCompanyId);
        if (recommendation)
            where.recommendation = String(recommendation);
        if (complianceStatus)
            where.complianceStatus = String(complianceStatus);
        const decisions = await database_1.prisma.bidDecision.findMany({
            where,
            orderBy: { [String(sortBy)]: order === "asc" ? "asc" : "desc" },
            include: { opportunity: true, clientCompany: true },
        });
        return res.status(200).json({ success: true, count: decisions.length, data: decisions });
    }
    catch (error) {
        console.error("Decision fetch error:", error.message);
        return res.status(500).json({ success: false, error: "Failed to fetch decisions" });
    }
});
// ============================================================
// GET /api/decision/metrics
// ============================================================
router.get("/metrics", async (req, res) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const decisions = await database_1.prisma.bidDecision.findMany({
            where: { consultingFirmId },
        });
        if (decisions.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    totalEvaluated: 0,
                    totalPrime: 0,
                    totalSub: 0,
                    totalNoBid: 0,
                    averageWinProbability: 0,
                    averageROI: 0,
                    totalExpectedRevenue: 0,
                    totalNetExpectedValue: 0,
                },
            });
        }
        const totalEvaluated = decisions.length;
        const totalPrime = decisions.filter((d) => d.recommendation === "BID_PRIME").length;
        const totalSub = decisions.filter((d) => d.recommendation === "BID_SUB").length;
        const totalNoBid = decisions.filter((d) => d.recommendation === "NO_BID").length;
        const averageWinProbability = decisions.reduce((sum, d) => sum + (d.winProbability ?? 0), 0) / totalEvaluated;
        const averageROI = decisions.reduce((sum, d) => sum + (d.roiRatio ?? 0), 0) / totalEvaluated;
        const totalExpectedRevenue = decisions.reduce((sum, d) => sum + Number(d.expectedRevenue ?? 0), 0);
        const totalNetExpectedValue = decisions.reduce((sum, d) => sum + Number(d.netExpectedValue ?? 0), 0);
        return res.status(200).json({
            success: true,
            data: {
                totalEvaluated,
                totalPrime,
                totalSub,
                totalNoBid,
                averageWinProbability: Number((averageWinProbability * 100).toFixed(1)) + "%",
                averageROI: Number(averageROI.toFixed(2)) + "x",
                totalExpectedRevenue,
                totalNetExpectedValue,
            },
        });
    }
    catch (error) {
        console.error("Decision metrics error:", error.message);
        return res.status(500).json({ success: false, error: "Failed to compute metrics" });
    }
});
// ============================================================
// PATCH /api/decision/:id/status  (ADMIN only)
// Manually transition a BidDecision compliance status.
// ============================================================
router.patch("/:id/status", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { status, reason } = StatusTransitionSchema.parse(req.body);
        const result = await (0, complianceStateMachine_1.transitionBidDecisionStatus)({
            decisionId: req.params.id,
            toStatus: status,
            consultingFirmId,
            triggeredBy: req.user?.userId,
            reason,
        });
        if (!result.success) {
            return res.status(422).json({
                success: false,
                error: result.error,
                code: "INVALID_TRANSITION",
            });
        }
        return res.json({ success: true, data: { id: req.params.id, status } });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: "Status transition failed" });
    }
});
exports.default = router;
//# sourceMappingURL=decision.js.map