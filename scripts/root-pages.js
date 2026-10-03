'use strict';

hexo.extend.helper.register('origin_url', function (pathname) {
    return new URL(pathname, this.config.url).href;
});
