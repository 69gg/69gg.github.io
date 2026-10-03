'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Derive URLs from the actual styles so changing an asset never leaves a
// stale preload (or a second URL with a different cache-busting query).
const assetPaths = (css) => [...css.matchAll(/url\(['"]?\.\.\/([^'"\)]+)['"]?\)/g)].map((match) => match[1]);

function preloadAssets(folioCSS) {
    const wallpaper = assetPaths(folioCSS.match(/\.folio-pattern\s*\{([^}]+)\}/)?.[1] || '')[0];
    const masks = new Set([...folioCSS.matchAll(/mask\s*:\s*([^;]+);/g)].flatMap((match) => assetPaths(match[1])));
    const images = [...new Set(assetPaths(folioCSS))].map((asset) => ({
        path: asset,
        as: 'image',
        type: asset.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
        priority: asset === wallpaper ? 'high' : 'auto',
        crossorigin: masks.has(asset)
    }));
    // Fonts are discovered by CSS after it selects the installed family.
    // Preloading a fallback would download it even when it is never used.
    return images;
}

if (typeof hexo !== 'undefined') {
    const source = path.resolve(__dirname, '..', '_theme_overrides', 'shiro', 'source');
    const assets = preloadAssets(fs.readFileSync(path.join(source, 'css', 'folio.css'), 'utf8'));
    hexo.extend.helper.register('folio_preloads', () => assets);
}

module.exports = { preloadAssets };
