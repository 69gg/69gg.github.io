# Null's Blog

这是一个基于 Hexo 的 GitHub Pages 站点。

## 结构

- `homepage/`：站点根路径 `https://www.pylindex.top/` 的个人主页静态资源。
- `source/`：Hexo 博客源码，生成后发布到 `https://www.pylindex.top/blog/`。
- `source/CNAME`：GitHub Pages 自定义域名，目前使用 `www.pylindex.top`。
- `_theme_overrides/shiro/layout/`：博客的本地 Nunjucks 模板，继承 Shiro 的内容渲染与功能。
- `_theme_overrides/shiro/source/`：蓝紫花纹主题的 CSS、动效脚本、本地纸纹图片和 SVG 装饰。
- `_config.shiro.yml`：原有功能开关，以及 `folio` 下的页尾短句和字体配置。
- `scripts/ensure-abbrlinks.js`：构建前补齐历史文章的固定 `abbrlink`。
- `tools/patch-theme.js`：构建或启动 Hexo 前，将本地模板和资源覆盖到已安装的 Shiro 主题；重新安装依赖后也会自动应用。
- `scripts/build-info.js`：Hexo helper，给博客页脚输出构建时间和提交 hash。
- `scripts/clean-public.js`：构建前清理旧的 `public/` 产物。
- `scripts/copy-root-assets.js`：构建后把个人主页、`img.json` 和 `CNAME` 复制到 `public/` 根目录。
- `scripts/build-sitemap.js`：构建后把 Hexo sitemap 提升到站点根，并补上个人主页。
- `tools/check-public.js`：校验 GitHub Pages artifact 必需的首页、博客首页、根 `CNAME` 和全站 sitemap。
- `tests/`：构建产物、模板覆盖与浏览器功能回归测试。

GitHub Actions 会发布 `public/`。不要使用 `npm run deploy` 发布到 `main` 分支；当前仓库源码也在 `main`。

## 构建

```bash
npm ci
npm run build
npm run check:public
npm test
```

构建产物会输出到 `public/`：

- `public/index.html`：个人主页。
- `public/blog/`：Hexo 博客。
- `public/sitemap.xml`：全站 sitemap，对应 `https://www.pylindex.top/sitemap.xml`。
- `public/CNAME`：GitHub Pages 自定义域名配置。

## 本地审阅

```bash
npm run build
npm run preview
```

打开 `http://127.0.0.1:4173/blog/`。预览服务只监听本机，直接提供完整构建产物，因此搜索索引、分页、RSS 和随机阅读都可在本地使用。修改文件后重新执行 `npm run build` 并刷新页面即可；需要其他端口时可执行 `npm run preview -- -p 4174`。

`npm run server` 仍可用于 Hexo 开发，但完整站点审阅优先使用 `preview`：根目录个人主页由构建后的复制步骤生成，Pagefind 搜索索引也在完整构建时生成。

这次视觉改版仅覆盖 `/blog/`，根目录 `homepage/` 保持原样。文章 Markdown、固定链接、归档、标签、分类、RSS、搜索、随机阅读、深色模式、目录、阅读进度、代码复制、图片灯箱、数学公式和 Giscus 评论继续使用原有实现。留言板改用与正文一致的排版，Giscus 配置不变。随机阅读使用包含站点根路径的相对地址，避免本地审阅跳到线上。

## 视觉配置与维护

- 配色、正文宽度、断点和间距集中在 `_theme_overrides/shiro/source/css/folio.css`；日间与夜间使用同一套 CSS 变量。
- 背景原始素材为 `source/images/floral-paper.webp`，从用户提供的清晰版参考图中裁取无文字、无边线的区域，保留原有蓝紫底色、白花、细枝叶与织纹，不做整体染色或模糊处理。页面使用下述分层素材。裁片以镜像方式接续边缘；桌面按素材原尺寸显示，宽屏通过重复覆盖，避免拉伸放大造成粗糙。手机按窗口宽度缩小纹样，保持镜像花簇靠近两侧留白，最大不超过素材原尺寸。`petal.webp` 从同一参考图提取透明花瓣；素材随源码保存，日常构建无需原始图片、Python 或图片服务。
- `source/images/corner.svg` 按参考图重绘扇形花饰，细双线避开四角花饰，并在四边中点加入小菱形；尺寸、边距、背景比例及动效参数在 CSS 变量中设置。`layout/_partial/folio/surround.njk` 组织外框装饰。
- 首页与后续分页使用同一行站名和右侧“全部文章”链接，下面直接显示文章列表，不再显示“最新文章”标题或独立分隔栏。站名为一级标题，列表中的文章标题为二级标题；文章数量来自 Hexo。
- 标题、描述与文案来自 Hexo 配置；文章数量、日期、摘要及链接直接来自文章集合，不维护另一份手写列表。
- 公共页脚保留页尾短句、浏览入口、版权信息与构建信息，不显示框架和主题署名。
- 花纹、双线外框和花瓣层覆盖整张页面，随正文原生滚动，形成长卷效果；上方花角位于页首，下方花角位于页尾。`body` 建立定位与独立块格式化上下文，包含纸面上下留白，短页面也至少铺满一屏。背景按原有比例重复铺陈，无需滚动监听或视差脚本。20 片透明花瓣分布于两侧，前四对按视口高度安排，余下沿文档分布；手机缩小花瓣并保留 10 片。两侧花瓣位于阅读纸面下方，以 24–30 秒的不同周期与错开的起始时间匀速缓落，淡入淡出，避免同时出现或集中消失；动画只改变 `transform` 和 `opacity`。通过 `--petal-row`、`--petal-delay` 和 `--petal-period` 管理位置与节奏。装饰层不接收鼠标事件。切到其他标签页时暂停装饰动画，系统开启“减少动态效果”时停止装饰动画。保留入场与链接反馈；正文默认可见，不再等待字体加载结束才显示页面，无 JavaScript 时也能浏览文章和导航。
- 阅读纸面内的 `.folio-foreground` 另放置 6 片较淡的前景花瓣（手机 4 片），经过文章表面时保持不高于约 36% 的有效不透明度，深色模式略微提亮花瓣以保持可见；首屏与后续正文分散安排，按 30 / 34 / 38 秒周期错开缓落。复用同一透明素材与花瓣动画，仅调整位置、幅度、大小、亮度与透明度。前景在文字上方绘制，按纸面圆角裁切，随文档滚动；设置 `aria-hidden` 和 `pointer-events: none`，不进入无障碍内容、不拦截文章链接、菜单和搜索操作，并复用全站动效暂停规则。
- 花朵与纸纹分层：保留 `floral-paper.webp` 作为原始参考素材，从选定花簇中按色彩分离花瓣和枝叶，保存为三张具有真实透明通道的 `flowers-1.webp` 至 `flowers-3.webp`；`floral-paper-still.webp` 用相邻纸纹补齐花朵原位，避免飘动时出现双影。选区包含首屏左右留白中的上方小花和中段花簇，避免动态花朵主要落在正文遮挡区。所有图层保持相同尺寸、镜像接续与背景对齐方式。`.folio-pattern` 保持静止，三组 `.folio-flowers` 以 24 / 28 / 32 秒的周期和错开的相位沿平滑椭圆轨迹漂移。用 `@property` 注册角度，通过 `sin()` / `cos()` 计算位置，让速度和转向连续变化，避免多段缓动在途经点反复停顿。通过 `--folio-flower-x`、`--folio-flower-y` 和 `--folio-flower-period` 调节幅度与周期，桌面横纵幅度为 22px / 16px，手机缩小为 10px / 8px。外层裁切防止横向滚动，纸纹始终铺满底部。花朵动效同样随页面隐藏暂停，并响应“减少动态效果”；卷轴滚动与静止的外框不受影响。
- 字体按位置区分：顶部小站名使用 Jost 中等字重，大号站名使用 Bodoni Moda 的原生斜体，文章标题使用 LXGW WenKai TC（霞鹜文楷 TC），导航使用 Noto Serif SC 并加宽字距；正文保留 Noto Serif SC。分别通过 `--folio-brand-font`、`--folio-display-font`、`--folio-heading-font`、`--folio-nav-font` 和 `--folio-serif` 调整，按钮与元信息使用 `--folio-ui` 的系统字体。网页字体由 Google Fonts 按所需字重、斜体及字符子集加载，可修改或清空 `folio.fonts_url`；加载失败时使用对应的系统黑体、衬线体或楷体，字体加载不阻塞内容显示。Giscus、MathJax 与图片灯箱的外部资源沿用原有配置。
- 文章列表左侧日期栏恢复使用原来的 Cormorant Garamond，单独由 `--folio-date-font` 控制，避免受站名与标题字体调整影响；中文月份使用宋体回退。
- 文章列表摘要使用与正文一致的 Noto Serif SC 宋体，并设置斜体，通过 `--folio-excerpt-font` 单独控制，桌面 18px、手机 16px，保留三行摘要和两倍行高；中文斜体字形由浏览器合成。不再加载摘要使用的行书字体。文章内页正文继续使用正常宋体。列表标题保留霞鹜文楷，字号为桌面 28px、手机 22px。
- 不要直接编辑 `node_modules`。升级 Shiro 后，检查被覆盖模板与上游布局的兼容性，并重新构建和执行测试。

## 测试

```bash
npm run build
npm run check:public
npm test
npx playwright install chromium
npm run test:e2e
```

若本机已经安装 Google Chrome，也可使用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`，无需安装另一套浏览器。`PREVIEW_PORT` 可设置浏览器测试使用的端口。

浏览器测试覆盖精简首屏、站名右侧“全部文章”的布局和跳转、摘要使用正文宋体并保持斜体、实际文章导航、分页、中文搜索、随机阅读、深色模式持久化、手机菜单与键盘操作、目录跳转，以及 320 / 390 / 768 / 1024 / 1440px 下的首页、正文、归档、留言、标签和分类布局；另检查花簇各自位移时纸纹保持静止、完整循环中的速度与加速度上限、首屏两侧与纸面上方的花瓣数量、前景花瓣的绘制层级及覆盖控件时的实际点击穿透、飘动时边缘覆盖与横向溢出、可见性信号触发暂停与恢复、动态切换减少动效、禁用 JavaScript 时的可读性、纸纹与花瓣本地加载解码、花朵素材的真实透明通道、宽屏下纹样不拉伸放大、背景、边框与前景随页面等距滚动、长短页面的背景覆盖、上下花角在页首与页尾完整显示及装饰不遮挡搜索操作。测试会阻断第三方服务请求，Giscus 登录发言和 MathJax CDN 实际加载不属于离线回归测试的验证范围。

GitHub Actions 构建时运行产物检查和 Node 测试。浏览器回归测试可按需在本地执行。审阅截图可放在已忽略的 `artifacts/review/`，测试失败的截图与 trace 位于已忽略的 `test-results/`。
