'use strict';

const fs = require('fs');
const path = require('path');
const { formatShanghaiDate, lastCommitDate, latestCommitDate } = require('../tools/git-lastmod');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const blogDir = path.join(publicDir, 'blog');
const homeUrl = 'https://www.pylindex.top/';
const blogUrl = 'https://www.pylindex.top/blog';

function frontMatterDate(content) {
    const match = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
    return match ? match[1] : null;
}

function frontMatterAbbrlink(content) {
    const match = content.match(/^abbrlink:\s*(\S+)/m);
    return match ? match[1] : null;
}

function collectLastmods() {
    const lastmods = new Map();
    const postsDir = path.join(rootDir, 'source', '_posts');
    const postDates = [];

    if (fs.existsSync(postsDir)) {
        for (const fileName of fs.readdirSync(postsDir).sort()) {
            if (!fileName.endsWith('.md')) {
                continue;
            }

            const content = fs.readFileSync(path.join(postsDir, fileName), 'utf8');
            const abbrlink = frontMatterAbbrlink(content);
            const date = frontMatterDate(content);
            if (!abbrlink || !date) {
                continue;
            }

            lastmods.set(`${blogUrl}/posts/${abbrlink}/`, date);
            postDates.push(date);
        }
    }

    const pageFiles = {
        [`${blogUrl}/categories/index.html`]: path.join('source', 'categories', 'index.md'),
        [`${blogUrl}/tags/index.html`]: path.join('source', 'tags', 'index.md'),
        [`${blogUrl}/guestbook/index.html`]: path.join('source', 'guestbook', 'index.md')
    };

    for (const [loc, relativePath] of Object.entries(pageFiles)) {
        const lastmod = formatShanghaiDate(lastCommitDate(rootDir, relativePath));
        if (lastmod) {
            lastmods.set(loc, lastmod);
        }
    }

    const blogLastmod = postDates.sort().at(-1);
    if (blogLastmod) {
        lastmods.set(blogUrl, blogLastmod);
        lastmods.set(`${blogUrl}/`, blogLastmod);
    }

    const homeLastmod = formatShanghaiDate(latestCommitDate(rootDir, [
        path.join('homepage', 'index.html'),
        path.join('homepage', 'img.json')
    ]));
    if (homeLastmod) {
        lastmods.set(homeUrl, homeLastmod);
    }

    return lastmods;
}

function applyLastmods(xml, lastmods) {
    return xml.replace(
        /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>[^<]*<\/lastmod>)?/g,
        (full, loc) => {
            const next = lastmods.get(loc);
            if (!next) {
                return full;
            }

            return full.replace(
                /<loc>[^<]+<\/loc>\s*(?:<lastmod>[^<]*<\/lastmod>)?/,
                `<loc>${loc}</loc>\n    <lastmod>${next}</lastmod>`
            );
        }
    ).replace(/\n{3,}/g, '\n\n');
}

const insertHomeUrl = (xml, lastmods) => {
    const homeLastmod = lastmods.get(homeUrl);
    const homeUrlEntry = [
        '  <url>',
        `    <loc>${homeUrl}</loc>`,
        homeLastmod ? `    <lastmod>${homeLastmod}</lastmod>` : null,
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>'
    ].filter(Boolean).join('\n');

    let next = xml;
    if (!next.includes(`<loc>${homeUrl}</loc>`)) {
        const urlsetMatch = next.match(/<urlset[^>]*>/);
        if (!urlsetMatch) {
            throw new Error('invalid sitemap.xml: missing <urlset>');
        }

        const insertAt = urlsetMatch.index + urlsetMatch[0].length;
        next = `${next.slice(0, insertAt)}\n${homeUrlEntry}${next.slice(insertAt)}`;
    }

    return applyLastmods(next, lastmods);
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

    const lastmods = collectLastmods();
    promoteFile('sitemap.xml', (xml) => insertHomeUrl(xml, lastmods), true);
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
