import axios from "axios"
import { prisma } from "../config/database"
import { logger } from "../utils/logger"

const SAM_BASE_URL = "https://api.sam.gov/opportunities/v2/search"
const MAX_PAGE_SIZE = 100

function formatSamDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function mapSetAside(value?: string | null) {
  if (!value) return "NONE"
  const normalized = value.toUpperCase()
  if (normalized.includes("SDVOSB")) return "SDVOSB"
  if (normalized.includes("WOSB")) return "WOSB"
  if (normalized.includes("HUBZONE")) return "HUBZONE"
  if (normalized.includes("8A")) return "SBA_8A"
  if (normalized.includes("TOTAL SMALL")) return "TOTAL_SMALL_BUSINESS"
  if (normalized.includes("SMALL")) return "SMALL_BUSINESS"
  return "NONE"
}

interface IngestParams {
  naicsCode?: string
  limit?: number
  jobId?: string
  isInitialPull?: boolean
  triggeredBy?: "MANUAL" | "SCHEDULED"
}

async function updateJobProgress(
  jobId: string | undefined,
  phase: string,
  current: number,
  total: number | null,
  extra?: Record<string, any>
) {
  if (!jobId) return
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: {
      progressPhase: phase,
      progressCurrent: current,
      progressTotal: total,
      ...extra,
    },
  }).catch(() => {})
}

export const samApiService = {
  async searchAndIngest(params: IngestParams, consultingFirmId: string) {
    try {
      if (!process.env.SAM_API_KEY) {
        throw new Error("SAM API key not configured")
      }

      const firm = await prisma.consultingFirm.findUnique({
        where: { id: consultingFirmId },
      })

      if (!firm) throw new Error("Consulting firm not found")

      const now = new Date()

      // Initial pull goes back 1 year, delta pulls only since last ingest
      let postedFrom: string
      if (params.isInitialPull || !firm.lastIngestedAt) {
        const ninetyDaysAgo = new Date(now)
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        postedFrom = formatSamDate(ninetyDaysAgo)
      } else {
        postedFrom = formatSamDate(firm.lastIngestedAt)
      }
      const postedTo = formatSamDate(now)

      let offset = 0
      const pageSize = Math.min(params.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
      let totalFound = 0
      let totalIngested = 0
      let totalUpdated = 0
      let totalErrors = 0

      await updateJobProgress(params.jobId, "FETCHING", 0, null)

      while (true) {
        await updateJobProgress(params.jobId, "FETCHING", totalFound, null, {
          opportunitiesFound: totalFound,
        })

        const response = await axios.get(SAM_BASE_URL, {
          params: {
            api_key: process.env.SAM_API_KEY,
            postedFrom,
            postedTo,
            ptype: 'o,k,p,r',
            naicsCode: params.naicsCode || undefined,
            limit: pageSize,
            offset,
          },
          timeout: 30000,
        })

        const records = response.data.opportunitiesData ?? []
        if (records.length === 0) break

        const totalRecords = response.data.totalRecords ?? null
        totalFound += records.length

        await updateJobProgress(params.jobId, "PROCESSING", 0, totalRecords ?? totalFound, {
          opportunitiesFound: totalFound,
        })

        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          try {
            // Update progress every 5 records
            if (i % 5 === 0) {
              await updateJobProgress(params.jobId, "PROCESSING", offset + i, totalRecords ?? totalFound)
            }

            const existing = await prisma.opportunity.findUnique({
              where: {
                consultingFirmId_samNoticeId: {
                  consultingFirmId,
                  samNoticeId: record.noticeId,
                },
              },
              include: { amendments: true },
            })

            const mappedData = {
              title: record.title ?? "Untitled Opportunity",
              agency:
                record.fullParentPathName ??
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
              // Discard URL-only descriptions — SAM.gov often returns an API link instead of text
              description: record.description && !String(record.description).trim().startsWith('http')
                ? String(record.description).trim()
                : null,
              // city/state are objects { code, name } — extract the name string
              placeOfPerformance: record.placeOfPerformance
                ? [
                    record.placeOfPerformance.city?.name ?? (typeof record.placeOfPerformance.city === 'string' ? record.placeOfPerformance.city : null),
                    record.placeOfPerformance.state?.name ?? record.placeOfPerformance.state?.code ?? (typeof record.placeOfPerformance.state === 'string' ? record.placeOfPerformance.state : null),
                  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0).join(', ') || null
                : null,
              estimatedValue: record.estimatedValue?.amount ?? null,
              estimatedValueMin: record.estimatedValue?.minAmount ?? null,
              estimatedValueMax: record.estimatedValue?.maxAmount ?? null,
              // Point of Contact — prefer primary, fall back to first entry
              ...(Array.isArray(record.pointOfContact) && record.pointOfContact.length > 0
                ? (() => {
                    const poc = record.pointOfContact.find((p: any) => p.type === 'primary') ?? record.pointOfContact[0]
                    // Only use fullName if it looks like a person's name (short, no newlines)
                    const rawName = poc.fullName ?? null
                    const cleanName = rawName && rawName.length < 80 && !rawName.includes('\n') ? rawName.trim() : null
                    return {
                      pocName: cleanName,
                      pocEmail: poc.email ?? null,
                      pocPhone: poc.phone ? String(poc.phone).replace(/[^\d\s().+-]/g, '').trim() : null,
                      pocTitle: poc.title && poc.title.length < 100 ? poc.title.trim() : null,
                    }
                  })()
                : {}),
            }

            if (!existing) {
              await prisma.opportunity.create({
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
              })
              totalIngested++
            } else {
              const changed =
                existing.responseDeadline.getTime() !==
                  (mappedData.responseDeadline?.getTime() ?? 0) ||
                existing.setAsideType !== mappedData.setAsideType ||
                existing.title !== mappedData.title ||
                existing.pocEmail === null

              if (changed) {
                await prisma.opportunity.update({
                  where: { id: existing.id },
                  data: { ...mappedData, isScored: false },
                })
                totalUpdated++
              }
            }

            // Amendment persistence
            if (record.modifications?.length) {
              const opportunityId =
                existing?.id ??
                (
                  await prisma.opportunity.findUnique({
                    where: {
                      consultingFirmId_samNoticeId: {
                        consultingFirmId,
                        samNoticeId: record.noticeId,
                      },
                    },
                  })
                )?.id

              if (opportunityId) {
                for (const mod of record.modifications) {
                  await prisma.amendment.upsert({
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
                  })
                }
              }
            }
          } catch (recordErr: any) {
            logger.warn("Failed to process SAM record", {
              noticeId: record.noticeId,
              error: recordErr.message,
            })
            totalErrors++
          }
        }

        offset += pageSize
        if (records.length < pageSize) break
      }

      await prisma.consultingFirm.update({
        where: { id: consultingFirmId },
        data: { lastIngestedAt: now },
      })

      logger.info("SAM ingestion complete", {
        consultingFirmId,
        found: totalFound,
        ingested: totalIngested,
        updated: totalUpdated,
        errors: totalErrors,
      })

      return { success: true, found: totalFound, ingested: totalIngested, updated: totalUpdated, errors: totalErrors }
    } catch (error: any) {
      logger.error("SAM ingestion failed", { error: error.message, status: error.response?.status, responseData: JSON.stringify(error.response?.data)?.substring(0, 500) })
      throw new Error("SAM.gov API unavailable")
    }
  },
}