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
  integrations: [sitemap()],
});
