'use strict';

const path = require('path');
const { lastCommitDate } = require('../tools/git-lastmod');

hexo.extend.filter.register('before_generate', () => {
    const rootDir = hexo.base_dir;

    hexo.model('Post').forEach((post) => {
        post.updated = post.date;
    });

    hexo.model('Page').forEach((page) => {
        const relPath = path.relative(rootDir, page.full_source).replace(/\\/g, '/');
        const gitDate = lastCommitDate(rootDir, relPath);
        if (gitDate) {
            page.updated = gitDate;
        }
    });

    hexo.locals.invalidate();
});
