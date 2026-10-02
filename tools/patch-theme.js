'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Apply version-controlled presentation overrides after npm installs the theme. */
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
}

if (require.main === module) patchTheme();

module.exports = { patchTheme };
