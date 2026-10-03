import { createPrivateKey, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'private-key': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values['private-key']) {
  console.log('用法：npm run secrets:prepare -- --private-key <GitHub App 下载的私钥.pem>');
  process.exit(values.help ? 0 : 1);
}

const privateKey = createPrivateKey(readFileSync(values['private-key'])).export({
  type: 'pkcs8',
  format: 'pem',
});
const secrets = {
  GITHUB_PRIVATE_KEY: privateKey,
  SESSION_SECRET: randomBytes(32).toString('base64'),
};
const target = new URL('./.secrets.json', import.meta.url);

writeFileSync(target, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
console.log(`已准备密钥文件：${fileURLToPath(target)}`);
console.log('文件仅当前用户可读写，已加入 Git 忽略规则。使用 npm run secrets:upload 导入 Worker。');
