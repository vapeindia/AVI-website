import { getCollection, type CollectionEntry } from 'astro:content';

export type NewsItem = CollectionEntry<'news'>;

export interface DayGroup {
  dateKey: string;
  date: Date;
  items: NewsItem[];
  digestText?: string;
}
export interface WeekBlock {
  weekStart: string;
  weekEnd?: Date;
  weeklySummary?: string;
  days: DayGroup[];
}
export interface MonthBlock {
  month: string;
  monthlySummary?: string;
  weeks: WeekBlock[];
  itemCount: number;
}

// Monday of the ISO week containing `date` — matches
// scripts/generate-weekly-digest.mjs's isoWeekStart() exactly, so a week
// grouped here lines up with whichever weekly digest that script wrote.
function isoWeekStartKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}
function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Builds the full day -> week -> month grouping, with each block's own
 * digest text already attached — so a component rendering a MonthBlock
 * never needs a separate digest-lookup map in scope, just the object. */
export async function buildMonthBlocks(): Promise<MonthBlock[]> {
  const items = (await getCollection('news', ({ data }) => data.reviewed))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const digests = await getCollection('newsDigests');
  const dailyDigestByDate = new Map(
    digests.filter((d) => d.data.type === 'daily' || !d.data.type).map((d) => [d.data.date.toISOString().slice(0, 10), d.data.summary]),
  );
  const weeklyDigestByWeekStart = new Map(
    digests.filter((d) => d.data.type === 'weekly').map((d) => [d.data.date.toISOString().slice(0, 10), d.data]),
  );
  const monthlyDigestByMonth = new Map(
    digests.filter((d) => d.data.type === 'monthly').map((d) => [d.data.date.toISOString().slice(0, 7), d.data]),
  );

  const dayGroups: DayGroup[] = [];
  for (const item of items) {
    const dateKey = item.data.date.toISOString().slice(0, 10);
    const group = dayGroups[dayGroups.length - 1];
    if (group && group.dateKey === dateKey) {
      group.items.push(item);
    } else {
      dayGroups.push({ dateKey, date: item.data.date, items: [item], digestText: dailyDigestByDate.get(dateKey) });
    }
  }

  const now = new Date();
  const currentWeekStart = isoWeekStartKey(now);
  const currentMonth = monthKey(now);

  const weekBlocks: WeekBlock[] = [];
  for (const day of dayGroups) {
    const weekStart = isoWeekStartKey(day.date);
    const weekly = weekStart === currentWeekStart ? null : (weeklyDigestByWeekStart.get(weekStart) ?? null);
    const block = weekBlocks[weekBlocks.length - 1];
    if (block && block.weekStart === weekStart) {
      block.days.push(day);
    } else {
      weekBlocks.push({ weekStart, weekEnd: weekly?.weekEnd, weeklySummary: weekly?.summary, days: [day] });
    }
  }

  const monthBlocks: MonthBlock[] = [];
  for (const week of weekBlocks) {
    const month = monthKey(week.days[0].date);
    const monthly = month === currentMonth ? null : (monthlyDigestByMonth.get(month) ?? null);
    const itemCount = week.days.reduce((n, d) => n + d.items.length, 0);
    const block = monthBlocks[monthBlocks.length - 1];
    if (block && block.month === month) {
      block.weeks.push(week);
      block.itemCount += itemCount;
    } else {
      monthBlocks.push({ month, monthlySummary: monthly?.summary, weeks: [week], itemCount });
    }
  }

  return monthBlocks;
}

/** Greedily bins whole months into pages, each holding roughly `pageSize`
 * items — never splitting a month across two pages (that would break its
 * own digest/week/day structure mid-page). A month alone bigger than
 * pageSize still gets its own page rather than being dropped or split. */
export function chunkMonthsByItemCount(months: MonthBlock[], pageSize: number): MonthBlock[][] {
  const pages: MonthBlock[][] = [];
  let current: MonthBlock[] = [];
  let currentCount = 0;
  for (const month of months) {
    if (current.length > 0 && currentCount + month.itemCount > pageSize) {
      pages.push(current);
      current = [];
      currentCount = 0;
    }
    current.push(month);
    currentCount += month.itemCount;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}
