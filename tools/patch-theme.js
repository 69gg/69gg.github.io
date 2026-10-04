'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Keep Latin/symbol declarations on the critical path; retain full CJK
 * declarations separately for devices without the installed Noto families. */
function coreFontCSS(css) {
    return '/* Generated from fonts.css by tools/patch-theme.js. */\n' + [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)]
        .filter((match) => {
            if (!/font-family:\s*'Folio Noto (?:Serif|Sans) SC'/.test(match[1])) return true;
            const ranges = [...match[1].matchAll(/U\+([\da-f]+)(?:-([\da-f]+))?/gi)];
            return !ranges.some(([, start, end = start]) => {
                const first = parseInt(start, 16), last = parseInt(end, 16);
                // Unified, compatibility and supplementary CJK ideographs.
                return [[0x3400, 0x9fff], [0xf900, 0xfaff], [0x20000, 0x323af]]
                    .some(([low, high]) => first <= high && last >= low);
            });
        })
        .map((match) => match[0]).join('\n');
}

/** Apply version-controlled theme overrides after npm installs the theme. */
function patchTheme(rootDir = path.resolve(__dirname, '..')) {
    const source = path.join(rootDir, '_theme_overrides', 'shiro');
    const target = path.join(rootDir, 'node_modules', 'hexo-theme-shiro');

    if (!fs.existsSync(path.join(target, 'package.json'))) {
        throw new Error('Shiro is not installed. Run npm ci before building.');
    }

    for (const directory of ['layout', 'source']) {
        const overrides = path.join(source, directory);
        if (!fs.existsSync(overrides)) {
            throw new Error(`Missing theme overrides: ${overrides}`);
        }
        fs.cpSync(overrides, path.join(target, directory), { recursive: true });
    }
    // Shiro excludes h1 in both TOC scanning and heading analysis. Keep its
    // existing tree, anchor and cache logic, and include all body heading levels.
    for (const name of ['toc', 'html-analysis']) {
        const file = path.join(target, 'scripts', 'lib', `${name}.js`);
        if (!fs.existsSync(file)) continue;
        const script = fs.readFileSync(file, 'utf8')
            .replaceAll('h[2-6]', 'h[1-6]')
            .replaceAll('Math.max(2, Number(tocConfig', 'Math.max(1, Number(tocConfig')
            .replace('let i = 2; i <= maxDepth;', 'let i = 1; i <= maxDepth;');
        fs.writeFileSync(file, script);
    }
    const vendor = path.join(target, 'source', 'js', 'vendor');
    fs.mkdirSync(vendor, { recursive: true });
    // Reuse the Markdown dependencies already installed by hexo-renderer-marked.
    for (const modulePath of ['marked/marked.min.js', 'dompurify/purify.min.js']) {
        fs.copyFileSync(require.resolve(modulePath, { paths: [rootDir] }), path.join(vendor, path.basename(modulePath)));
    }
    const fonts = path.join(source, 'source', 'css', 'fonts.css');
    if (fs.existsSync(fonts)) {
        fs.writeFileSync(path.join(target, 'source', 'css', 'fonts-core.css'), coreFontCSS(fs.readFileSync(fonts, 'utf8')));
    }
}

if (require.main === module) patchTheme();

module.exports = { patchTheme, coreFontCSS };
