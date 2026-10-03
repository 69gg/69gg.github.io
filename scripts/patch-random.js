'use strict';

var path = require('path');

function randomPostUrls(locals, config) {
    var skipRenderList = ['**/*.js', '**/*.css'];

    if (Array.isArray(config.skip_render)) {
        skipRenderList = skipRenderList.concat(config.skip_render);
    } else if (config.skip_render != null) {
        skipRenderList.push(config.skip_render);
    }

    var excludePatterns = ['categories', 'tags', 'guestbook', 'about', '404'];

    var allPosts = [].concat(locals.posts.toArray(), locals.pages.toArray())
        .filter(function(post) {
            if (post.urls === false) return false;
            if (isMatch(post.source, skipRenderList)) return false;
            var source = post.source || '';
            for (var i = 0; i < excludePatterns.length; i++) {
                if (source.indexOf(excludePatterns[i]) !== -1) return false;
            }
            return true;
        })
        .sort(function(a, b) {
            return b.updated - a.updated;
        });

    // One pool shared by the native navigation links and the fallback route.
    return allPosts.map(function(post) {
        return new URL(post.permalink).pathname;
    });
}

hexo.extend.helper.register('random_post_urls', function() {
    return randomPostUrls(this.site, this.config);
});

hexo.extend.generator.register('urls', function(locals) {
    var config = this.config;

    var template = require(path.resolve(__dirname, '..', 'node_modules/hexo-generator-random/lib/template'));
    var html = template(config).render({
        config: config,
        // Stay on the current origin so local previews and deployments use the
        // same random-reading behavior. Preserve the configured blog root.
        posts: randomPostUrls(locals, config).map(function(url) {
            return { permalink: url };
        })
    });

    return {
        path: config.urls.path,
        data: html
    };
});

function isMatch(file, patterns) {
    if (!patterns) return false;
    if (!Array.isArray(patterns)) patterns = [patterns];
    if (!patterns.length) return false;
    var minimatch = require('minimatch');
    for (var i = 0, len = patterns.length; i < len; i++) {
        if (minimatch(file, patterns[i])) return true;
    }
    return false;
}
