// =============================================================
// SUBNet Scraper — SBA Subcontracting Network
// Pulls subcontracting opportunities from:
//   1. SBA SUBNet  (https://eweb1.sba.gov/subnet/)
//   2. USAspending sub-awards (contract_type E/F/G/H)
//   3. SAM.gov subcontracting plan notices
// =============================================================
import axios from 'axios'
import { logger } from '../utils/logger'

export interface SubnetOpportunity {
  externalId:         string
  title:              string
  primeContractor:    string
  primeContractorUei: string | null
  naicsCode:          string | null
  agency:             string | null
  estimatedValue:     number | null
  responseDeadline:   Date | null
  description:        string | null
  contactEmail:       string | null
  contactName:        string | null
  sourceUrl:          string | null
  setAside:           string | null
}

const USA_SPENDING_BASE = process.env.USASPENDING_BASE_URL || 'https://api.usaspending.gov/api/v2'

// -------------------------------------------------------------
// Pull subcontract award data from USAspending
// award_type_codes: B = purchase order, subcontract types
// We filter by extent_competed to find small-biz set-asides
// -------------------------------------------------------------
export async function scrapeUsaSpendingSubcontracts(naicsCodes?: string[]): Promise<SubnetOpportunity[]> {
  const results: SubnetOpportunity[] = []
  const endDate   = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const filters: Record<string, unknown> = {
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ['A', 'B', 'C', 'D'],
    extent_competed: [
      'SMALL BUSINESS',
      '8A',
      'HUBZone Small Business',
      'Service-Disabled Veteran-Owned Small Business',
      'Woman-Owned Small Business',
    ],
  }

  if (naicsCodes && naicsCodes.length > 0) {
    filters.naics_codes = naicsCodes.slice(0, 10) // API limit
  }

  try {
    const resp = await axios.post(
      `${USA_SPENDING_BASE}/search/spending_by_award/`,
      {
        filters,
        fields: [
          'Award Amount', 'Recipient Name', 'recipient_uei',
          'Award Date', 'Award Type', 'generated_internal_id',
          'Awarding Agency', 'Contract Award Type', 'Extent Competed',
          'Number of Offers Received', 'naics_code',
        ],
        page: 1,
        limit: 100,
        sort: 'Award Amount',
        order: 'desc',
      },
      { timeout: 30000 }
    )

    const items: Record<string, unknown>[] = resp.data?.results ?? []
    for (const r of items) {
      results.push({
        externalId:        `usaspending-sub-${r['generated_internal_id']}`,
        title:             `${r['Contract Award Type'] || 'Contract'} — ${r['Awarding Agency'] || 'Federal Agency'}`,
        primeContractor:   (r['Recipient Name'] as string) || 'Unknown',
        primeContractorUei: (r['recipient_uei'] as string) || null,
        naicsCode:         (r['naics_code'] as string) || null,
        agency:            (r['Awarding Agency'] as string) || null,
        estimatedValue:    r['Award Amount'] ? Number(r['Award Amount']) : null,
        responseDeadline:  null,
        description:       `Set-aside contract opportunity. Competition: ${r['Extent Competed'] || 'N/A'}. Offers received: ${r['Number of Offers Received'] || 'N/A'}`,
        contactEmail:      null,
        contactName:       null,
        sourceUrl:         `https://www.usaspending.gov/award/${r['generated_internal_id']}`,
        setAside:          mapSetAside(r['Extent Competed'] as string),
      })
    }
  } catch (err) {
    logger.warn('USAspending subcontract fetch failed', { error: (err as Error).message })
  }

  return results
}

// -------------------------------------------------------------
// Fetch SAM.gov set-aside opportunities (small-biz focused)
// These are prime contracts requiring subcontracting plans
// Requires SAM_API_KEY env (same key used for opportunity sync)
// -------------------------------------------------------------
export async function scrapeSamSubcontracting(samApiKey: string): Promise<SubnetOpportunity[]> {
  if (!samApiKey) return []
  const results: SubnetOpportunity[] = []

  try {
    const resp = await axios.get('https://api.sam.gov/opportunities/v2/search', {
      params: {
        api_key:   samApiKey,
        limit:     100,
        postedFrom: formatDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
        postedTo:   formatDate(new Date()),
        typeOfSetAsideDescription: 'TOTAL SMALL BUSINESS',
        ptype:     'p,k,r',  // pre-solicitation, combined, sources sought
      },
      timeout: 30000,
    })

    const items: Record<string, unknown>[] = resp.data?.opportunitiesData ?? []
    for (const r of items) {
      results.push({
        externalId:         `sam-sub-${r['noticeId']}`,
        title:              (r['title'] as string) || 'Untitled',
        primeContractor:    'Seeking Subcontractors',
        primeContractorUei: null,
        naicsCode:          (r['naicsCode'] as string) || null,
        agency:             (r['fullParentPathName'] as string)?.split('.')[0] || null,
        estimatedValue:     null,
        responseDeadline:   r['responseDeadLine'] ? new Date(r['responseDeadLine'] as string) : null,
        description:        (r['description'] as string) || null,
        contactEmail:       (r['pointOfContact'] as any)?.[0]?.email || null,
        contactName:        (r['pointOfContact'] as any)?.[0]?.fullName || null,
        sourceUrl:          `https://sam.gov/opp/${r['noticeId']}/view`,
        setAside:           (r['typeOfSetAsideDescription'] as string) || null,
      })
    }
  } catch (err) {
    logger.warn('SAM.gov subcontracting fetch failed', { error: (err as Error).message })
  }

  return results
}

function mapSetAside(extentCompeted: string | null | undefined): string | null {
  if (!extentCompeted) return null
  const ec = extentCompeted.toUpperCase()
  if (ec.includes('SERVICE-DISABLED') || ec.includes('SDVOSB')) return 'SDVOSB'
  if (ec.includes('8A') || ec.includes('8(A)')) return '8(a)'
  if (ec.includes('HUBZONE')) return 'HUBZone'
  if (ec.includes('WOMAN')) return 'WOSB'
  if (ec.includes('SMALL BUSINESS')) return 'SB'
  return extentCompeted
}

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
