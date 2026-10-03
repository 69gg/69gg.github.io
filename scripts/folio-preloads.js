'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Derive URLs from the actual styles so changing an asset never leaves a
// stale preload (or a second URL with a different cache-busting query).
const assetPaths = (css) => [...css.matchAll(/url\(['"]?\.\.\/([^'"\)]+)['"]?\)/g)].map((match) => match[1]);

function preloadAssets(folioCSS, fontsCSS) {
    const wallpaper = assetPaths(folioCSS.match(/\.folio-pattern\s*\{([^}]+)\}/)?.[1] || '')[0];
    const masks = new Set([...folioCSS.matchAll(/mask\s*:\s*([^;]+);/g)].flatMap((match) => assetPaths(match[1])));
    const images = [...new Set(assetPaths(folioCSS))].map((asset) => ({
        path: asset,
        as: 'image',
        type: asset.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
        priority: asset === wallpaper ? 'high' : 'auto',
        crossorigin: masks.has(asset)
    }));
    const families = new Set([...folioCSS.matchAll(/--folio-(?:brand|date)-font:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
    const fonts = [...fontsCSS.matchAll(/@font-face\s*\{([^}]+)\}/g)].flatMap((match) => {
        const family = match[1].match(/font-family:\s*['"]([^'"]+)['"]/)?.[1];
        if (!families.has(family) || !/unicode-range:\s*U\+0000-00FF/i.test(match[1])) return [];
        return assetPaths(match[1]).map((asset) => ({ path: asset, as: 'font', type: 'font/woff2', priority: 'auto', crossorigin: true }));
    });
    return [...images, ...fonts];
}

if (typeof hexo !== 'undefined') {
    const source = path.resolve(__dirname, '..', '_theme_overrides', 'shiro', 'source');
    const assets = preloadAssets(fs.readFileSync(path.join(source, 'css', 'folio.css'), 'utf8'), fs.readFileSync(path.join(source, 'css', 'fonts.css'), 'utf8'));
    hexo.extend.helper.register('folio_preloads', () => assets);
}

module.exports = { preloadAssets };
