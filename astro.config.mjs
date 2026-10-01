// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` targets the production domain (vapeindia.org) rather than the
// current avi-website-9f9.pages.dev staging URL, since that's the
// canonical/sitemap domain search engines should index once DNS cuts
// over (see CLAUDE.md, Hosting/DNS section) — not what's live today.
// https://astro.build/config
export default defineConfig({
  site: 'https://vapeindia.org',
  // Canonicals and the sitemap already used the trailing-slash form
  // (/faq/) while every nav/footer/in-page link omitted it (/faq) — every
  // internal click took an extra 301 hop. 'always' makes Astro itself
  // enforce and generate the trailing-slash form consistently; every
  // internal href sitewide was updated to match in this same change.
  trailingSlash: 'always',
  integrations: [sitemap()],
});
