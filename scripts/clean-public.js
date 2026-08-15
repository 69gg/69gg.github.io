'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

for (const relativePath of ['public', 'db.json']) {
    fs.rmSync(path.join(rootDir, relativePath), { force: true, recursive: true });
}
