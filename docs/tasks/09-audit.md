Final audit before I publish anything. Report only; don't change content. Branch: chore/audit.

1. Build and run a link checker (lychee or linkinator) over internal and external links. List broken links and any internal link that redirects.
2. Serve dist with `npx wrangler pages dev dist`. Request 20 old URLs from docs/redirect-map.csv and confirm each returns a 301 to the right page. Confirm a made-up URL returns 404.
3. Run the CI content guard across the whole site and list everything it flags.
4. Run Lighthouse (mobile) on /, /india/law/, /faq/, /science/ and /press/ and report the scores.
5. Check every page has a unique title, a meta description, a trailing-slash canonical, its own og:image and JSON-LD that parses.
6. Collect every "Needs Samrat" item across open PRs, grouped by page.

Write it up in docs/audit-2026-10.md and open a PR.
