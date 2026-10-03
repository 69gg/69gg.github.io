'use strict';

const path = require('node:path');
const { parseArgs } = require('node:util');
const { createServer } = require('http-server');

const { values } = parseArgs({
    options: { port: { type: 'string', short: 'p', default: '4173' } }
});

createServer({
    root: path.resolve(__dirname, '..', 'public'),
    // The giscus iframe reads the locally hosted comment theme across origins.
    cors: true,
    // Revalidate documents; reuse unchanged artwork, styles, scripts and fonts.
    cache: (pathname) => /\.(?:html?|json|xml)$/.test(pathname) ? 'no-cache' : 3600
}).listen(Number(values.port), '127.0.0.1', () => {
    process.stdout.write(`本地预览：http://127.0.0.1:${values.port}/blog/\n`);
});
