'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const homepageDir = path.join(rootDir, 'homepage');

const files = [
    [path.join(homepageDir, 'index.html'), path.join(publicDir, 'index.html')],
    [path.join(homepageDir, 'img.json'), path.join(publicDir, 'img.json')],
    [path.join(rootDir, 'source', 'CNAME'), path.join(publicDir, 'CNAME')]
];

fs.mkdirSync(publicDir, { recursive: true });

for (const [source, target] of files) {
    fs.copyFileSync(source, target);
}
