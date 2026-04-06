// =============================================================
// Agency Award Profiler
// Caches per-agency set-aside rates from USAspending
// agencyHistoryScore: how favorable is this agency for the client type?
// =============================================================
import axios from 'axios';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const USASPENDING_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const STALE_HOURS = 168; // weekly

export async function refreshAgencyProfile(agencyName: string): Promise<void> {
  if (!agencyName) return;

  const existing = await prisma.agencyAwardProfile.findUnique({
    where: { agencyName },
    select: { lastRefreshedAt: true },
  });
  if (existing) {
    const ageHours = (Date.now() - existing.lastRefreshedAt.getTime()) / 3600000;
    if (ageHours < STALE_HOURS) return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.post(USASPENDING_URL, {
      filters: {
        agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
        time_period: [{ start_date: '2021-01-01', end_date: today }],
        award_type_codes: ['A', 'B', 'C', 'D'],
      },
      fields: ['award_amount', 'type_of_set_aside', 'naics_code'],
      sort: 'award_amount', order: 'desc', limit: 100, page: 1,
    }, { timeout: 12000 });

    const results: any[] = response.data?.results ?? [];
    if (results.length === 0) return;

    const norm = (v: string | null | undefined): string => (v ?? '').toUpperCase();

    const sbCount = results.filter(
      (r: any) => !['', 'NONE', 'NO SET ASIDE USED'].includes(norm(r.type_of_set_aside))
    ).length;
    const sdvosbCount = results.filter(
      (r: any) => norm(r.type_of_set_aside).includes('SDVOSB') || norm(r.type_of_set_aside).includes('VOSB')
    ).length;
    const wosbCount = results.filter(
      (r: any) => norm(r.type_of_set_aside).includes('WOSB') || norm(r.type_of_set_aside).includes('EDWOSB')
    ).length;
    const hubzoneCount = results.filter(
      (r: any) => norm(r.type_of_set_aside).includes('HUBZONE') || norm(r.type_of_set_aside).includes('HUB ZONE')
    ).length;

    const awardValues = results.map((r: any) => r.award_amount).filter((v: any) => typeof v === 'number' && v > 0);
    const avgAwardValue = awardValues.length > 0
      ? awardValues.reduce((a: number, b: number) => a + b, 0) / awardValues.length : null;

    const naicsArr = [...new Set(results.map((r: any) => r.naics_code).filter(Boolean))] as string[];

    await prisma.agencyAwardProfile.upsert({
      where: { agencyName },
      create: {
        agencyName, avgAwardValue,
        smallBizRate: sbCount / results.length,
        sdvosbRate: sdvosbCount / results.length,
        womenOwnedRate: wosbCount / results.length,
        hubzoneRate: hubzoneCount / results.length,
        totalAwards: results.length,
        typicalNaics: naicsArr.slice(0, 10),
        lastRefreshedAt: new Date(),
      },
      update: {
        avgAwardValue,
        smallBizRate: sbCount / results.length,
        sdvosbRate: sdvosbCount / results.length,
        womenOwnedRate: wosbCount / results.length,
        hubzoneRate: hubzoneCount / results.length,
        totalAwards: results.length,
        typicalNaics: naicsArr.slice(0, 10),
        lastRefreshedAt: new Date(),
      },
    });

    logger.debug('Agency profile refreshed', { agencyName, totalAwards: results.length });
  } catch (err) {
    logger.debug('Agency profile refresh skipped', { agencyName, error: (err as Error).message });
  }
}

/**
 * 0-1 score: how historically favorable this agency is for the given client type.
 */
export async function getAgencyHistoryScore(
  agencyName: string,
  clientProfile: { sdvosb: boolean; wosb: boolean; hubzone: boolean; smallBusiness: boolean }
): Promise<number> {
  try {
    const profile = await prisma.agencyAwardProfile.findUnique({
      where: { agencyName },
      select: { sdvosbRate: true, womenOwnedRate: true, hubzoneRate: true, smallBizRate: true },
    });
    if (!profile) return 0.5;

    // Base: general small-biz spend share
    let score = profile.smallBizRate * 0.6;

    // Set-aside boosts for qualifying categories
    if (clientProfile.sdvosb) score += profile.sdvosbRate * 0.8;
    if (clientProfile.wosb)   score += profile.womenOwnedRate * 0.8;
    if (clientProfile.hubzone) score += profile.hubzoneRate * 0.8;

    return Math.max(0.05, Math.min(0.95, score));
  } catch {
    return 0.5;
  }
}
