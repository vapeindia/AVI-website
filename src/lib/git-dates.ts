import { execSync } from 'node:child_process';

/**
 * Real first/last commit dates for a file, for Article schema's
 * datePublished/dateModified — sourced from git history rather than a
 * hand-maintained date that silently goes stale. Falls back to `fallback`
 * (today) if git isn't available or the file has no history yet (a shallow
 * clone, a brand-new file not yet committed) — this must never throw and
 * break a build over metadata that's secondary to the page itself.
 */
export function getGitDates(filePath: string, fallback = new Date().toISOString().slice(0, 10)): { published: string; modified: string } {
  try {
    const log = execSync(`git log --follow --format=%ad --date=short -- "${filePath}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const dates = log.split('\n').filter(Boolean);
    if (dates.length === 0) return { published: fallback, modified: fallback };
    return { published: dates[dates.length - 1], modified: dates[0] };
  } catch {
    return { published: fallback, modified: fallback };
  }
}
