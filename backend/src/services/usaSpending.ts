// =============================================================
// USASpending API Service
// Full historical award enrichment for decision intelligence
// =============================================================
import axios, { AxiosInstance } from 'axios';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { EnrichmentResult, AwardRecord } from '../types';

class UsaSpendingService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.usaSpending.baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Full enrichment for a single opportunity.
   * Pulls last 5 years of awards matching NAICS + Agency.
   * Computes: historical winner, avg award, competition count, incumbent probability.
   */
  async enrichOpportunity(params: {
    naicsCode: string;
    agency: string;
    pscCode?: string;
  }): Promise<EnrichmentResult> {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const filters: any = {
        time_period: [{ start_date: startDate, end_date: endDate }],
        naics_codes: [params.naicsCode],
        award_type_codes: ['A', 'B', 'C', 'D'], // Contract types only
      };

      if (params.agency) {
        filters.agencies = [
          { type: 'awarding', tier: 'toptier', name: params.agency },
        ];
      }

      const response = await this.client.post('/search/spending_by_award/', {
        filters,
        fields: [
          'Award Amount',
          'Recipient Name',
          'recipient_uei',
          'Award Date',
          'Base and All Options Value',
          'Award Type',
          'Contract Award Type',
          'generated_internal_id',
        ],
        page: 1,
        limit: 100,
        sort: 'Award Amount',
        order: 'desc',
      });

      const results = response.data?.results || [];
      const total = response.data?.page_metadata?.total || 0;

      if (results.length === 0) {
        return this.emptyEnrichment();
      }

      // Build award records
      const awards: AwardRecord[] = results.map((r: any) => ({
        recipientName: r['Recipient Name'] || 'Unknown',
        recipientUei: r['recipient_uei'] || undefined,
        awardAmount: r['Award Amount'] || 0,
        awardDate: r['Award Date'] || '',
        baseAndAllOptions: r['Base and All Options Value'] || undefined,
        awardType: r['Award Type'] || undefined,
        contractNumber: r['generated_internal_id'] || undefined,
      }));

      // Compute winner analysis
      const recipientCounts: Record<string, number> = {};
      const recipientAmounts: Record<string, number> = {};

      for (const award of awards) {
        const name = award.recipientName;
        recipientCounts[name] = (recipientCounts[name] || 0) + 1;
        recipientAmounts[name] = (recipientAmounts[name] || 0) + award.awardAmount;
      }

      const sortedByCount = Object.entries(recipientCounts).sort((a, b) => b[1] - a[1]);
      const historicalWinner = sortedByCount[0]?.[0] || null;
      const winnerCount = sortedByCount[0]?.[1] || 0;
      const competitionCount = Object.keys(recipientCounts).length;
      const incumbentProbability = total > 0 ? winnerCount / awards.length : 0;

      const totalAmount = awards.reduce((sum, a) => sum + a.awardAmount, 0);
      const historicalAvgAward = awards.length > 0 ? totalAmount / awards.length : 0;

      // Pull agency small business / SDVOSB rates separately
      const agencyRates = await this.getAgencySetAsideRates(params.agency);

      // Recompete detection: title contains common recompete signals
      const recompeteFlag = false; // Set by enrichment worker from opportunity title/description

      return {
        historicalWinner,
        historicalAvgAward,
        historicalAwardCount: total,
        competitionCount,
        incumbentProbability,
        agencySmallBizRate: agencyRates.smallBizRate,
        agencySdvosbRate: agencyRates.sdvosbRate,
        recompeteFlag,
        awards,
      };
    } catch (err) {
      logger.warn('USASpending enrichment failed', {
        naicsCode: params.naicsCode,
        agency: params.agency,
        error: (err as Error).message,
      });
      return this.emptyEnrichment();
    }
  }

  /**
   * Pull agency-level set-aside rates.
   * Queries small business and SDVOSB award percentages.
   */
  async getAgencySetAsideRates(
    agencyName: string
  ): Promise<{ smallBizRate: number; sdvosbRate: number }> {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [sbResponse, sdvosbResponse, totalResponse] = await Promise.allSettled([
        this.client.post('/search/spending_by_award/', {
          filters: {
            agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
            time_period: [{ start_date: startDate, end_date: endDate }],
            recipient_type_names: ['small_business'],
          },
          fields: ['Award Amount'],
          page: 1,
          limit: 1,
        }),
        this.client.post('/search/spending_by_award/', {
          filters: {
            agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
            time_period: [{ start_date: startDate, end_date: endDate }],
            recipient_type_names: ['service_disabled_veteran_owned_small_business'],
          },
          fields: ['Award Amount'],
          page: 1,
          limit: 1,
        }),
        this.client.post('/search/spending_by_award/', {
          filters: {
            agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
            time_period: [{ start_date: startDate, end_date: endDate }],
          },
          fields: ['Award Amount'],
          page: 1,
          limit: 1,
        }),
      ]);

      const sbTotal =
        sbResponse.status === 'fulfilled'
          ? sbResponse.value.data?.page_metadata?.total || 0
          : 0;
      const sdvosbTotal =
        sdvosbResponse.status === 'fulfilled'
          ? sdvosbResponse.value.data?.page_metadata?.total || 0
          : 0;
      const grandTotal =
        totalResponse.status === 'fulfilled'
          ? totalResponse.value.data?.page_metadata?.total || 1
          : 1;

      return {
        smallBizRate: Math.min(sbTotal / grandTotal, 1),
        sdvosbRate: Math.min(sdvosbTotal / grandTotal, 1),
      };
    } catch {
      return { smallBizRate: 0.25, sdvosbRate: 0.05 }; // Federal averages as fallback
    }
  }

  private emptyEnrichment(): EnrichmentResult {
    return {
      historicalWinner: null,
      historicalAvgAward: 0,
      historicalAwardCount: 0,
      competitionCount: 0,
      incumbentProbability: 0,
      agencySmallBizRate: 0.25,
      agencySdvosbRate: 0.05,
      recompeteFlag: false,
      awards: [],
    };
  }

  /**
   * Legacy method — kept for backward compatibility with scoring worker
   */
  computeAgencyAlignmentScore(
    stats: { sdvosbRate: number; totalAwards: number } | null,
    isSdvosb: boolean
  ): number {
    if (!stats) return 0.5;
    let score = 0.5;
    if (isSdvosb && stats.sdvosbRate > 0) {
      score += Math.min(stats.sdvosbRate * 2, 0.4);
    }
    if (stats.totalAwards > 1000) score += 0.1;
    else if (stats.totalAwards > 100) score += 0.05;
    return Math.min(score, 1.0);
  }
}

export const usaSpendingService = new UsaSpendingService();