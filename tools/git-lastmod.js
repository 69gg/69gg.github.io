'use strict';

const { execFileSync } = require('child_process');

const TIMEZONE = 'Asia/Shanghai';

function formatShanghaiDate(value) {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function lastCommitDate(cwd, filePath) {
    if (!filePath) {
        return null;
    }

    try {
        const iso = execFileSync(
            'git',
            ['log', '-1', '--format=%cI', '--', filePath],
            {
                cwd,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            }
        ).trim();

        if (!iso) {
            return null;
        }

        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? null : date;
    } catch (error) {
        return null;
    }
}

function latestCommitDate(cwd, filePaths) {
    let latest = null;

    for (const filePath of filePaths) {
        const date = lastCommitDate(cwd, filePath);
        if (date && (!latest || date > latest)) {
            latest = date;
        }
    }

    return latest;
}

module.exports = {
    TIMEZONE,
    formatShanghaiDate,
    lastCommitDate,
    latestCommitDate
};
