import { getCollection } from 'astro:content';

// Public totals (count, amount, city breakdown) stay hidden below this many
// reports — a handful of submissions reads as "nobody's using this" and,
// worse, a literal ₹0 total undercuts the case the tracker exists to make.
// Single source of truth: both /report-harassment and the homepage's
// "Know your rights" section read `visible` from this module rather than
// each re-implementing the threshold check.
export const HARASSMENT_STATS_PUBLISH_THRESHOLD = 10;

export interface HarassmentStats {
  total: number;
  totalAmount: number;
  cashDemandedCount: number;
  notReturnedCount: number;
  topCities: { city: string; count: number }[];
  /** True once `total` has reached HARASSMENT_STATS_PUBLISH_THRESHOLD. */
  visible: boolean;
}

// Shared by /report-harassment and the "Know your rights" section of
// /india/law so the two pages can never drift out of sync on how a stat
// is defined. Computed at build time from the harassmentReports
// collection (src/content.config.ts) — see that file and
// functions/api/harassment-report.js for how entries get there.
export async function getHarassmentStats(): Promise<HarassmentStats> {
  const reports = await getCollection('harassmentReports');

  const total = reports.length;
  const totalAmount = reports.reduce((sum, r) => sum + (r.data.amount || 0), 0);
  const cashDemandedCount = reports.filter((r) => r.data.whatHappened.includes('cash_demanded')).length;
  const notReturnedCount = reports.filter((r) => r.data.deviceReturned === 'no').length;

  const cityCounts = new Map<string, number>();
  for (const r of reports) {
    const city = r.data.city.trim() || 'Other';
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  const topCities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([city, count]) => ({ city, count }));

  return {
    total,
    totalAmount,
    cashDemandedCount,
    notReturnedCount,
    topCities,
    visible: total >= HARASSMENT_STATS_PUBLISH_THRESHOLD,
  };
}
