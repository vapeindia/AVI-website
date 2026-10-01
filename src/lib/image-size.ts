import path from 'node:path';
import sharp from 'sharp';

const cache = new Map<string, Promise<{ width: number; height: number }>>();

/** Reads real pixel dimensions for a `public/`-relative image path (e.g.
 * "/images/campaigns/foo.jpg"), so `<Image>`/`<img>` can carry accurate
 * width/height for CLS prevention without hand-maintaining them. */
export function getImageSize(publicPath: string): Promise<{ width: number; height: number }> {
  const cached = cache.get(publicPath);
  if (cached) return cached;
  const absPath = path.join(process.cwd(), 'public', publicPath);
  const promise = sharp(absPath)
    .metadata()
    .then(({ width, height }) => ({ width: width ?? 0, height: height ?? 0 }));
  cache.set(publicPath, promise);
  return promise;
}
