'use strict';

const fs = require('node:fs');
const path = require('node:path');

hexo.extend.helper.register('project_cards', function () {
    const projectsDir = path.join(hexo.source_dir, 'projects');

    return fs.readdirSync(projectsDir).sort()
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => {
            const project = JSON.parse(fs.readFileSync(path.join(projectsDir, fileName), 'utf8'));
            const links = [];

            if (project.github) links.push({ label: 'GitHub', url: project.github });
            if (project.bilibili) links.push({ label: 'Bilibili', url: project.bilibili });
            links.push(...(project.links || []));

            return {
                ...project,
                order: project.order ?? 0,
                url: project.url || links[0]?.url,
                links
            };
        })
        .sort((first, second) => first.order - second.order);
});
