import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';

const { values } = parseArgs({
  options: {
    'api-url': { type: 'string' },
    name: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values['api-url']) {
  console.log('用法：npm run github:app -- --api-url <Worker HTTPS 地址> [--name <App 名称>]');
  process.exit(values.help ? 0 : 1);
}

const worker = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
const site = yaml.load(readFileSync(new URL('../../_config.yml', import.meta.url), 'utf8'));
const page = readFileSync(new URL('../../source/guestbook/index.md', import.meta.url), 'utf8');
const frontmatter = yaml.load(page.split(/^---$/m)[1]);
const homepage = new URL(frontmatter.root_path, site.url).href;
const callback = new URL('/auth/callback', values['api-url']).href;
const owner = worker.vars.GITHUB_REPOSITORY.split('/')[0];
const registration = new URL('https://github.com/settings/apps/new');

registration.search = new URLSearchParams({
  name: values.name || `${owner}-${worker.name}`,
  description: '留言板纸条与回复的 GitHub Discussions 存储及登录授权。',
  url: homepage,
  'callback_urls[]': callback,
  public: 'true',
  webhook_active: 'false',
  request_oauth_on_install: 'false',
  discussions: 'write',
  metadata: 'read',
}).toString();

console.log(`留言板：${homepage}`);
console.log(`登录回调：${callback}`);
console.log(`存储：${worker.vars.GITHUB_REPOSITORY}，Discussion #${worker.vars.DISCUSSION_NUMBER}`);
console.log('\n打开以下链接创建 GitHub App，创建后仅安装到上述仓库：');
console.log(registration.href);
