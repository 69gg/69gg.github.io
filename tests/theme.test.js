'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const yaml = require('js-yaml');
const { patchTheme } = require('../tools/patch-theme');

const rootDir = path.resolve(__dirname, '..');
const config = yaml.load(fs.readFileSync(path.join(rootDir, '_config.yml'), 'utf8'));
const publicDir = path.join(rootDir, config.public_dir);

test('presentation overrides survive fresh installs and repeated builds without removing upstream assets', (t) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-theme-'));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    const themeDir = path.join(fixture, 'node_modules', 'hexo-theme-shiro');
    const overrides = path.join(fixture, '_theme_overrides', 'shiro');
    fs.mkdirSync(path.join(themeDir, 'source', 'js'), { recursive: true });
    fs.mkdirSync(path.join(overrides, 'layout'), { recursive: true });
    fs.mkdirSync(path.join(overrides, 'source', 'css'), { recursive: true });
    fs.writeFileSync(path.join(themeDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(themeDir, 'source', 'js', 'search.js'), 'upstream search');
    fs.writeFileSync(path.join(overrides, 'layout', 'index.njk'), 'first design');
    fs.writeFileSync(path.join(overrides, 'source', 'css', 'folio.css'), 'folio styles');
    patchTheme(fixture);
    fs.writeFileSync(path.join(overrides, 'layout', 'index.njk'), 'revised design');
    patchTheme(fixture);
    assert.equal(fs.readFileSync(path.join(themeDir, 'layout', 'index.njk'), 'utf8'), 'revised design');
    assert.equal(fs.readFileSync(path.join(themeDir, 'source', 'css', 'folio.css'), 'utf8'), 'folio styles');
    assert.equal(fs.readFileSync(path.join(themeDir, 'source', 'js', 'search.js'), 'utf8'), 'upstream search');
});

test('missing theme gives an actionable install error', () => {
    assert.throws(() => patchTheme(path.join(os.tmpdir(), 'missing-folio-theme')), /npm ci/);
});

test('all source articles keep their permanent URLs and search coverage', () => {
    const posts = fs.readdirSync(path.join(rootDir, 'source', '_posts')).filter((name) => name.endsWith('.md'));
    for (const filename of posts) {
        const source = fs.readFileSync(path.join(rootDir, 'source', '_posts', filename), 'utf8');
        const abbrlink = source.match(/^abbrlink:\s*(\S+)/m)[1];
        const output = fs.readFileSync(path.join(publicDir, 'posts', abbrlink, 'index.html'), 'utf8');
        assert.match(output, /data-pagefind-body/, `${filename} stays searchable`);
        assert.match(output, /id="giscus-container"/, `${filename} keeps comments`);
        assert.match(output, /id="progressBar"/, `${filename} keeps reading progress`);
    }
    assert.ok(fs.existsSync(path.join(publicDir, 'pagefind', 'pagefind.js')));
    assert.ok(fs.existsSync(path.join(publicDir, 'atom.xml')));
});

test('root homepage and verification files are copied byte for byte', () => {
    for (const filename of ['index.html', 'img.json', 'tencent12920023829422040825.txt']) {
        assert.deepEqual(fs.readFileSync(path.join(rootDir, 'homepage', filename)), fs.readFileSync(path.join(rootDir, 'public', filename)));
    }
});

test('random reading stays on the preview origin and contains articles only', () => {
    const output = fs.readFileSync(path.join(publicDir, 'random', 'index.html'), 'utf8');
    const targets = [...output.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]).filter((value) => value.startsWith(config.root));
    const count = fs.readdirSync(path.join(rootDir, 'source', '_posts')).filter((name) => name.endsWith('.md')).length;
    assert.equal(targets.length, count);
    for (const target of targets) {
        assert.ok(target.startsWith(`${config.root}posts/`));
        assert.ok(fs.existsSync(path.join(rootDir, 'public', target, 'index.html')));
    }
    assert.ok(!output.includes(new URL(config.url).origin));
});
