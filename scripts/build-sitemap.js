'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const blogDir = path.join(publicDir, 'blog');
const homeUrl = 'https://www.pylindex.top/';
const blogUrl = 'https://www.pylindex.top/blog';

const today = new Date().toISOString().slice(0, 10);
const homeUrlEntry = [
    '  <url>',
    `    <loc>${homeUrl}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>'
].join('\n');

const insertHomeUrl = (xml) => {
    if (xml.includes(`<loc>${homeUrl}</loc>`)) {
        return xml;
    }

    const urlsetMatch = xml.match(/<urlset[^>]*>/);
    if (!urlsetMatch) {
        throw new Error('invalid sitemap.xml: missing <urlset>');
    }

    const insertAt = urlsetMatch.index + urlsetMatch[0].length;
    return `${xml.slice(0, insertAt)}\n${homeUrlEntry}${xml.slice(insertAt)}`;
};

const prependHomeUrl = (text) => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.includes(homeUrl)) {
        lines.unshift(homeUrl);
    }
    return `${lines.join('\n')}\n`;
};

const promoteFile = (fileName, transform, required) => {
    const source = path.join(blogDir, fileName);
    const target = path.join(publicDir, fileName);

    if (!fs.existsSync(source)) {
        if (required) {
            throw new Error(`missing public/blog/${fileName}`);
        }
        return;
    }

    fs.writeFileSync(target, transform(fs.readFileSync(source, 'utf8')));
    fs.rmSync(source);
};

const promoteSitemaps = () => {
    if (!fs.existsSync(blogDir)) {
        throw new Error('missing public/blog');
    }

    promoteFile('sitemap.xml', insertHomeUrl, true);
    promoteFile('sitemap.txt', prependHomeUrl, false);

    fs.writeFileSync(path.join(publicDir, 'robots.txt'), [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${homeUrl}sitemap.xml`,
        ''
    ].join('\n'));

    const sitemapXml = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    if (!sitemapXml.includes(`<loc>${homeUrl}</loc>`) || !sitemapXml.includes(blogUrl)) {
        throw new Error('promoted sitemap.xml is missing homepage or blog URLs');
    }
};

if (typeof hexo === 'undefined') {
    promoteSitemaps();
}
