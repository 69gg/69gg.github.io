'use strict';

const fs = require('fs');
const path = require('path');
const crc16 = require('hexo-abbrlink/lib/crc16');
const crc32 = require('hexo-abbrlink/lib/crc32');

const rootDir = path.resolve(__dirname, '..');
const postsDir = path.join(rootDir, 'source', '_posts');
const configText = fs.readFileSync(path.join(rootDir, '_config.yml'), 'utf8');
const abbrlinkBlock = configText.match(/^abbrlink:\n((?:  .+\n?)*)/m);
const algorithm = (abbrlinkBlock && abbrlinkBlock[1].match(/^\s+alg:\s*(\S+)/m)?.[1]) || 'crc16';
const representation = (abbrlinkBlock && abbrlinkBlock[1].match(/^\s+rep:\s*(\S+)/m)?.[1]) || 'dec';
const usedAbbrlinks = new Set();

function formatAbbrlink(title) {
    const raw = algorithm === 'crc32' ? crc32.str(title) >>> 0 : crc16(title) >>> 0;
    let value = raw;

    while (usedAbbrlinks.has(value)) {
        value += 1;
    }

    usedAbbrlinks.add(value);
    return representation === 'hex' ? value.toString(16) : String(value);
}

function parseFrontMatter(lines, fileName) {
    if (lines[0] !== '---') {
        throw new Error(`Missing front matter in ${fileName}`);
    }

    const endIndex = lines.indexOf('---', 1);
    if (endIndex === -1) {
        throw new Error(`Unclosed front matter in ${fileName}`);
    }

    return { endIndex, frontMatter: lines.slice(1, endIndex) };
}

for (const fileName of fs.readdirSync(postsDir).sort()) {
    if (!fileName.endsWith('.md')) {
        continue;
    }

    const filePath = path.join(postsDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const { endIndex, frontMatter } = parseFrontMatter(lines, fileName);
    const titleLine = frontMatter.find(line => line.startsWith('title: '));
    if (!titleLine) {
        throw new Error(`Missing title in ${fileName}`);
    }

    const existingAbbrlink = frontMatter.find(line => line.startsWith('abbrlink: '));
    if (existingAbbrlink) {
        const value = existingAbbrlink.replace(/^abbrlink:\s*/, '').trim();
        usedAbbrlinks.add(Number.parseInt(value, representation === 'hex' ? 16 : 10));
        continue;
    }

    const title = titleLine.replace(/^title:\s*/, '').trim();
    const dateMatch = content.match(/^(date: .*)(\r?\n)/m);
    if (!dateMatch) {
        throw new Error(`Missing date in ${fileName}`);
    }

    const insertAt = dateMatch.index;
    const newline = dateMatch[2];
    const updated = `${content.slice(0, insertAt)}abbrlink: ${formatAbbrlink(title)}${newline}${content.slice(insertAt)}`;
    fs.writeFileSync(filePath, updated, 'utf8');
}
