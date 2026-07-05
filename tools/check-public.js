'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const requiredFiles = [
    'index.html',
    path.join('blog', 'index.html'),
    'CNAME'
];

const failures = [];

const readText = (filePath) => fs.readFileSync(filePath, 'utf8').trim();

for (const relativePath of requiredFiles) {
    const filePath = path.join(publicDir, relativePath);
    if (!fs.existsSync(filePath)) {
        failures.push(`missing public artifact: ${relativePath}`);
        continue;
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size === 0) {
        failures.push(`invalid public artifact: ${relativePath}`);
    }
}

const sourceCnamePath = path.join(rootDir, 'source', 'CNAME');
const publicCnamePath = path.join(publicDir, 'CNAME');

if (fs.existsSync(sourceCnamePath) && fs.existsSync(publicCnamePath)) {
    const sourceCname = readText(sourceCnamePath);
    const publicCname = readText(publicCnamePath);

    if (sourceCname !== publicCname) {
        failures.push('public/CNAME does not match source/CNAME');
    }
}

const nestedCnamePath = path.join(publicDir, 'blog', 'CNAME');
if (fs.existsSync(nestedCnamePath)) {
    failures.push('unexpected nested CNAME: blog/CNAME');
}

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
}
