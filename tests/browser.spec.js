'use strict';

const { test, expect } = require('@playwright/test');
const { preloadAssets } = require('../scripts/folio-preloads');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const rootDir = path.resolve(__dirname, '..');
const config = yaml.load(fs.readFileSync(path.join(rootDir, '_config.yml'), 'utf8'));
const theme = yaml.load(fs.readFileSync(path.join(rootDir, '_config.shiro.yml'), 'utf8'));
const blog = config.root;
const visualAssets = preloadAssets(
    fs.readFileSync(path.join(rootDir, '_theme_overrides/shiro/source/css/folio.css'), 'utf8'),
    fs.readFileSync(path.join(rootDir, '_theme_overrides/shiro/source/css/fonts.css'), 'utf8')
);
const posts = fs.readdirSync(path.join(rootDir, 'source', '_posts')).filter((name) => name.endsWith('.md')).map((name) => {
    const source = fs.readFileSync(path.join(rootDir, 'source', '_posts', name), 'utf8');
    return { source, ...yaml.load(source.match(/^---\n([\s\S]*?)\n---/)[1]) };
}).sort((a, b) => b.date - a.date);
const postURL = (post) => `${blog}posts/${post.abbrlink}/`;

// These checks allow local fonts and assets while excluding third-party
// MathJax and comments so their availability cannot mask regressions.
test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.origin === baseURL ? route.continue() : route.abort();
    });
});

test('home, article navigation, archives and pagination retain the real content', async ({ page }) => {
    await page.goto(blog);
    await expect(page.locator('#folio-title')).toHaveText(config.title);
    await expect(page.locator('.folio-header').getByText(config.title, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: config.title, exact: true })).toHaveCount(1);
    await expect(page.locator('.folio-colophon')).toContainText(config.title);
    await expect(page.locator('.folio-footer')).not.toContainText(/Powered by|Based on|风过留痕/);
    await expect(page.getByRole('heading', { name: '最新文章', exact: true })).toHaveCount(0);
    const archive = page.locator('.folio-hero').getByRole('link', { name: /^全部文章/ });
    await expect(archive).toContainText(String(posts.length));
    await archive.click();
    await expect(page.locator('h1')).toContainText('归档');
    await page.goto(blog);
    await expect(page.locator('.folio-entry')).toHaveCount(config.index_generator.per_page);
    await expect(page.locator('.folio-entry h2').first()).toBeInViewport();
    for (const entry of await page.locator('.folio-entry').all()) {
        await expect(entry.locator('time')).toHaveCount(1);
        await expect(entry.locator('.folio-entry-content time')).toHaveCount(0);
        await expect(entry.locator('.folio-entry-date')).toHaveAccessibleName(/\d{4}年\d+月\d+日/);
        await expect(entry.locator('.folio-entry-date')).toHaveAttribute('href', /archives\/\d{4}\//);
    }
    const excerpt = page.locator('.folio-excerpt p').first();
    await expect(excerpt).toHaveCSS('font-style', 'italic');
    await expect(excerpt).toHaveCSS('font-family', await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily));
    for (const item of theme.menu) {
        await expect(page.locator('.folio-desktop-nav').getByRole('link', { name: item.name, exact: true })).toBeVisible();
    }
    await expect(page.locator('.folio-desktop-nav a')).toHaveCount(theme.menu.length);
    await page.getByRole('heading', { name: posts[0].title, exact: true }).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`${postURL(posts[0])}$`));
    await expect(page.locator('[data-pagefind-meta="title"]')).toHaveText(posts[0].title);
    await expect(page.locator('.folio-footer')).not.toContainText(/Powered by|Based on/);
    await expect(page.locator('.prose-shiro')).toContainText(posts[0].source.split('---')[2].match(/[\u4e00-\u9fff]{4,}/)[0]);
    const homeLink = page.locator('.folio-brand');
    await expect(homeLink).toHaveText(config.title);
    await homeLink.click();
    await expect(page).toHaveURL(new RegExp(`${blog}$`));
    await page.goto(`${blog}archives/`);
    await expect(page.locator('h1')).toContainText('归档');
    await page.goto(blog);
    await page.locator('.pagination').getByRole('link', { name: '2', exact: true }).click();
    await expect(page.locator('.folio-entry')).toHaveCount(posts.length - config.index_generator.per_page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(config.title);
    await expect(page.locator('.folio-header').getByText(config.title, { exact: true })).toHaveCount(0);
    await expect(page.locator('.folio-hero').getByRole('link', { name: /^全部文章/ })).toBeVisible();
});

test('Pagefind finds a Chinese article and closes with Escape', async ({ page }) => {
    await page.goto(blog);
    await page.locator('#searchToggle').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input').fill(posts[0].title);
    await expect(dialog.getByRole('link', { name: posts[0].title, exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: posts[0].title, exact: true })).toHaveAttribute('href', postURL(posts[0]));
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#searchToggle')).toBeFocused();
});

test('all typography renders from bundled fonts with external requests blocked', async ({ page, baseURL }) => {
    const fontRequests = [];
    page.on('request', (request) => { if (request.resourceType() === 'font') fontRequests.push(request.url()); });
    await page.goto(blog);
    await page.evaluate(() => document.fonts.ready);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    for (const [selector, family] of [
        ['#folio-title', 'Great Vibes'],
        ['.folio-entry h2', 'Noto Serif SC'],
        ['.folio-excerpt p', 'Noto Serif SC'],
        ['.folio-day', 'Cormorant Garamond'],
        ['.folio-nav-link', 'Noto Sans SC']
    ]) {
        const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.every((font) => font.isCustomFont)).toBe(true);
        expect(fonts.some((font) => font.familyName.startsWith(family)), `${selector}: ${JSON.stringify(fonts)}`).toBe(true);
    }
    await session.detach();
    const technical = posts.find((post) => post.source.includes('```'));
    await page.goto(postURL(technical));
    await expect(page.locator('figure.highlight .code .line').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const articleSession = await page.context().newCDPSession(page);
    await articleSession.send('DOM.enable');
    await articleSession.send('CSS.enable');
    const articleRoot = (await articleSession.send('DOM.getDocument')).root.nodeId;
    const code = await articleSession.send('DOM.querySelector', { nodeId: articleRoot, selector: 'figure.highlight .code .line' });
    const codeFonts = (await articleSession.send('CSS.getPlatformFontsForNode', { nodeId: code.nodeId })).fonts;
    expect(codeFonts.every((font) => font.isCustomFont)).toBe(true);
    expect(codeFonts.some((font) => font.familyName.startsWith('Noto Sans Mono')), JSON.stringify(codeFonts)).toBe(true);
    await articleSession.detach();
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(fontRequests.every((url) => new URL(url).origin === baseURL && url.includes('/fonts/'))).toBe(true);
    await expect(page.locator('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]')).toHaveCount(0);
});

test('theme toggle persists and follows the system when selected', async ({ page }) => {
    await page.goto(blog);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('#themeToggle').click();
    await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-state', 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile menu is keyboard accessible and closes after selection', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(blog);
    // All controls share the same backdrop; the menu arrow must remain as
    // legible as the search icon, including the upstream dark-mode hover state.
    for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        const iconColor = await page.locator('#searchToggle svg').evaluate((icon) => getComputedStyle(icon).color);
        await expect(page.locator('#menuChevron')).toHaveCSS('color', iconColor);
        await page.locator('#menuBtn').hover();
        await expect(page.locator('#menuChevron')).toHaveCSS('color', iconColor);
        await page.mouse.move(0, 0);
    }
    await expect(page.locator('#mobileMenu')).not.toBeVisible();
    await page.locator('#menuBtn').click();
    await expect(page.locator('#mobileMenu')).toBeVisible();
    await expect(page.locator('#mobileMenu a')).toHaveCount(theme.menu.length);
    await expect(page.locator('#mobileMenu a').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menuBtn')).toBeFocused();
    await expect(page.locator('#mobileMenu')).not.toBeVisible();
    await page.locator('#menuBtn').click();
    await page.locator('#mobileMenu').getByRole('link', { name: '归档', exact: true }).click();
    await expect(page.locator('h1')).toContainText('归档');
    await expect(page.locator('#mobileMenu')).not.toBeVisible();
});

test('random reading opens an existing local article', async ({ page, baseURL }) => {
    await page.goto(`${blog}random/`);
    await page.waitForURL((url) => url.pathname.startsWith(`${blog}posts/`));
    expect(new URL(page.url()).origin).toBe(baseURL);
    expect(posts.map(postURL)).toContain(new URL(page.url()).pathname);
    await expect(page.locator('[data-pagefind-meta="title"]')).toBeVisible();
});

test('article directory, code, reading progress and comments are retained', async ({ page }) => {
    const technical = posts.find((post) => post.source.includes('```') && (post.source.replace(/```[\s\S]*?```/g, '').match(/^#{2,3} /gm) || []).length >= theme.toc.min_headings);
    await page.setViewportSize({ width: 1000, height: 850 });
    await page.goto(postURL(technical));
    await page.locator('#tocInline .toc-toggle').click();
    await expect(page.locator('#tocInlineBody')).toHaveAttribute('data-open', 'true');
    const entry = page.locator('#tocInlineBody a').first();
    const anchor = await entry.getAttribute('href');
    await entry.click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(decodeURIComponent(anchor));
    await expect(page.locator('figure.highlight').first()).toBeVisible();
    await expect(page.locator('#progressBar')).toBeAttached();
    await expect(page.locator('#giscus-container')).toBeAttached();
    await page.setViewportSize({ width: 1607, height: 870 });
    const sidebar = page.locator('#tocSidebar');
    await expect(sidebar).toBeInViewport();
    const before = await sidebar.boundingBox();
    await page.mouse.wheel(0, 450);
    await expect.poll(async () => Math.abs((await sidebar.boundingBox()).y - before.y)).toBeLessThan(1);
    await sidebar.locator('a').first().click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(decodeURIComponent(anchor));
    await page.goto(`${blog}guestbook/`);
    await expect(page.locator('.folio-guestbook')).toContainText('见字如面');
    await expect(page.locator('#giscus-container')).toBeAttached();
});

for (const width of [320, 390, 768, 1024, 1440]) {
    test(`layout is readable without horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        for (const route of [blog, postURL(posts[0]), `${blog}archives/`, `${blog}guestbook/`, `${blog}tags/`, `${blog}categories/`]) {
            await page.goto(route);
            await expect(page.locator('#main-content')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            const footerPlacement = await page.locator('.folio-footer').evaluate((footer) => {
                const text = document.createRange();
                text.selectNodeContents(footer.querySelector('.folio-colophon p'));
                const copyright = text.getBoundingClientRect();
                const build = footer.querySelector('.folio-build').getBoundingClientRect();
                return {
                    centerOffset: copyright.x + copyright.width / 2 - (build.x + build.width / 2),
                    gap: build.top - copyright.bottom
                };
            });
            expect(Math.abs(footerPlacement.centerOffset)).toBeLessThan(1);
            expect(footerPlacement.gap).toBeGreaterThan(0);
            if (route === blog) {
                const title = await page.locator('#folio-title').boundingBox();
                const archive = await page.locator('.folio-hero .folio-text-link').boundingBox();
                const header = await page.locator('.folio-header').boundingBox();
                const masthead = await page.locator('.folio-hero').boundingBox();
                const paper = await page.locator('.folio-sheet').boundingBox();
                const pagination = await page.locator('.pagination').boundingBox();
                const endmark = await page.locator('.folio-endmark').boundingBox();
                const footerLinks = await page.locator('.folio-footer-links').boundingBox();
                expect(endmark.y - (pagination.y + pagination.height)).toBeGreaterThanOrEqual(0);
                expect(endmark.y - (pagination.y + pagination.height)).toBeLessThanOrEqual(24);
                expect(footerLinks.y - (pagination.y + pagination.height)).toBeLessThanOrEqual(64);
                expect(header.y + header.height).toBeLessThanOrEqual(masthead.y);
                expect(masthead.y + masthead.height).toBeLessThanOrEqual(paper.y + 1);
                if (archive.y >= title.y + title.height) {
                    // Very narrow screens may wrap the archive link instead of
                    // squeezing the masthead or placing controls over text.
                    expect(width).toBeLessThan(768);
                } else {
                    expect(archive.x).toBeGreaterThanOrEqual(title.x + title.width);
                    expect(archive.y + archive.height).toBeGreaterThan(title.y);
                }
            }
        }
    });
}

test('reading hierarchy and contrast hold in both themes with local fonts', async ({ page }) => {
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const paperByTheme = {};
        for (const colorScheme of ['light', 'dark']) {
            await page.emulateMedia({ colorScheme });
            await page.goto(blog);
            const readings = await page.locator('.folio-entry').evaluateAll(async (entries) => {
                // Canvas resolves both rgb() and the color(srgb ...) values
                // produced by color-mix(), including their actual alpha.
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                const context = canvas.getContext('2d');
                const rgba = (color) => {
                    context.clearRect(0, 0, 1, 1);
                    context.fillStyle = color;
                    context.fillRect(0, 0, 1, 1);
                    return Array.from(context.getImageData(0, 0, 1, 1).data, (value) => value / 255);
                };
                const luminance = (channels) => {
                    const linear = channels.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
                    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
                };
                const composite = (foreground, background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]));
                const surface = document.querySelector('.folio-paper-surface');
                const backing = getComputedStyle(surface, '::before');
                const fibers = getComputedStyle(surface, '::after');
                const paper = rgba(backing.backgroundColor).slice(0, 3);
                const highlight = rgba(backing.getPropertyValue('--folio-paper-highlight'));
                // Check the actual local fiber pixels in both blending modes,
                // including the darkest/lightest patches and the soft lighting.
                const texture = new Image();
                texture.src = fibers.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)[1];
                await texture.decode();
                canvas.width = texture.naturalWidth;
                canvas.height = texture.naturalHeight;
                context.drawImage(texture, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let minimum = 1;
                let maximum = 0;
                let fiberMinimum = 1;
                let fiberMaximum = 0;
                for (const base of [paper, composite(highlight, paper)]) {
                    for (let offset = 0; offset < pixels.length; offset += 4) {
                        const alpha = pixels[offset + 3] / 255 * Number(fibers.opacity);
                        const color = base.map((channel, index) => {
                            let pigment = pixels[offset + index] / 255;
                            if (fibers.filter.includes('invert(1)')) pigment = 1 - pigment;
                            const mixed = fibers.mixBlendMode === 'screen'
                                ? 1 - (1 - channel) * (1 - pigment) : channel * pigment;
                            return mixed * alpha + channel * (1 - alpha);
                        });
                        const light = luminance(color);
                        minimum = Math.min(minimum, light);
                        maximum = Math.max(maximum, light);
                        if (base === paper) {
                            fiberMinimum = Math.min(fiberMinimum, light);
                            fiberMaximum = Math.max(fiberMaximum, light);
                        }
                    }
                }
                const backdrops = [minimum, maximum];
                return entries.map((entry) => {
                    const title = entry.querySelector('h2');
                    const meta = entry.querySelector('.folio-entry-meta');
                    const excerpt = entry.querySelector('.folio-excerpt');
                    const style = getComputedStyle(excerpt);
                    const textSize = parseFloat(style.fontSize);
                    const textElements = [title, meta, excerpt, entry.querySelector('.folio-read-link'), entry.querySelector('.folio-entry-date')];
                    const contrast = Math.min(...textElements.flatMap((element) => {
                        const ink = luminance(rgba(getComputedStyle(element).color));
                        return backdrops.map((background) => (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05));
                    }));
                    return {
                        textSize,
                        titleRatio: parseFloat(getComputedStyle(title).fontSize) / textSize,
                        metaSize: parseFloat(getComputedStyle(meta).fontSize),
                        lineLength: excerpt.getBoundingClientRect().width / textSize,
                        contrast,
                        paperLuminance: (minimum + maximum) / 2,
                        inkLuminance: luminance(rgba(style.color)),
                        fiberContrast: (fiberMaximum - fiberMinimum) / (fiberMaximum + fiberMinimum),
                        titleGap: meta.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
                        excerptGap: excerpt.getBoundingClientRect().top - meta.getBoundingClientRect().bottom
                    };
                });
            });
            paperByTheme[colorScheme] = readings[0].paperLuminance;
            for (const reading of readings) {
                expect(reading.textSize).toBeGreaterThanOrEqual(width < 768 ? 14 : 16);
                expect(reading.titleRatio).toBeGreaterThan(1.3);
                expect(reading.titleRatio).toBeLessThan(1.8);
                expect(reading.metaSize).toBeGreaterThanOrEqual(10);
                expect(reading.lineLength).toBeLessThanOrEqual(46.1);
                expect(reading.contrast).toBeGreaterThanOrEqual(4.5);
                // Relative texture contrast stays meaningful on both white and
                // dark paper, without counting the lighting gradient as relief.
                expect(reading.fiberContrast).toBeGreaterThan(.025);
                expect(reading.fiberContrast).toBeLessThan(.18);
                if (colorScheme === 'dark') {
                    expect(reading.inkLuminance).toBeGreaterThan(reading.paperLuminance);
                } else {
                    expect(reading.inkLuminance).toBeLessThan(reading.paperLuminance);
                }
                expect(reading.titleGap).toBeGreaterThan(0);
                expect(reading.excerptGap).toBeGreaterThan(0);
            }
        }
        expect(paperByTheme.light - paperByTheme.dark).toBeGreaterThan(.5);
    }
});

test('cold scene preloads before CSS and waits for decoded images and visible fonts', async ({ page }) => {
    const wallpaper = visualAssets.find((asset) => asset.priority === 'high');
    const titleFont = visualAssets.find((asset) => asset.as === 'font' && asset.path.includes('greatvibes'));
    let releaseCSS, releaseImages, releaseFonts;
    const cssGate = new Promise((resolve) => { releaseCSS = resolve; });
    const imageGate = new Promise((resolve) => { releaseImages = resolve; });
    const fontGate = new Promise((resolve) => { releaseFonts = resolve; });
    const requests = new Map();
    page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        requests.set(pathname, (requests.get(pathname) || 0) + 1);
    });
    await page.addInitScript(() => {
        window.folioDecodedImages = [];
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = function (...args) {
            return decode.apply(this, args).then(() => { window.folioDecodedImages.push(this.src); });
        };
    });
    await page.route('**/*', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('/css/folio.css')) await cssGate;
        if (pathname === `${blog}${wallpaper.path}`) await imageGate;
        if (pathname === `${blog}${titleFont.path}`) await fontGate;
        await route.fallback();
    });
    try {
        await page.goto(blog, { waitUntil: 'commit' });
        await expect.poll(() => requests.has(`${blog}${wallpaper.path}`) && requests.has(`${blog}${titleFont.path}`)).toBe(true);
        await expect(page.locator('html')).toHaveAttribute('data-folio-loading', '');
        releaseCSS();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('body')).toHaveCSS('visibility', 'hidden');
        releaseImages();
        await expect.poll(() => page.evaluate(() => window.folioDecodedImages.length)).toBe(visualAssets.filter((asset) => asset.as === 'image').length);
        // The background is already decoded; an unresolved title font must
        // still prevent a flash of fallback typography before the reveal.
        await expect(page.locator('html')).toHaveAttribute('data-folio-loading', '');
        await expect(page.locator('#folio-title')).not.toBeVisible();
        releaseFonts();
        await expect(page.locator('html')).not.toHaveAttribute('data-folio-loading');
        await expect(page.locator('#folio-title')).toBeVisible();
        await expect(page.locator('body')).toHaveCSS('opacity', '1');
        expect(await page.evaluate((title) => document.fonts.check('400 16px "Great Vibes"', title), config.title)).toBe(true);
        for (const asset of visualAssets) expect(requests.get(`${blog}${asset.path}`), asset.path).toBe(1);
    } finally {
        releaseCSS(); releaseImages(); releaseFonts();
    }
});

test('incoming navigation retains the old view while its background is delayed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let hold = false, release;
    const gate = new Promise((resolve) => { release = resolve; });
    const wallpaper = visualAssets.find((asset) => asset.priority === 'high');
    await page.route(`**/${wallpaper.path}`, async (route) => {
        if (hold) await gate;
        await route.fallback();
    });
    await page.addInitScript(() => {
        window.addEventListener('pagereveal', (event) => {
            window.folioLoadTransition = { native: !!event.viewTransition };
            event.viewTransition?.ready.then(() => { window.folioLoadTransition.active = true; }).catch(() => {});
            event.viewTransition?.finished.then(() => { window.folioLoadTransition.finished = true; });
        });
    });
    try {
        await page.goto(blog);
        await expect(page.locator('html')).not.toHaveAttribute('data-folio-loading');
        hold = true;
        await page.locator('.folio-hero').getByRole('link', { name: /^全部文章/ }).click();
        await expect(page.locator('html')).toHaveAttribute('data-folio-loading', '');
        await expect.poll(() => page.evaluate(() => window.folioLoadTransition)).toBeTruthy();
        if (await page.evaluate(() => window.folioLoadTransition.native)) {
            await expect.poll(() => page.evaluate(() => window.folioLoadTransition.active)).toBe(true);
            const frames = await page.evaluate(async () => {
                const frames = [];
                for (let frame = 0; frame < 36; frame++) {
                    await new Promise(requestAnimationFrame);
                    const old = getComputedStyle(document.documentElement, '::view-transition-old(root)');
                    const incoming = getComputedStyle(document.documentElement, '::view-transition-new(root)');
                    frames.push({ old: Number(old.opacity), incoming: Number(incoming.opacity), state: incoming.animationPlayState });
                }
                return frames;
            });
            expect(frames.every((frame) => frame.old === 1 && frame.incoming === 0 && frame.state === 'paused')).toBe(true);
            expect(await page.evaluate(() => window.folioLoadTransition.finished)).not.toBe(true);
        } else {
            await expect(page.locator('body')).toHaveCSS('visibility', 'hidden');
        }
        release();
        await expect(page.locator('html')).not.toHaveAttribute('data-folio-loading');
        await expect(page.locator('h1')).toContainText('归档');
        await expect(page.locator('body')).toHaveCSS('opacity', '1');
        if (await page.evaluate(() => window.folioLoadTransition.native)) {
            await expect.poll(() => page.evaluate(() => window.folioLoadTransition.finished)).toBe(true);
        }
    } finally { release(); }
});

test('failed visual assets and a failed loader never leave reading hidden', async ({ page }) => {
    await page.route('**/images/*.webp', (route) => route.abort());
    await page.route('**/fonts/greatvibes/*.woff2', (route) => route.abort());
    await page.goto(blog);
    await expect(page.locator('html')).not.toHaveAttribute('data-folio-loading');
    await expect(page.locator('#folio-title')).toBeVisible();
    await page.route('**/js/folio-preload.js?*', (route) => route.abort());
    await page.goto(blog);
    await expect(page.locator('html')).toHaveAttribute('data-folio-loading', '');
    await expect(page.locator('html')).not.toHaveAttribute('data-folio-loading', { timeout: theme.folio.preload_timeout + 1000 });
    await expect(page.locator('.folio-entry').first()).toBeVisible();
});

test('scroll reveals move smoothly once and retain readable fallback content', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(blog);
    await page.evaluate(() => document.fonts.ready);
    const entry = page.locator('.folio-entry').last();
    await expect(entry).not.toHaveClass(/is-visible/);
    await entry.scrollIntoViewIfNeeded();
    await expect(entry).toHaveClass(/is-visible/);
    const frames = await entry.evaluate(async (element) => {
        const frames = [];
        for (let frame = 0; frame < 8; frame++) {
            await new Promise(requestAnimationFrame);
            const style = getComputedStyle(element);
            frames.push({ opacity: Number(style.opacity), y: new DOMMatrix(style.transform).m42 });
        }
        return frames;
    });
    expect(frames.at(-1).opacity).toBeGreaterThan(frames[0].opacity);
    expect(frames.at(-1).y).toBeLessThan(frames[0].y);
    await expect.poll(() => entry.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.locator('#folio-title').scrollIntoViewIfNeeded();
    await entry.scrollIntoViewIfNeeded();
    expect(await entry.evaluate((element) => element.getAnimations().length)).toBe(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.folio-header, #folio-title, [data-folio-reveal]').evaluateAll((elements) => elements.every((element) => element.getAnimations().length === 0))).toBe(true);
    await page.addInitScript(() => { delete window.IntersectionObserver; });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(blog);
    await expect(page.locator('.folio-entry').first()).toBeVisible();
    await expect(page.locator('.folio-entry').first()).toHaveCSS('opacity', '1');
});

test('mobile menu animates real height while maintaining focus and inert state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(blog);
    const menu = page.locator('#mobileMenu');
    const sampleHeight = async (action) => {
        // Start on the browser's transition event so protocol round trips do
        // not consume the short animation before the first frame is sampled.
        await menu.evaluate((element) => {
            window.folioMenuFrames = new Promise((resolve) => {
                const sample = async (event) => {
                    if (event.target !== element || event.propertyName !== 'grid-template-rows') return;
                    element.removeEventListener('transitionrun', sample);
                    const heights = [element.getBoundingClientRect().height];
                    for (let frame = 0; frame < 8; frame++) {
                        await new Promise(requestAnimationFrame);
                        heights.push(element.getBoundingClientRect().height);
                    }
                    resolve(heights);
                };
                element.addEventListener('transitionrun', sample);
            });
        });
        await action();
        return page.evaluate(() => window.folioMenuFrames);
    };
    const opening = await sampleHeight(() => page.locator('#menuBtn').click());
    expect(opening.at(-1)).toBeGreaterThan(opening[0]);
    await expect(menu.locator('a').first()).toBeFocused();
    expect(await menu.evaluate((element) => element.inert)).toBe(false);
    await expect.poll(() => menu.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    const closing = await sampleHeight(() => page.keyboard.press('Escape'));
    expect(await menu.evaluate((element) => element.inert)).toBe(true);
    expect(closing.at(-1)).toBeLessThan(closing[0]);
    await expect(menu).not.toBeVisible();
    await expect(page.locator('#menuBtn')).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#menuBtn').click();
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('page navigation opts into native cross-fades with a readable entrance fallback', async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
        window.addEventListener('pageswap', (event) => {
            sessionStorage.setItem('folioNavigationSource', String(!!event.viewTransition));
        });
        window.addEventListener('pagereveal', (event) => {
            window.folioNavigationMotion = { seen: true, hasTransition: !!event.viewTransition };
            if (!event.viewTransition) return;
            event.viewTransition.ready.then(() => {
                const style = getComputedStyle(document.documentElement, '::view-transition-new(root)');
                Object.assign(window.folioNavigationMotion, { active: document.documentElement.matches(':active-view-transition'), duration: parseFloat(style.animationDuration), finished: false });
                event.viewTransition.finished.then(() => { window.folioNavigationMotion.finished = true; });
            }).catch((error) => { window.folioNavigationMotion.error = String(error); });
        });
    });
    await page.goto(blog);
    test.skip(!await page.evaluate(() => 'onpagereveal' in window), 'Browser does not support cross-document view transitions');
    await page.bringToFront();
    await page.evaluate(async () => {
        await document.fonts.ready;
        // Cross-document snapshots require a painted, active source document.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
    });
    await page.locator('.folio-hero').getByRole('link', { name: /^全部文章/ }).click();
    await expect(page).toHaveURL(`${baseURL}${blog}archives/`);
    await expect.poll(() => page.evaluate(() => window.folioNavigationMotion?.seen)).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('folioNavigationSource'))).toBe('true');
    // A user agent may skip the incoming snapshot; navigation must remain
    // smooth and readable through the ordinary CSS entrance in that case.
    if (await page.evaluate(() => window.folioNavigationMotion.hasTransition)) {
        await expect.poll(() => page.evaluate(() => window.folioNavigationMotion)).toMatchObject({ active: true });
        expect(await page.evaluate(() => window.folioNavigationMotion.duration)).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => window.folioNavigationMotion.finished)).toBe(true);
        await expect(page.locator('html')).toHaveAttribute('data-folio-navigation', '');
        await expect(page.locator('.folio-main')).toHaveCSS('animation-name', 'none');
    } else {
        await expect(page.locator('.folio-main')).toHaveCSS('animation-name', 'folio-fade-in');
    }
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.folio-main')).toHaveCSS('opacity', '1');
});

test('theme transitions use the native cross-fade and stop for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(blog);
    test.skip(!await page.evaluate(() => !!document.startViewTransition), 'Browser does not support view transitions');
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter((animation) => !['folio-blossom-x', 'folio-blossom-y', 'folio-petal'].includes(animation.animationName)).map((animation) => animation.finished));
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = (...args) => {
            const transition = original(...args);
            window.folioThemeMotion = {};
            transition.ready.then(() => {
                const style = getComputedStyle(document.documentElement, '::view-transition-new(root)');
                Object.assign(window.folioThemeMotion, { active: document.documentElement.matches(':active-view-transition'), duration: parseFloat(style.animationDuration) });
            }).catch((error) => { window.folioThemeMotion.error = String(error); });
            transition.finished.then(() => { window.folioThemeMotion.finished = true; });
            return transition;
        };
    });
    await page.locator('#themeToggle').click();
    await expect.poll(() => page.evaluate(() => window.folioThemeMotion?.active)).toBe(true);
    expect(await page.evaluate(() => window.folioThemeMotion.duration)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.folioThemeMotion?.finished)).toBe(true);
    expect(await page.locator('.folio-header, #folio-title').evaluateAll((elements) => elements.every((element) => element.getAnimations().length === 0))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { delete window.folioThemeMotion; });
    await page.locator('#themeToggle').click();
    expect(await page.evaluate(() => window.folioThemeMotion)).toBeUndefined();
});

test('reduced motion stops all floral motion and content works without JavaScript', async ({ page, browser, baseURL }) => {
    await page.goto(blog);
    const decorations = page.locator('.folio-flowers, .folio-petal');
    await expect(decorations).toHaveCount(44);
    expect(await decorations.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).animationName === 'none'))).toBe(true);
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const plain = await context.newPage();
    await plain.goto(`${baseURL}${blog}`);
    await expect(plain.locator('#folio-title')).toBeVisible();
    await expect(plain.locator('#mobileMenu')).toBeVisible();
    await expect(plain.locator('.folio-entry').first()).toBeVisible();
    await context.close();
});

test('flowers move independently of still paper, pause out of view and react to reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(blog);
    const layers = page.locator('.folio-flowers, .folio-petal');
    await expect(layers).toHaveCount(44);
    const pattern = page.locator('.folio-pattern');
    await expect(pattern).toHaveCSS('animation-name', 'none');
    await expect(pattern).toHaveCSS('transform', 'none');
    const paperBefore = await pattern.boundingBox();
    const initial = await layers.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
    // Observe the real browser timeline, not merely the declared keyframe name.
    await expect.poll(() => layers.evaluateAll((elements, before) => elements.every((element, index) => getComputedStyle(element).transform !== before[index]), initial)).toBe(true);
    const paperAfter = await pattern.evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height, bodyHeight: document.body.getBoundingClientRect().height };
    });
    // Late content layout may change the document height. The wallpaper must
    // stay anchored while continuing to cover the actual, current document.
    expect({ x: paperAfter.x, y: paperAfter.y, width: paperAfter.width }).toEqual({ x: paperBefore.x, y: paperBefore.y, width: paperBefore.width });
    expect(paperAfter.height).toBeCloseTo(paperAfter.bodyHeight);
    await expect(pattern).toHaveCSS('transform', 'none');

    // Flower groups have their own timelines, instead of moving one flat sheet.
    const flowerTransforms = await page.locator('.folio-flowers').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
    expect(new Set(flowerTransforms).size).toBe(flowerTransforms.length);

    const durations = await layers.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationDuration));
    expect(new Set(durations).size).toBeGreaterThan(3);

    // The stationary paper covers the viewport while its cutout flowers move.
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const coverage = await page.locator('.folio-pattern').evaluate((element) => {
            const pattern = element.getBoundingClientRect();
            const paper = element.parentElement.getBoundingClientRect();
            return pattern.left <= paper.left && pattern.right >= paper.right
                && pattern.top <= paper.top && pattern.bottom >= paper.bottom;
        });
        expect(coverage).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    // Headless pages do not become hidden when another page is brought forward.
    // Dispatch the visibility signal and verify its observable animation state.
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await layers.evaluateAll((elements) => elements.every((element) => element.getAnimations().every((animation) => animation.playState === 'paused')))).toBe(true);
    await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await layers.evaluateAll((elements) => elements.every((element) => element.getAnimations().some((animation) => animation.playState === 'running')))).toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await layers.evaluateAll((elements) => elements.every((element) => element.getAnimations().length === 0))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await layers.evaluateAll((elements) => elements.every((element) => element.getAnimations().some((animation) => animation.playState === 'running')))).toBe(true);
});

test('separate bouquets stay in the margins and drift in different directions', async ({ page }) => {
    await page.setViewportSize({ width: 1607, height: 870 });
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
    await page.goto(blog);
    const flowers = page.locator('.folio-flowers');
    const visibleGroups = await flowers.evaluateAll(async (elements) => {
        const sheet = document.querySelector('.folio-sheet').getBoundingClientRect();
        return Promise.all(elements.map(async (element) => {
            const image = new Image();
            image.src = getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)[1];
            await image.decode();
            const rect = element.getBoundingClientRect();
            const canvas = document.createElement('canvas');
            canvas.width = innerWidth;
            canvas.height = innerHeight;
            const context = canvas.getContext('2d');
            const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            context.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let left = 0;
            let right = 0;
            let mastheadCenter = 0;
            for (let y = 0; y < canvas.height; y += 1) {
                for (let x = 0; x < canvas.width; x += 1) {
                    if (pixels[(y * canvas.width + x) * 4 + 3] < 128) continue;
                    if (x < sheet.left) left += 1;
                    if (x > sheet.right) right += 1;
                    if (y < sheet.top && x > innerWidth * .3 && x < innerWidth * .7) mastheadCenter += 1;
                }
            }
            return { left, right, mastheadCenter };
        }));
    });
    expect(visibleGroups.filter((group) => group.left > 300).length).toBeGreaterThanOrEqual(2);
    expect(visibleGroups.filter((group) => group.right > 300).length).toBeGreaterThanOrEqual(2);
    expect(visibleGroups.every((group) => group.mastheadCenter === 0)).toBe(true);
    const initial = await flowers.evaluateAll((elements) => elements.map((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return { x: matrix.e, y: matrix.f };
    }));
    await expect.poll(() => flowers.evaluateAll((elements, before) => elements.filter((element, index) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return Math.hypot(matrix.e - before[index].x, matrix.f - before[index].y) >= 10;
    }).length, initial), { timeout: 6500, intervals: [250] }).toBeGreaterThanOrEqual(2);
    const directions = await flowers.evaluateAll((elements, before) => elements.map((element, index) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return { x: Math.sign(matrix.e - before[index].x), y: Math.sign(matrix.f - before[index].y) };
    }), initial);
    expect(new Set(directions.map(({ x }) => x)).size).toBeGreaterThan(1);
    expect(new Set(directions.map(({ y }) => y)).size).toBeGreaterThan(1);
});

test('independent flower paths remain slow and smooth, with more petals in the margins', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1607, height: 870 });
    await page.goto(blog);
    const motion = await page.locator('.folio-flowers').evaluateAll((elements) => elements.map((element) => {
        const animations = element.getAnimations();
        const initial = animations.map((animation) => animation.currentTime);
        animations.forEach((animation) => animation.pause());
        const durations = animations.map((animation) => animation.effect.getTiming().duration);
        const interval = .5;
        const points = [];
        // Sample both independent phases past multiple loop boundaries.
        for (let index = 0; index <= 280; index += 1) {
            animations.forEach((animation, phase) => { animation.currentTime = initial[phase] + index * interval * 1000; });
            const matrix = new DOMMatrix(getComputedStyle(element).transform);
            points.push({ x: matrix.e, y: matrix.f });
        }
        const velocities = points.slice(1).map((point, index) => ({
            x: (point.x - points[index].x) / interval,
            y: (point.y - points[index].y) / interval
        }));
        const speeds = velocities.map(({ x, y }) => Math.hypot(x, y));
        const accelerations = velocities.slice(1).map((velocity, index) => Math.hypot(
            velocity.x - velocities[index].x, velocity.y - velocities[index].y
        ) / interval);
        animations.forEach((animation, phase) => { animation.currentTime = initial[phase]; animation.play(); });
        return {
            durations,
            horizontalSpan: Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)),
            verticalSpan: Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y)),
            maxSpeed: Math.max(...speeds),
            maxAcceleration: Math.max(...accelerations)
        };
    }));
    for (const group of motion) {
        expect(group.durations.every((duration) => duration >= 30000)).toBe(true);
        expect(group.maxSpeed).toBeGreaterThan(1);
        expect(group.maxSpeed).toBeLessThan(5);
        expect(group.maxAcceleration).toBeLessThan(1.1);
        expect(group.horizontalSpan).toBeGreaterThan(80);
        expect(group.verticalSpan).toBeGreaterThan(52);
    }

    for (const { width, count, visible } of [{ width: 1607, count: 24, visible: 8 }, { width: 390, count: 12, visible: 5 }]) {
        await page.setViewportSize({ width, height: 870 });
        const petals = await page.locator('.folio-garden .folio-petal').evaluateAll((elements) => {
            const paper = document.querySelector('.folio-sheet').getBoundingClientRect();
            const shown = elements.filter((element) => getComputedStyle(element).display !== 'none');
            return {
                count: shown.length,
                visible: shown.filter((element) => {
                    const rect = element.getBoundingClientRect();
                    const left = Math.min(rect.right, paper.left) - Math.max(rect.left, 0);
                    const right = Math.min(rect.right, innerWidth) - Math.max(rect.left, paper.right);
                    return rect.bottom > 0 && rect.top < innerHeight && Math.max(left, right) > 4
                        && Number(getComputedStyle(element).opacity) > 0.15;
                }).length
            };
        });
        expect(petals.count).toBe(count);
        expect(petals.visible).toBeGreaterThanOrEqual(visible);
    }
});

test('foreground petals drift above the sheet without blocking article controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const { width, count, visible } of [{ width: 1607, count: 8, visible: 4 }, { width: 390, count: 6, visible: 3 }]) {
        await page.setViewportSize({ width, height: 870 });
        for (const route of [blog, postURL(posts[0])]) {
            await page.goto(route);
            const foreground = page.locator('.folio-foreground');
            await expect(foreground).toHaveAttribute('aria-hidden', 'true');
            const petals = foreground.locator('.folio-petal');
            const shown = await petals.evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
                const rect = element.getBoundingClientRect();
                const sheet = element.parentElement.getBoundingClientRect();
                const style = getComputedStyle(element);
                const opacity = Number(style.opacity) * Number(getComputedStyle(element.parentElement).opacity);
                return {
                    visible: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= sheet.left && rect.right <= sheet.right && opacity > .15,
                    opacity,
                    period: parseFloat(style.animationDuration)
                };
            }));
            expect(shown).toHaveLength(count);
            expect(shown.filter((petal) => petal.visible).length).toBeGreaterThanOrEqual(visible);
            expect(shown.every((petal) => petal.opacity <= .4 && petal.period >= 30)).toBe(true);

            // Hold a real petal over a control to exercise paint order and hit
            // testing deterministically, regardless of the current drift phase.
            const overlap = await petals.first().evaluate((petal) => {
                const button = document.querySelector('#searchToggle');
                const target = button.getBoundingClientRect();
                const layer = petal.parentElement.getBoundingClientRect();
                const x = target.x + target.width / 2;
                const y = target.y + target.height / 2;
                Object.assign(petal.style, {
                    left: `${x - layer.x - 20}px`, top: `${y - layer.y - 20}px`,
                    width: '40px', height: '40px', animation: 'none', transform: 'none', pointerEvents: 'auto'
                });
                const paintedAbove = document.elementFromPoint(x, y) === petal;
                petal.style.removeProperty('pointer-events');
                const passesThrough = document.elementFromPoint(x, y)?.closest('#searchToggle') === button;
                return { x, y, paintedAbove, passesThrough };
            });
            expect(overlap.paintedAbove).toBe(true);
            expect(overlap.passesThrough).toBe(true);
            await page.mouse.click(overlap.x, overlap.y);
            await expect(page.getByRole('dialog')).toBeVisible();
            await page.keyboard.press('Escape');
        }
    }
});

test('restored paper stays crisp, scrolls with the page and leaves controls accessible', async ({ page, baseURL }) => {
    await page.goto(blog);
    const paper = page.locator('.folio-surround');
    const pattern = page.locator('.folio-pattern');
    let paperWidth;
    const flowers = await page.locator('.folio-flowers').all();
    for (const decoration of [pattern, ...flowers, page.locator('.folio-petal').first()]) {
        const background = await decoration.evaluate((element) => getComputedStyle(element).backgroundImage);
        const imageURL = background.match(/url\(["']?([^"')]+)["']?\)/)[1];
        expect(new URL(imageURL).origin).toBe(baseURL);
        const width = await page.evaluate(async (url) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            return image.naturalWidth;
        }, imageURL);
        expect(width).toBeGreaterThan(0);
        if (decoration === pattern) paperWidth = width;
        if (flowers.includes(decoration)) {
            // Moving assets must have real transparency, not another wallpaper.
            const transparency = await page.evaluate(async (url) => {
                const image = new Image();
                image.src = url;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 100;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, 100, 100);
                const pixels = context.getImageData(0, 0, 100, 100).data;
                let clear = 0;
                let visible = 0;
                for (let index = 3; index < pixels.length; index += 4) {
                    if (pixels[index] === 0) clear += 1;
                    if (pixels[index] > 128) visible += 1;
                }
                return { clear: clear / 10000, visible: visible / 10000 };
            }, imageURL);
            expect(transparency.clear).toBeGreaterThan(0.2);
            expect(transparency.visible).toBeGreaterThan(0.03);
        }
    }
    for (const width of [390, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        const drawnWidth = await pattern.evaluate((element) => parseFloat(getComputedStyle(element).backgroundSize));
        expect(drawnWidth).toBeLessThanOrEqual(paperWidth);
        for (const route of [blog, postURL(posts[0]), `${blog}tags/`]) {
            await page.goto(route);
            await page.evaluate(() => document.fonts.ready);
            const topCorners = page.locator('.folio-corner-tl, .folio-corner-tr');
            const bottomCorners = page.locator('.folio-corner-bl, .folio-corner-br');
            for (const corner of await topCorners.all()) {
                await expect(corner).toBeInViewport({ ratio: 1 });
            }
            // Read these in one frame: font/widget loading may reflow the page.
            const { documentHeight, viewportHeight, paperBox } = await paper.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight,
                    paperBox: { y: rect.y, height: rect.height }
                };
            });
            expect(paperBox.y).toBeCloseTo(0);
            // Pagefind's offscreen live region extends one pixel past the body;
            // scrollHeight additionally rounds fractional CSS pixels.
            expect(paperBox.height).toBeGreaterThanOrEqual(documentHeight - 2);
            expect(paperBox.height).toBeGreaterThanOrEqual(viewportHeight);

            if (documentHeight > viewportHeight) {
                const layers = page.locator('.folio-surround, .folio-frame, .folio-garden, .folio-shell, .folio-foreground');
                const before = await layers.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
                await page.mouse.wheel(0, Math.min(420, documentHeight - viewportHeight));
                await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
                const after = await layers.evaluateAll((elements) => ({
                    scroll: window.scrollY,
                    tops: elements.map((element) => element.getBoundingClientRect().top)
                }));
                for (let index = 0; index < before.length; index += 1) {
                    expect(after.tops[index]).toBeCloseTo(before[index] - after.scroll);
                }
            }
            for (const corner of await bottomCorners.all()) {
                // The article's comment widget can change the document height
                // as the footer first enters view. Retry the positioning as
                // well as the assertion, without relaxing full visibility.
                await expect(async () => {
                    await corner.scrollIntoViewIfNeeded();
                    await expect(corner).toBeInViewport({ ratio: 1, timeout: 500 });
                }).toPass({ timeout: 5000 });
            }
            const bottomEdges = await bottomCorners.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().bottom));
            expect(bottomEdges[0]).toBeCloseTo(bottomEdges[1]);
            const paperBottom = await paper.evaluate((element) => element.getBoundingClientRect().bottom);
            expect(paperBottom).toBeGreaterThanOrEqual(viewportHeight - 2);
            await page.keyboard.press('Home');
        }
        await page.locator('#searchToggle').click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
    }
});
