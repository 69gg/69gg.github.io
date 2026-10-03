'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { preloadAssets } = require('../scripts/folio-preloads');

const root = path.resolve(__dirname, '..');
const source = path.join(root, '_theme_overrides', 'shiro', 'source');

test('preloads follow changed CSS assets and match mask/font CORS requests', () => {
    const assets = preloadAssets(`
        :root { --folio-brand-font: 'Display'; --folio-date-font: 'Dates'; }
        .folio-pattern { background: url('../images/new-paper.webp'); }
        .frame { background: url('../images/new-corner.svg'); }
        .sheet { mask: url('../images/new-edge.svg'), url('../images/new-edge.svg'); }
    `, `
        @font-face { font-family: 'Display'; src: url(../fonts/display/updated.woff2); unicode-range: U+0000-00FF; }
        @font-face { font-family: 'Display'; src: url(../fonts/display/other.woff2); unicode-range: U+0100-02BA; }
        @font-face { font-family: 'Unused'; src: url(../fonts/unused/latin.woff2); unicode-range: U+0000-00FF; }
    `);
    assert.equal(assets.length, 4);
    assert.deepEqual(assets.find((asset) => asset.path.endsWith('new-paper.webp')), { path: 'images/new-paper.webp', as: 'image', type: 'image/webp', priority: 'high', crossorigin: false });
    assert.equal(assets.find((asset) => asset.path.endsWith('new-corner.svg')).crossorigin, false);
    assert.equal(assets.find((asset) => asset.path.endsWith('new-edge.svg')).crossorigin, true);
    assert.deepEqual(assets.find((asset) => asset.as === 'font'), { path: 'fonts/display/updated.woff2', as: 'font', type: 'font/woff2', priority: 'auto', crossorigin: true });
});

test('all visual preloads exist and appear before optional fetches on every blog page', () => {
    const assets = preloadAssets(fs.readFileSync(path.join(source, 'css', 'folio.css'), 'utf8'), fs.readFileSync(path.join(source, 'css', 'fonts.css'), 'utf8'));
    assert.equal(new Set(assets.map((asset) => asset.path)).size, assets.length);
    assert.equal(assets.filter((asset) => asset.priority === 'high').length, 1);
    assert.equal(assets.filter((asset) => asset.as === 'font').length, 2);
    for (const asset of assets) assert.ok(fs.statSync(path.join(source, asset.path)).size > 0);
    const config = require('js-yaml').load(fs.readFileSync(path.join(root, '_config.yml'), 'utf8'));
    const article = fs.readdirSync(path.join(root, 'source', '_posts')).find((name) => name.endsWith('.md'));
    const link = fs.readFileSync(path.join(root, 'source', '_posts', article), 'utf8').match(/^abbrlink:\s*(\S+)/m)[1];
    for (const route of ['index.html', 'archives/index.html', 'page/2/index.html', `posts/${link}/index.html`]) {
        const html = fs.readFileSync(path.join(root, config.public_dir, route), 'utf8');
        const head = html.split('</head>')[0];
        assert.equal([...head.matchAll(/<link\b[^>]*\bdata-folio-preload\b/g)].length, assets.length);
        for (const asset of assets) assert.ok(head.includes(`href="${config.root}${asset.path}"`));
        assert.ok(head.indexOf('data-folio-preload') < head.indexOf('rel="prefetch"'));
        assert.ok(head.indexOf('js/folio-preload.js') < head.indexOf('mathjax') || !head.includes('mathjax'));
    }
});
