import { readFileSync } from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;

const root = process.cwd();
const newsreaderBold = readFileSync(
  path.join(root, 'node_modules/@fontsource/newsreader/files/newsreader-latin-600-normal.woff')
);
const publicSans = readFileSync(
  path.join(root, 'node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff')
);
const publicSansBold = readFileSync(
  path.join(root, 'node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff')
);
const logoDataUri = `data:image/png;base64,${readFileSync(path.join(root, 'public/images/avi-logo.png')).toString('base64')}`;

/** Renders a 1200×630 branded OG/social card for the given page title — no
 * product imagery, just the title on AVI's own hero gradient with the
 * logo and wordmark, so every page gets a real (not generic) share card. */
export async function generateOgImage(title: string): Promise<Buffer> {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundImage: 'linear-gradient(135deg, #123c31 0%, #1f6f5c 100%)',
          fontFamily: 'Public Sans',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '16px' },
              children: [
                { type: 'img', props: { src: logoDataUri, width: 56, height: 56 } },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column' },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: 26, fontWeight: 700, color: '#ffffff' },
                          children: 'Association of Vapers India',
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: 18, color: '#7fc4a8' },
                          children: 'Tobacco harm reduction advocacy',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontFamily: 'Newsreader',
                fontSize: title.length > 60 ? 54 : 66,
                fontWeight: 600,
                lineHeight: 1.15,
                color: '#ffffff',
                maxWidth: '980px',
              },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', fontSize: 22, color: '#7fc4a8' },
              children: 'vapeindia.org',
            },
          },
        ],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Newsreader', data: newsreaderBold, weight: 600, style: 'normal' },
        { name: 'Public Sans', data: publicSans, weight: 400, style: 'normal' },
        { name: 'Public Sans', data: publicSansBold, weight: 700, style: 'normal' },
      ],
    }
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}
