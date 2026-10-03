# 布告栏接口

这是独立页面 `/guestbook/` 的轻量 Cloudflare Worker 接口。前端是本站自己的全屏纸条画布，数据保存在现有 Giscus 使用的 GitHub Discussions 仓库中，无需额外数据库。文章评论继续使用 Giscus；留言板的登录回调、纸条位置与内容、楼层回复管理由 Worker 处理。

Giscus 官方 App 的凭据和登录会话不能用于自定义接口，因此留言板需要一个独立的 GitHub App。它仍使用 [现有 Discussion #6](https://github.com/69gg/69gg.github.io/discussions/6)，无需迁移留言或替换文章评论。本站构建与 GitHub Pages 工作流不会自动部署 Worker。

## 准备与发布顺序

### 1. 安装部署工具并取得 Worker 地址

需要 Node.js 22 或更新版本，以及可创建 Workers 的 Cloudflare 账户。在本目录安装独立锁定的 Wrangler：

```sh
cd services/noticeboard
npm ci
npm run login
npm run deploy
```

第一次发布用于取得固定的 `workers.dev` 地址，例如 `https://null-noticeboard.<账户子域名>.workers.dev`。此时 App 与 Secrets 尚未配置，接口还不能提供留言服务；站点的 `guestbook.api_url` 先保持空值。`workers_dev: true` 启用正式地址，`preview_urls: false` 关闭每次版本上传产生的预览地址，GitHub 登录使用正式地址。

### 2. 创建并安装 GitHub App

把上一步输出的实际 HTTPS 地址传给工具：

```sh
npm run github:app -- --api-url "https://实际的Worker地址"
```

工具仅输出注册链接，不创建 App。它从 `wrangler.jsonc`、站点 `_config.yml` 和留言板页面的 `root_path` 读取仓库、名称与站点地址，预填登录回调和权限。打开输出的链接，在 GitHub 中确认后创建；名称已被占用时，可通过 `--name` 指定其他名称。注册链接参数见 [GitHub 官方文档](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters)。

| 设置 | 值 |
| --- | --- |
| Homepage URL | 工具读取的本站留言板地址 |
| Callback URL | 正式 Worker 地址加 `/auth/callback` |
| Request user authorization (OAuth) during installation | 不启用；访客从留言板发起带状态校验的登录 |
| Webhook | 不启用 |
| Repository permissions → Discussions | Read and write |
| Repository permissions → Metadata | Read-only，GitHub 自动添加 |
| 其他仓库、组织与账户权限 | 不申请 |
| Where can this GitHub App be installed? | Any account，公开 App |

把 App 安装到 `69gg` 账户，**仅选择 `69gg.github.io` 仓库**。访客只需要授权登录，不需要在自己的仓库安装 App。

### 3. 填写 App ID 并导入 Secrets

从 App 设置中记录 App ID 和 Client ID，分别填写到 `wrangler.jsonc` 的 `vars.GITHUB_APP_ID` 与 `vars.GITHUB_CLIENT_ID`。这两个值不是密钥。生成一个 Client secret，再下载 GitHub App 的 RSA 私钥。

准备工具会把下载的私钥转换为 Worker Web Crypto 所需的 PKCS#8，并生成 32 字节随机会话密钥：

```sh
npm run secrets:prepare -- --private-key "/安全目录/下载的私钥.pem"
npm run secrets:upload
npx wrangler secret put GITHUB_CLIENT_SECRET
```

最后一条命令会交互式接收 Client secret，避免把密钥放进命令参数和 shell 历史。准备工具只写本目录的 `.secrets.json`，不向 Cloudflare 上传，不在终端打印密钥。文件权限为 `0600`，包含 `GITHUB_PRIVATE_KEY` 与 `SESSION_SECRET`；`.secrets*.json`、`.dev.vars*`、`.env*`、本目录的 `.pem` 与 `.wrangler/` 已加入 Git 忽略规则。批量导入仅更新文件中列出的 Secrets。

密钥文件只生成一次，已有同名文件时不会覆盖。后续更新 Worker 直接使用 `npm run deploy`，不要重新生成会话密钥；更换 `SESSION_SECRET` 会让所有已有网站会话失效。Client secret、私钥和会话密钥只保存在本机受限文件与 Worker Secrets 中，不写入前端或站点公开配置。

### 4. 发布完整接口并接入站点

```sh
npm run deploy
```

完成 App 安装、配置和 Secrets 导入后，将同一个正式 Worker 地址填到站点根目录 `_config.shiro.yml`：

```yaml
guestbook:
  api_url: "https://实际的Worker地址"
  discussion_number: 6
```

之后按本站原有流程构建、发布静态页面。GitHub Pages 负责页面和资源；Worker 负责 GitHub 登录与 Discussions 读写。改用自定义接口域名时，同步修改 GitHub App 的 Callback URL 与 `guestbook.api_url`，回调地址必须完全对应。部署命令会发布接口，配置工具本身只准备本地文件和注册链接。

GitHub App 用户登录与 PKCE 参数见 [GitHub 官方文档](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)；Secrets 导入见 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 配置项

`wrangler.jsonc` 保存非敏感的部署配置。仓库、Discussion 和允许访问的网站来源已按本站现有设置填写，App ID 与 Client ID 等创建 App 后补入。

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

如果改用其他存储仓库，同步调整站点的 `comments.giscus.repo`、`guestbook.discussion_number` 和 Worker 对应配置，创建留言板 Discussion，并把 App 安装到该仓库。文章 Giscus 所用的仓库 ID 与分类 ID 也需使用新仓库的值。

## 数据与权限

- 顶层 Discussion 评论是一张纸条，正文末尾的隐藏 HTML 注释保存 `v`、`x`、`y`、`color`、`rotation`，以及可选的像素尺寸 `width`、`height`。旧纸条不带尺寸时，前端使用 CSS 的 320×440px 默认值；编辑时将选定尺寸一起保存。`color` 接受 `cream`、`rose`、`sage`、`blue`、`lilac` 五种预设，以及六位 `#RRGGBB` 自定义颜色；三位 HEX 由前端展开后提交。当前 `v: 2` 使用画布的像素坐标 `x`、`y`，允许负坐标，没有原木框的边界限制。旧 `v: 1` 的水平比例坐标仍可读取，前端按原 880px 布告栏换算显示，只有编辑或移动该纸条时才保存为新坐标。无元数据的旧留言按默认位置显示。
- 纸条和回复的 `body` 保持原始 Markdown，GitHub Discussions 继续原生显示。接口不改写 Markdown；本站前端复用本地 Marked 解析，并通过 DOMPurify 的 HTML profile 渲染到纸面。
- 纸条与回复保留 GitHub 的 `createdAt`、`updatedAt` 和作者，前端将完整创建时间以及有修改时的修改时间放在同一行。页面迁到根目录后继续使用同一条 Discussion，不改变已有评论 ID 或作者。
- Discussion 回复是纸条下面的楼层回复，保持真实 GitHub 作者身份。用户在网站上的写入、修改通过自己的 GitHub App 用户 Token 完成。
- 嵌套回复仍写为所属纸条的原生 Discussion 回复，末尾通过 `<!-- null-board-reply:{"parentId":"被回复的评论 Node ID"} -->` 记录站内父级。`POST /api/replies/:id/replies` 从 GitHub 查询被回复评论及所属纸条，再为当前用户创建回复；客户端不能通过正文参数改绑其他纸条。读取返回去掉元数据的 Markdown 与 `parentId`，旧回复返回 `null`。修改正文保留原父级。前端按父级组装嵌套列表，不限制继续回复的层数；原父级被删除或隐藏时，其余内容仍保留并显示在该纸条的回复列表中。GitHub 原生页面仍展示纸条下的回复，站内展示额外的嵌套关系。
- 留言与回复的表情使用 GitHub 原生 Reactions，支持 `THUMBS_UP`、`THUMBS_DOWN`、`LAUGH`、`HOORAY`、`CONFUSED`、`HEART`、`ROCKET`、`EYES`。读取返回各表情的 `content`、`count` 和 `viewerHasReacted`；登录访客可对任何人的内容添加或取消自己的表情，不需要内容所有权。写入使用该访客的用户 Token，不使用 App 代替访客点表情。计数读取 `reactionGroups.reactors.totalCount`，新增与取消复用 GitHub 的 [Reactions GraphQL 接口](https://docs.github.com/en/graphql/reference/reactions)。
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
| `POST /api/notes/:id/replies` | 在纸条下回复：`{ body }`，返回 `parentId: null` |
| `POST /api/replies/:id/replies` | 回复一条回复：`{ body }`，返回被回复评论的 `parentId` |
| `PATCH /api/replies/:id` | 修改自己的回复：`{ body }`，保留父级关系 |
| `DELETE /api/replies/:id` | 回复作者或纸条作者删除单条回复，保留其余内容 |
| `POST /api/notes/:id/reactions`、`POST /api/replies/:id/reactions` | 添加自己的 GitHub 表情：`{ content }` |
| `DELETE /api/notes/:id/reactions`、`DELETE /api/replies/:id/reactions` | 取消自己的 GitHub 表情：`{ content }` |

需要登录的接口使用 `Authorization: Bearer <本站会话>`。评论与回复 ID 使用 GitHub 返回的 Node ID，客户端不能自行指定作者。

## 本地审阅

站点未配置 `guestbook.api_url`，且在 `localhost`／`127.0.0.1` 打开时，前端使用浏览器本地存储和“预览访客”身份，可以审阅添加、拖动、修改、删除、回复操作。不会上传这些本地纸条到 GitHub，也不模拟其他用户的历史留言。

如果要运行真实接口，把 Secrets 写到被 Git 忽略的 `.dev.vars`，使用 `npm run dev`，并把对应接口来源填到站点的 `api_url`。真实 GitHub 登录需要 App 中存在匹配的回调地址。UI 本地审阅不需要启动 Worker。
