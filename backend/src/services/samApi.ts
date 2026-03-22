import axios from "axios"
import { prisma } from "../config/database"
import { logger } from "../utils/logger"

const SAM_BASE_URL = "https://api.sam.gov/opportunities/v2/search"

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

export const samApiService = {
  async searchAndIngest(
    params: { naicsCode?: string; limit?: number },
    consultingFirmId: string
  ) {
    try {
      const firm = await prisma.consultingFirm.findUnique({
        where: { id: consultingFirmId },
      })

      if (!firm) throw new Error("Consulting firm not found")

      // Prefer firm-level key (set via Settings), fall back to env
      const apiKey = firm.samApiKey || process.env.SAM_API_KEY
      if (!apiKey) {
        throw new Error(
          "SAM API key not configured. Add your key in Settings → SAM API Key or set SAM_API_KEY in backend/.env"
        )
      }

      const now = new Date()
      const postedFrom = firm.lastIngestedAt
        ? formatSamDate(firm.lastIngestedAt)
        : `01/01/${now.getFullYear()}`
      const postedTo = formatSamDate(now)

      let offset = 0
      const pageSize = params.limit ?? 25
      let totalFound = 0
      let totalIngested = 0
      let totalErrors = 0

      while (true) {
        const response = await axios.get(SAM_BASE_URL, {
          params: {
            api_key: apiKey,
            postedFrom,
            postedTo,
            naicsCode: params.naicsCode,
            limit: pageSize,
            offset,
          },
          timeout: 30000,
        })

        const records = response.data.opportunitiesData ?? []
        if (records.length === 0) break
        totalFound += records.length

        for (const record of records) {
          try {
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
              noticeType: record.type ?? null,
              setAsideType: mapSetAside(record.typeOfSetAside),
              postedDate: record.postedDate ? new Date(record.postedDate) : null,
              responseDeadline: record.responseDeadLine
                ? new Date(record.responseDeadLine)
                : now,
              archiveDate: record.archiveDate ? new Date(record.archiveDate) : null,
              sourceUrl: (() => {
                const ui = record.uiLink
                // SAM.gov sometimes returns an API URL (api.sam.gov/...) instead of
                // the web UI URL. Always normalise to the canonical web UI link.
                if (ui && ui.startsWith('https://sam.gov/')) return ui
                // Fall back to canonical web UI pattern using noticeId
                if (record.noticeId) return `https://sam.gov/opp/${record.noticeId}/view`
                return ui ?? null
              })(),
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
                existing.title !== mappedData.title

              if (changed) {
                await prisma.opportunity.update({
                  where: { id: existing.id },
                  data: { ...mappedData, isScored: false },
                })
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

        // Throttle between pages to respect SAM.gov rate limits (~10 req/sec)
        await new Promise((r) => setTimeout(r, 1200))
      }

      await prisma.consultingFirm.update({
        where: { id: consultingFirmId },
        data: { lastIngestedAt: now },
      })

      logger.info("SAM ingestion complete", {
        consultingFirmId,
        found: totalFound,
        ingested: totalIngested,
        errors: totalErrors,
      })

      return { success: true, found: totalFound, ingested: totalIngested, errors: totalErrors }
    } catch (error: any) {
      const status = error.response?.status
      const body   = error.response?.data
      logger.error("SAM ingestion failed", { error: error.message, status, body })

      if (status === 429) {
        throw new Error(
          "SAM.gov rate limit exceeded (HTTP 429). The public API allows ~1,000 requests/day. " +
          "Wait 15–60 minutes before ingesting again."
        )
      }
      if (status === 401 || status === 403) {
        throw new Error(
          `SAM.gov API key rejected (HTTP ${status}). Verify SAM_API_KEY in backend/.env.`
        )
      }
      if (status) {
        const detail = typeof body === "object" ? JSON.stringify(body) : String(body ?? "")
        throw new Error(`SAM.gov returned HTTP ${status}: ${detail.slice(0, 200)}`)
      }
      throw new Error(`SAM.gov request failed: ${error.message}`)
    }
  },
}