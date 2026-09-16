import { getCollection } from 'astro:content';

export interface HarassmentStats {
  total: number;
  totalAmount: number;
  cashDemandedCount: number;
  notReturnedCount: number;
  fakeCopCount: number;
  topCities: { city: string; count: number }[];
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
  const fakeCopCount = reports.filter((r) => r.data.suspectedFakeCop === 'yes').length;

  const cityCounts = new Map<string, number>();
  for (const r of reports) {
    const city = r.data.city.trim() || 'Other';
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  const topCities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([city, count]) => ({ city, count }));

  return { total, totalAmount, cashDemandedCount, notReturnedCount, fakeCopCount, topCities };
}
