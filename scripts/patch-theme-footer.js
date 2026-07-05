'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const overridePath = path.join(rootDir, '_theme_overrides', 'shiro', 'footer.njk');
const footerPath = path.join(
    rootDir,
    'node_modules',
    'hexo-theme-shiro',
    'layout',
    '_partial',
    'common',
    'footer.njk'
);

if (!fs.existsSync(overridePath)) {
    throw new Error(`Missing Shiro footer override: ${overridePath}`);
}

if (!fs.existsSync(path.dirname(footerPath))) {
    throw new Error(`Missing Shiro theme footer directory: ${path.dirname(footerPath)}`);
}

fs.copyFileSync(overridePath, footerPath);
