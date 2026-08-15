'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const requiredFiles = [
    'index.html',
    path.join('blog', 'index.html'),
    'CNAME',
    'sitemap.xml',
    'robots.txt'
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

const nestedSitemapPath = path.join(publicDir, 'blog', 'sitemap.xml');
if (fs.existsSync(nestedSitemapPath)) {
    failures.push('unexpected nested sitemap: blog/sitemap.xml');
}

const lastmodFor = (sitemap, loc) => {
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = sitemap.match(new RegExp(`<loc>${escaped}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
    return match ? match[1] : null;
};

const sitemapPath = path.join(publicDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
    const sitemap = readText(sitemapPath);
    if (!sitemap.includes('<loc>https://www.pylindex.top/</loc>')) {
        failures.push('public/sitemap.xml is missing homepage URL');
    }
    if (!sitemap.includes('https://www.pylindex.top/blog')) {
        failures.push('public/sitemap.xml is missing blog URL');
    }

    const postsDir = path.join(rootDir, 'source', '_posts');
    if (fs.existsSync(postsDir)) {
        for (const fileName of fs.readdirSync(postsDir).sort()) {
            if (!fileName.endsWith('.md')) {
                continue;
            }

            const content = fs.readFileSync(path.join(postsDir, fileName), 'utf8');
            const abbrlink = content.match(/^abbrlink:\s*(\S+)/m);
            const date = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
            if (!abbrlink || !date) {
                failures.push(`${fileName} is missing abbrlink or date`);
                continue;
            }

            const loc = `https://www.pylindex.top/blog/posts/${abbrlink[1]}/`;
            const lastmod = lastmodFor(sitemap, loc);
            if (lastmod !== date[1]) {
                failures.push(`${fileName}: expected lastmod ${date[1]}, got ${lastmod}`);
            }
        }
    }

    const blogDates = [...sitemap.matchAll(/<loc>https:\/\/www\.pylindex\.top\/blog\/posts\/[^<]+<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
        .map((match) => match[1])
        .sort();
    const latestPostLastmod = blogDates.at(-1) || null;
    const blogLastmod = lastmodFor(sitemap, 'https://www.pylindex.top/blog');
    if (latestPostLastmod && blogLastmod !== latestPostLastmod) {
        failures.push(`blog index lastmod should be latest post date ${latestPostLastmod}, got ${blogLastmod}`);
    }

    if (!lastmodFor(sitemap, 'https://www.pylindex.top/')) {
        failures.push('public/sitemap.xml is missing homepage lastmod');
    }
    if (!lastmodFor(sitemap, 'https://www.pylindex.top/blog/guestbook/index.html')) {
        failures.push('public/sitemap.xml is missing guestbook lastmod');
    }

    const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
    if (lastmods.length > 1 && new Set(lastmods).size === 1) {
        failures.push('public/sitemap.xml lastmod values are all identical');
    }
}

const robotsPath = path.join(publicDir, 'robots.txt');
if (fs.existsSync(robotsPath)) {
    const robots = readText(robotsPath);
    if (!robots.includes('Sitemap: https://www.pylindex.top/sitemap.xml')) {
        failures.push('public/robots.txt is missing Sitemap directive');
    }
}

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
}
