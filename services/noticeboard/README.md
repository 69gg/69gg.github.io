# 布告栏接口

这是独立页面 `/guestbook/` 的轻量 Cloudflare Worker 接口。前端是本站自己的全屏纸条画布，数据保存在 GitHub Discussions；不用 Giscus UI，也不需要额外数据库。Worker 接收 GitHub 登录回调、保存纸条位置与内容、管理楼层回复。

## GitHub App

在 [GitHub App 设置](https://github.com/settings/apps/new) 中创建一个独立的 App：

| 设置 | 值 |
| --- | --- |
| Homepage URL | 本站留言板地址，例如 `https://www.pylindex.top/guestbook/` |
| Callback URL | Worker 的完整地址加 `/auth/callback` |
| Webhook | 不启用 |
| Repository permissions → Discussions | Read and write |
| Repository permissions → Metadata | Read-only，GitHub 自动添加 |
| 其他仓库、组织与账户权限 | 不申请 |
| Where can this GitHub App be installed? | Any account，让公开访客可以授权登录 |

把 App 安装到 `69gg` 账户，**仅选择 `69gg.github.io` 仓库**。访客只需要授权登录，不需要在自己的仓库安装 App。

记录 App ID 和 Client ID，生成 Client secret 和一份私钥。下载的 RSA 私钥先转成 Web Crypto 支持的 PKCS#8 格式：

```sh
openssl pkcs8 -topk8 -nocrypt -in /安全目录/下载的私钥.pem -out /安全目录/github-app.pkcs8.pem
```

GitHub App 和 Giscus App 的凭据互相独立。Client secret、私钥和会话密钥只放在 Worker 的 Secrets 中，不写入前端、站点配置或 Git。GitHub App 用户登录流程与 PKCE 参数见 [GitHub 官方文档](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)。

## Worker 配置与部署

在本目录运行 Wrangler。`wrangler.jsonc` 是部署配置；本仓库只提供源码，不自动部署该接口。

| 配置 | 用途 |
| --- | --- |
| `GITHUB_REPOSITORY` | 存储留言的仓库，与站点的 `comments.giscus.repo` 保持一致 |
| `DISCUSSION_NUMBER` | 留言板 Discussion 编号，与站点的 `guestbook.discussion_number` 保持一致 |
| `ALLOWED_ORIGINS` | 允许访问接口及作为登录返回地址的网站来源，逗号分隔，不带路径 |
| `GITHUB_APP_ID` | GitHub App 的 App ID，填写到 `vars` |
| `GITHUB_CLIENT_ID` | GitHub App 的 Client ID，填写到 `vars` |
| `GITHUB_CLIENT_SECRET` | GitHub App 的 Client secret，通过 Secret 设置 |
| `GITHUB_PRIVATE_KEY` | PKCS#8 格式的私钥，通过 Secret 设置 |
| `SESSION_SECRET` | 32 字节随机密钥的 Base64 值，通过 Secret 设置 |

当前配置沿用 [留言板 Discussion #6](https://github.com/69gg/69gg.github.io/discussions/6)。仓库已启用 Discussions；通常不用另外创建讨论。如果改用其他仓库，先创建一条留言板 Discussion，填入编号，并把 App 安装到该仓库。

完成 App ID、Client ID 和来源配置后：

```sh
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_PRIVATE_KEY < /安全目录/github-app.pkcs8.pem
openssl rand -base64 32 | npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

部署后，将 Worker 的 HTTPS 地址填到站点根目录 `_config.shiro.yml`：

```yaml
guestbook:
  api_url: "https://你的布告栏接口域名"
  discussion_number: 6
```

GitHub App 的 Callback URL 必须与最终接口地址完全对应。然后构建、发布静态站点。GitHub Pages 仍只负责静态页面，私钥及登录换取 Token 的过程由 Worker 完成。Wrangler Secret 配置见 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 数据与权限

- 顶层 Discussion 评论是一张纸条，正文末尾的隐藏 HTML 注释保存 `v`、`x`、`y`、`color`、`rotation`。当前 `v: 2` 使用画布的像素坐标 `x`、`y`，允许负坐标，没有原木框的边界限制。旧 `v: 1` 的水平比例坐标仍可读取，前端按原 880px 布告栏换算显示，只有编辑或移动该纸条时才保存为新坐标。无元数据的旧留言按默认位置显示。
- 纸条与回复保留 GitHub 的 `createdAt`、`updatedAt` 和作者，前端显示完整创建时间以及有修改时的修改时间。页面迁到根目录后继续使用同一条 Discussion，不改变已有评论 ID 或作者。
- Discussion 回复是纸条下面的楼层回复，保持真实 GitHub 作者身份。用户在网站上的写入、修改通过自己的 GitHub App 用户 Token 完成。
- 移动、修改和删除纸条，以及修改回复时，接口向 GitHub 查询 `viewerDidAuthor`，仅接受作者的操作；同时确认评论属于配置的仓库和留言板 Discussion。
- 删除回复时允许回复作者操作；也允许该顶层纸条的作者操作。纸条作者删除别人回复时，接口先通过用户 Token 确认顶层评论归属，再使用 App 安装 Token 执行删除。App 的权限只覆盖选中的存储仓库，不赋予访客仓库管理权限。
- 删除纸条先清理它的全部回复，再删除顶层评论，避免 GitHub 留下已擦除的父评论占位。匿名读取用单独的只读安装 Token，管理回复才申请写权限的安装 Token。
- 读取会跟随纸条与回复各自的分页，不仅显示前 100 条。GitHub 中被删除或隐藏的留言不出现在布告栏。

浏览器只持有 AES-GCM 加密的不透明会话凭据，存放在当前标签页的 `sessionStorage`；GitHub Token 明文只在 Worker 内使用。登录采用带随机 `state`、HttpOnly Cookie 和 PKCE 的完整页面跳转；返回时从 URL 片段提取会话并立即清除片段。会话最长 8 小时，过期后重新登录；更换 `SESSION_SECRET` 会使原会话失效。退出网站只清理当前标签页会话；要撤销 App 授权，可在 GitHub 的应用设置中操作。

## 接口

| 方法和路径 | 行为 |
| --- | --- |
| `GET /auth/start?return_to=…` | 跳转到 GitHub 登录授权 |
| `GET /auth/callback` | 完成登录并返回本站 |
| `GET /api/board` | 获取身份、全部纸条与回复，允许匿名 |
| `POST /api/notes` | 添加自己的纸条：`{ body, position }` |
| `PATCH /api/notes/:id` | 修改自己的内容或位置：`{ body?, position? }` |
| `DELETE /api/notes/:id` | 删除自己的纸条及其回复 |
| `POST /api/notes/:id/replies` | 在纸条下回复：`{ body }` |
| `PATCH /api/replies/:id` | 修改自己的回复：`{ body }` |
| `DELETE /api/replies/:id` | 回复作者或纸条作者删除回复 |

需要登录的接口使用 `Authorization: Bearer <本站会话>`。评论与回复 ID 使用 GitHub 返回的 Node ID，客户端不能自行指定作者。

## 本地审阅

站点未配置 `guestbook.api_url`，且在 `localhost`／`127.0.0.1` 打开时，前端使用浏览器本地存储和“预览访客”身份，可以审阅添加、拖动、修改、删除、回复操作。不会上传这些本地纸条到 GitHub，也不模拟其他用户的历史留言。

如果要运行真实接口，把 Secrets 写到被 Git 忽略的 `.dev.vars`，使用 `npx wrangler dev`，并把对应接口来源填到站点的 `api_url`。真实 GitHub 登录需要 App 中存在匹配的回调地址。UI 本地审阅不需要启动 Worker。
