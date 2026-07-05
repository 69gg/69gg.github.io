'use strict';

const fs = require('fs');
const path = require('path');

const BUILD_DATE = new Date();
const DEFAULT_TIMEZONE = 'UTC';
const rootDir = path.resolve(__dirname, '..');

function gitHash() {
    const envHash = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '';
    if (envHash) {
        return envHash.slice(0, 7);
    }

    try {
        return readGitHead().slice(0, 7);
    } catch (error) {
        return 'unknown';
    }
}

function gitDirectory() {
    const dotGitPath = path.join(rootDir, '.git');
    const stat = fs.statSync(dotGitPath);

    if (stat.isDirectory()) {
        return dotGitPath;
    }

    const gitDir = fs.readFileSync(dotGitPath, 'utf8').trim().match(/^gitdir:\s*(.+)$/);
    if (!gitDir) {
        throw new Error(`Invalid .git file: ${dotGitPath}`);
    }

    return path.resolve(rootDir, gitDir[1]);
}

function readGitHead() {
    const dir = gitDirectory();
    const head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim();

    if (/^[0-9a-f]{40}$/i.test(head)) {
        return head;
    }

    const ref = head.match(/^ref:\s*(.+)$/);
    if (!ref) {
        throw new Error(`Invalid git HEAD: ${head}`);
    }

    const refPath = path.join(dir, ref[1]);
    if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, 'utf8').trim();
    }

    const packedRefsPath = path.join(dir, 'packed-refs');
    const packedRefs = fs.existsSync(packedRefsPath) ? fs.readFileSync(packedRefsPath, 'utf8') : '';
    const packedRef = packedRefs
        .split(/\r?\n/)
        .find(line => line.endsWith(` ${ref[1]}`));

    if (!packedRef) {
        throw new Error(`Missing git ref: ${ref[1]}`);
    }

    return packedRef.split(' ')[0];
}

function dateParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    return Object.fromEntries(
        formatter.formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value])
    );
}

function formatBuildTime(date, timeZone) {
    let parts;
    try {
        parts = dateParts(date, timeZone);
    } catch (error) {
        parts = dateParts(date, DEFAULT_TIMEZONE);
        timeZone = DEFAULT_TIMEZONE;
    }

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${timeZone}`;
}

const hash = gitHash();

hexo.extend.helper.register('build_info', function () {
    const timeZone = (this.config && this.config.timezone) || hexo.config.timezone || DEFAULT_TIMEZONE;
    return `Build: ${formatBuildTime(BUILD_DATE, timeZone)} · ${hash}`;
});
