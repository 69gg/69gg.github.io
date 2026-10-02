'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const nunjucks = require('nunjucks');
const yaml = require('js-yaml');
const { buildPostCardViewModels } = require('hexo-theme-shiro/scripts/lib/html-analysis');
const { escapeHtml, escapeAttr } = require('hexo-theme-shiro/scripts/lib/util');

const rootDir = path.resolve(__dirname, '..');
const theme = yaml.load(fs.readFileSync(path.join(rootDir, '_config.shiro.yml'), 'utf8'));
const themeDir = path.dirname(require.resolve('hexo-theme-shiro/package.json'));
const templates = new nunjucks.Environment(new nunjucks.FileSystemLoader([
    path.join(rootDir, '_theme_overrides', 'shiro', 'layout'),
    path.join(themeDir, 'layout')
]), { autoescape: false });

const article = {
    title: '摘要测试',
    path: 'posts/summary-fixture/',
    content: '<p>正文内容应当在没有摘要时显示。</p>',
    excerpt: '<p>保留 <em>手动摘要</em> 的格式。</p>'
};

function renderExcerpt(post, themeConfig = theme) {
    // Use the same view model and complete card template as the generated index.
    const output = templates.render('_partial/components/post-card.njk', {
        ...buildPostCardViewModels([post], themeConfig)[0],
        escape_html: escapeHtml,
        escape_attr: escapeAttr,
        attr_url: escapeAttr,
        href_for: escapeAttr,
        archive_url: () => '/archives/',
        date: () => '2026-10-02',
        word_count_meta: () => null,
        __: (key) => key
    });
    return output.match(/<div class="prose-shiro folio-excerpt">([\s\S]*?)<\/div>/)[1].trim();
}

test('summary overrides both manual excerpts and disabled automatic excerpts', () => {
    const post = { ...article, summary: '  优先显示文章元数据中的摘要。  ' };
    assert.equal(renderExcerpt(post), '<p>优先显示文章元数据中的摘要。</p>');
    assert.equal(renderExcerpt(post, { excerpt: { fallback: { enabled: false } } }), '<p>优先显示文章元数据中的摘要。</p>');
});

test('folded YAML summaries render as escaped text, not executable HTML', () => {
    const metadata = yaml.load('summary: >-\n  摘要中有 <b>标签</b> & 符号。\n  还有第二行。\n');
    assert.equal(renderExcerpt({ ...article, ...metadata }), '<p>摘要中有 &lt;b&gt;标签&lt;/b&gt; &amp; 符号。 还有第二行。</p>');
});

test('missing, blank and non-text summaries preserve the existing excerpt policy', () => {
    const policies = [theme, { excerpt: { fallback: { enabled: false } } }, { excerpt: { fallback: { length: 5 } } }];
    for (const summary of [undefined, null, '', ' \n\t ', false, 42, [], { text: '无效摘要类型' }]) {
        for (const excerpt of [article.excerpt, '']) {
            for (const policy of policies) {
                const post = { ...article, excerpt, summary };
                const [existing] = buildPostCardViewModels([post], policy);
                assert.equal(renderExcerpt(post, policy), existing.excerpt.content);
            }
        }
    }
});
