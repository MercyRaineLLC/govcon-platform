"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.samApiService = void 0;
const axios_1 = __importDefault(require("axios"));
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const SAM_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
function formatSamDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}
function mapSetAside(value) {
    if (!value)
        return "NONE";
    const normalized = value.toUpperCase();
    if (normalized.includes("SDVOSB"))
        return "SDVOSB";
    if (normalized.includes("WOSB"))
        return "WOSB";
    if (normalized.includes("HUBZONE"))
        return "HUBZONE";
    if (normalized.includes("8A"))
        return "SBA_8A";
    if (normalized.includes("TOTAL SMALL"))
        return "TOTAL_SMALL_BUSINESS";
    if (normalized.includes("SMALL"))
        return "SMALL_BUSINESS";
    return "NONE";
}
exports.samApiService = {
    async searchAndIngest(params, consultingFirmId) {
        try {
            if (!process.env.SAM_API_KEY) {
                throw new Error("SAM API key not configured");
            }
            const firm = await database_1.prisma.consultingFirm.findUnique({
                where: { id: consultingFirmId },
            });
            if (!firm)
                throw new Error("Consulting firm not found");
            const now = new Date();
            const postedFrom = firm.lastIngestedAt
                ? formatSamDate(firm.lastIngestedAt)
                : `01/01/${now.getFullYear()}`;
            const postedTo = formatSamDate(now);
            let offset = 0;
            const pageSize = params.limit ?? 25;
            let totalFound = 0;
            let totalIngested = 0;
            let totalErrors = 0;
            while (true) {
                const response = await axios_1.default.get(SAM_BASE_URL, {
                    params: {
                        api_key: process.env.SAM_API_KEY,
                        postedFrom,
                        postedTo,
                        naicsCode: params.naicsCode,
                        limit: pageSize,
                        offset,
                    },
                    timeout: 30000,
                });
                const records = response.data.opportunitiesData ?? [];
                if (records.length === 0)
                    break;
                totalFound += records.length;
                for (const record of records) {
                    try {
                        const existing = await database_1.prisma.opportunity.findUnique({
                            where: {
                                consultingFirmId_samNoticeId: {
                                    consultingFirmId,
                                    samNoticeId: record.noticeId,
                                },
                            },
                            include: { amendments: true },
                        });
                        const mappedData = {
                            title: record.title ?? "Untitled Opportunity",
                            agency: record.fullParentPathName ??
                                record.organizationType ??
                                "Unknown Agency",
                            naicsCode: record.naicsCode ?? "000000",
                            setAsideType: mapSetAside(record.typeOfSetAside),
                            postedDate: record.postedDate ? new Date(record.postedDate) : null,
                            responseDeadline: record.responseDeadLine
                                ? new Date(record.responseDeadLine)
                                : now,
                            archiveDate: record.archiveDate ? new Date(record.archiveDate) : null,
                            sourceUrl: record.uiLink ?? null,
                        };
                        if (!existing) {
                            await database_1.prisma.opportunity.create({
                                data: {
                                    consultingFirmId,
                                    samNoticeId: record.noticeId,
                                    ...mappedData,
                                    marketCategory: "SERVICES",
                                    status: "ACTIVE",
                                    probabilityScore: 0,
                                    expectedValue: 0,
                                    isScored: false,
                                },
                            });
                            totalIngested++;
                        }
                        else {
                            const changed = existing.responseDeadline.getTime() !==
                                (mappedData.responseDeadline?.getTime() ?? 0) ||
                                existing.setAsideType !== mappedData.setAsideType ||
                                existing.title !== mappedData.title;
                            if (changed) {
                                await database_1.prisma.opportunity.update({
                                    where: { id: existing.id },
                                    data: { ...mappedData, isScored: false },
                                });
                            }
                        }
                        // Amendment persistence
                        if (record.modifications?.length) {
                            const opportunityId = existing?.id ??
                                (await database_1.prisma.opportunity.findUnique({
                                    where: {
                                        consultingFirmId_samNoticeId: {
                                            consultingFirmId,
                                            samNoticeId: record.noticeId,
                                        },
                                    },
                                }))?.id;
                            if (opportunityId) {
                                for (const mod of record.modifications) {
                                    await database_1.prisma.amendment.upsert({
                                        where: { id: `${record.noticeId}_${mod.modNumber}` },
                                        update: {
                                            title: mod.modTitle ?? null,
                                            description: mod.modDescription ?? null,
                                            postedDate: mod.modDate ? new Date(mod.modDate) : null,
                                        },
                                        create: {
                                            id: `${record.noticeId}_${mod.modNumber}`,
                                            opportunityId,
                                            amendmentNo: mod.modNumber,
                                            amendmentNumber: mod.modNumber,
                                            title: mod.modTitle ?? null,
                                            description: mod.modDescription ?? null,
                                            postedDate: mod.modDate ? new Date(mod.modDate) : null,
                                        },
                                    });
                                }
                            }
                        }
                    }
                    catch (recordErr) {
                        logger_1.logger.warn("Failed to process SAM record", {
                            noticeId: record.noticeId,
                            error: recordErr.message,
                        });
                        totalErrors++;
                    }
                }
                offset += pageSize;
                if (records.length < pageSize)
                    break;
                // Throttle between pages to respect SAM.gov rate limits (~10 req/sec)
                await new Promise((r) => setTimeout(r, 1200));
            }
            await database_1.prisma.consultingFirm.update({
                where: { id: consultingFirmId },
                data: { lastIngestedAt: now },
            });
            logger_1.logger.info("SAM ingestion complete", {
                consultingFirmId,
                found: totalFound,
                ingested: totalIngested,
                errors: totalErrors,
            });
            return { success: true, found: totalFound, ingested: totalIngested, errors: totalErrors };
        }
        catch (error) {
            const status = error.response?.status;
            const body = error.response?.data;
            logger_1.logger.error("SAM ingestion failed", { error: error.message, status, body });
            if (status === 429) {
                throw new Error("SAM.gov rate limit exceeded (HTTP 429). The public API allows ~1,000 requests/day. " +
                    "Wait 15–60 minutes before ingesting again.");
            }
            if (status === 401 || status === 403) {
                throw new Error(`SAM.gov API key rejected (HTTP ${status}). Verify SAM_API_KEY in backend/.env.`);
            }
            if (status) {
                const detail = typeof body === "object" ? JSON.stringify(body) : String(body ?? "");
                throw new Error(`SAM.gov returned HTTP ${status}: ${detail.slice(0, 200)}`);
            }
            throw new Error(`SAM.gov request failed: ${error.message}`);
        }
    },
};
//# sourceMappingURL=samApi.js.map