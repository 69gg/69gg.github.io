'use strict';

const { defineConfig } = require('@playwright/test');

const port = Number(process.env.PREVIEW_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    workers: process.env.CI ? 2 : undefined,
    use: {
        baseURL,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        viewport: { width: 1440, height: 1000 },
        colorScheme: 'light',
        reducedMotion: 'reduce',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: `npx http-server public -a 127.0.0.1 -p ${port} -c-1`,
        url: baseURL,
        reuseExistingServer: !process.env.CI
    }
});
