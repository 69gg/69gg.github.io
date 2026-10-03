# Null's Blog

这是一个基于 Hexo 的 GitHub Pages 站点。

## 结构

- `homepage/`：站点根路径 `https://www.pylindex.top/` 的个人主页静态资源。
- `source/`：Hexo 博客源码，生成后发布到 `https://www.pylindex.top/blog/`。
- `source/CNAME`：GitHub Pages 自定义域名，目前使用 `www.pylindex.top`。
- `_theme_overrides/shiro/layout/`：博客的本地 Nunjucks 模板，继承 Shiro 的内容渲染与功能。
- `_theme_overrides/shiro/source/`：蓝紫花纹主题的 CSS、动效脚本、本地纸纹图片和 SVG 装饰。
- `_config.shiro.yml`：博客导航菜单及原有功能开关。
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

- 改版只作用于 `/blog/`。配色、正文宽度、断点、字体分工和间距集中在 `_theme_overrides/shiro/source/css/folio.css`；日间与夜间使用同一套 CSS 变量。
- 背景保留参考图中的蓝紫底色、白花、枝叶、织纹、四角花饰与双线边框。导航和首页大站名直接落在花纹背景上，文章列表及页脚落在下方独立的阅读纸上。首页与分页只显示一个大站名；内页显示可返回首页的小站名。站名来自 `_config.yml` 的 `title`，当前为 `Null's Blog`。
- 阅读部分使用单张哑光纤维纸。独立的 `.folio-paper-surface` 放在正文下方：底层为纸色、侧光和窄幅边缘阴影，上层为本地 `paper-handmade.webp` 手工纸纹理，以 150px 平铺。日间使用柔白纸和墨蓝文字，纸纹正片叠底；夜间使用蓝灰纸和浅色文字，将纸纹反色后滤色叠加，让纤维在深色纸上仍可见。两种模式同时切换纸面和文字的明暗关系，避免都呈现为偏黄的浅纸。纸纹自带纤维起伏，配合薄纸边和向右下方投落的软影呈现厚度，不做折角、叠页或塑料反光。通过 `--folio-paper`、`--folio-paper-grain-opacity`、`--folio-paper-grain-blend`、`--folio-paper-grain-filter`、`--folio-paper-edge-light`、`--folio-paper-edge-shade`、`--folio-paper-contact` 和 `--folio-paper-shadow` 调整。
- 纸边使用四条轻微起伏的 `paper-edge-*.svg` 遮罩，以固定 4px 深度沿各自边缘平铺，不随正文长度放大，也不做明显锯齿或撕口。遮罩和投影只作用于装饰层，正文及焦点轮廓不裁切，文章固定目录的定位也不受影响。装饰设为 `aria-hidden`、`pointer-events: none`。旧的程序噪声 `grain.svg` 不再用作阅读纸纹。
- 当前纸纹来源为 Le Marquis 的 [Handmade Paper](https://www.transparenttextures.com/handmade-paper.html)，透明版本由 Transparent Textures 提供，原始集合为 Subtle Patterns。转换成无损 WebP 随站点保存，页面无需向素材站发请求；来源、作者、CC BY-SA 3.0 许可及转换说明见 `_theme_overrides/shiro/source/images/PAPER-LICENSE.md`。上一版 `paper-fibers.webp` 保留为素材，不再绘制到阅读区。
- `source/images/floral-paper.webp` 保留用户清晰参考图的原始裁片。`floral-paper-still.webp` 是静止背景源图：花枝原位用相邻纸纹补齐，中央镜像接缝也用非镜像纸纹替换，避免紧贴在一起的成对花簇。页面使用同一张图的高质量压缩版本 `floral-paper-display.webp`，保持 1932 × 2196px、原有构图和配色，体积从 1,396,144B 减至 877,444B。桌面按素材原尺寸平铺，手机等比缩小，避免拉伸放大造成粗糙；纸纹本身不飘动。需要重新导出时使用 ImageMagick：`magick floral-paper-still.webp -quality 88 -define webp:method=6 floral-paper-display.webp`，并对照原图检查纹理。
- 背景沿用既有蓝紫花纹素材和配色：日间直接显示原图，夜间使用 `--folio-surround-filter: brightness(.75) saturate(.92)`，将亮度从原图的 63% 提高到 75%，保留原有饱和度；四角边框与花瓣沿用原有透明度。阅读纸面、字体或花枝动效的调整不应重新给背景染色或叠加光色。站名、导航通过独立的 `--folio-masthead-ink` 保持可读。
- 手机首簇左侧花枝向下错开，给大站名留出空间；菜单、搜索和主题按钮始终使用题头文字色，悬停时只增加淡色底，避免上游菜单样式在夜间把箭头压暗。手机菜单回归检查覆盖两种主题下的常态与悬停颜色，以及键盘焦点和关闭操作。
- `blossom-1.webp` 至 `blossom-5.webp` 从已有花枝透明图层中提取五种独立、不镜像的花簇。`surround.njk` 将 12 簇花分散放在两侧，前四簇在首屏附近，其余沿长文档分布，中央题头留白。每簇各有横向与纵向两条独立相位，分别注册为 CSS `@property`，用 `sin()` / `cos()` 计算漂移和摆动；周期、负延迟、方向与部分转角错开，避免整层花齐步转向。默认横纵摆幅为 42px / 28px，手机缩小为 22px / 18px，周期为 61–124 秒，转角约 3.5–5 度。扩大运动范围的同时延长周期，保持缓慢转向；桌面位移速度不超过 5px/s。调整 `--folio-flower-x`、`--folio-flower-y`、`--folio-flower-turn` 与模板中的周期参数即可。原来的 `flowers-1.webp` 至 `flowers-3.webp` 保留作为素材来源，不再绘制到页面上。
- `corner.svg` 按参考图重绘扇形花饰，细双线避开四角，并在四边中点放置小菱形。花纹、外框和花瓣层覆盖整张页面，与正文一起原生滚动，形成长卷效果；上方花角位于页首，下方花角位于页尾。短页面也至少铺满一屏，无需滚动监听或视差脚本。
- 两侧花瓣增加为 24 片（手机 12 片），前五对按视口高度安排，其余沿文档分布，保持 24–30 秒的缓慢下落。纸面上方的 `.folio-foreground` 放置 8 片淡花瓣（手机 6 片），前四片分散在首屏附近，其余沿正文分布，以 30 / 34 / 38 秒错开缓落。前景有效不透明度最高约 36%，不影响正文阅读。两种花瓣复用 `petal.webp`，只改变 `transform` 和 `opacity`；都使用 `aria-hidden` 和 `pointer-events: none`，不拦截链接或搜索。
- 页面隐藏时暂停花枝和花瓣动画；系统开启“减少动态效果”时停止装饰动画。正文默认可见，禁用 JavaScript 时仍能浏览文章与导航。
- 所有博客页面的页头提前预加载背景、花枝、花瓣、纸纹和纸边；背景使用高请求优先级。`scripts/folio-preloads.js` 从现有 CSS 自动提取资源路径，保持与 CSS 完全相同的 URL 和蒙版的 CORS 模式，避免重复下载或素材更新后提示失效。页头在解析预加载链接前监听其完成或失败，由 CSS 直接使用原始请求并负责绘制解码，不再通过额外的 `Image` 消耗预加载结果；关闭 HTTP 缓存时也只请求一次。字体由 CSS 按实际选中的字体、字重及 Unicode 分片加载，不提前下载本机已有字体的回退文件。搜索继续复用 Shiro 的空闲及用户操作预热，去除与它重复的 Pagefind 页头预取。
- `folio-preload.js` 在可选的 MathJax 等脚本之前启动，等待装饰预加载完成、首屏正文图片解码及浏览器实际使用的字体就绪，再让完整画面一起显示；首屏正文图片取消懒加载，入场动画从就绪时开始。等待期间通过透明度隐藏整页，保持 CSS 的资源发现正常，并用 `inert` 暂停交互；就绪或超时后恢复。站内原生过渡等待期间暂停旧、新画面的淡变，保留上一页的完整画面。未支持原生过渡时，新页面准备好后轻柔出现。图片、字体失败时仍可阅读；`_config.shiro.yml` 的 `folio.preload_timeout`（默认 6000ms）限制最大等待时间，加载脚本失败也会解除等待，超时后才执行的脚本不重新冻结页面。禁用 JavaScript 时不设置等待状态，仍正常显示内容。
- 整体动效集中复用 `--folio-ease` 缓停曲线和 `--folio-motion-*` 时间变量：首屏导航、花体站名和纸面依次轻柔出现；文章卡片、归档条目、正文标题、引文和图片在首次进入视口时淡入并上移 14px，同批元素最多错开 195ms，重复滚动不重播。正文始终保留默认可见状态；目录等固定控件的内容祖先不做位移动画。
- 浏览器支持时，同站页面跳转使用原生 View Transitions，以 480ms 淡入淡出衔接；主题切换复用 Shiro 已有的原生过渡实现和相同曲线，不拦截普通链接。页头同步监听 `pagereveal`，在新页面使用原生过渡时跳过导航、站名和纸面的额外入场，避免过渡结束后重播；文章仍可随滚动出现。手机菜单通过 `0fr` / `1fr` 网格行在 420ms 内展开、收起，保持原有键盘焦点、`inert` 和 Escape 行为；链接、箭头和按钮的悬停与按下反馈约 220–420ms。浏览器未支持或跳过原生页面过渡时沿用普通导航和轻柔入场；减少动态效果时停用所有入场、展开和页面过渡，并立即显示内容。
- 首页和后续分页的站名右侧是“全部文章”链接，不再显示独立的“最新文章”栏。站名为一级标题，文章标题为二级标题；窄屏允许链接自然换行。日期只显示在列表左侧，保留 Cormorant Garamond 的数字样式，并用带完整日期名称的链接进入对应年份归档；标题下仅保留分类、字数与阅读时长，复用 Shiro 的分类和字数 helper。文章内页仍保留完整元信息。
- 排版优先使用设备上已安装的同名字体；中文另外兼容 Noto Serif CJK SC、Noto Sans CJK SC 及对应等宽版本。完整的五套 WOFF2 回退仍随主题保存，设备没有相应字体时才从本站加载，不依赖 Google Fonts 在线样式表。`css/fonts.css` 将 Web Font 命名为 `Folio …`，与系统字体分开，让浏览器保留原生的字重匹配；不会用同一个本机常规字体冒充多个字重。站名使用 Great Vibes 花体；中文标题、摘要和正文使用 Noto Serif SC；导航、按钮和元信息使用 Noto Sans SC；日期使用 Cormorant Garamond；代码使用 Noto Sans Mono，中文注释沿用中文无衬线回退。字体保留上游提供的 Unicode 分片，按需加载，不根据现有文章删减字符。来源、许可证与手动更新方法见下方“本地字体”。
- 列表标题桌面 25px、手机 21px，中等字重；摘要桌面 16px、手机 14px，最多三行、两倍行高，行长不超过 `46em`；内页正文桌面 17px、手机 16px。摘要保持宋体斜体，不加载行书字体。通过 `--folio-display-font`、`--folio-date-font`、`--folio-serif`、`--folio-ui` 等变量保持各自分工。
- 标题、文章数量、日期、摘要和链接来自 Hexo 配置及文章集合，不另维护内容列表。桌面与手机导航共用 `_config.shiro.yml` 的 `menu`，当前为首页、归档、分类、标签与随机阅读。模板优先读取站点明确配置的完整菜单，避免 Hexo 按索引合并数组后，在缩短菜单时补回主题默认入口；未配置菜单时仍使用主题默认值。公共页脚紧接分页，保留小装饰线、浏览入口、版权与构建信息，不显示页尾短句或框架和主题署名；版权居中位于构建信息上方。
- 不要直接编辑 `node_modules`。升级 Shiro 后，检查被覆盖模板与上游兼容性，重新构建并执行测试。日常构建无需原始参考图片、Python 或字体服务。

## 本地字体

资源位于 `_theme_overrides/shiro/source/fonts/`。五套字体均附上游 `OFL.txt`，`manifest.json` 记录每个分片的原始 URL 和 SHA-256。字体使用 Google Fonts 官方提供的版本，常规构建直接复制已保存文件，不向字体服务发起请求。浏览器先使用本机字体，缺失时按需下载这些本站回退文件；本机没有任何对应字体时仍能完整显示。

构建时 `tools/patch-theme.js` 从完整的 `fonts.css` 自动生成约 24KB 的 `fonts-core.css`，保留拉丁、符号及其他不含 CJK 统一表意文字的声明。首页先加载这张小表，避免本机已有中文字体时仍被约 217KB 的完整声明表阻塞。`folio-preload.js` 用不加入文档的、仅包含 `local()` 来源的 `FontFace` 探测中文宋体及无衬线字体；任一缺失时，加载完整声明表、重新完成布局，并等实际字体就绪再展示。探测不下载字体、不替换本机字重；禁用 JavaScript 时通过 `noscript` 加载完整表。不要手工编辑生成的核心表。

| 字体 | 用途 | 本地文件目录 |
| --- | --- | --- |
| Great Vibes | 大、小站名花体 | `fonts/greatvibes/` |
| Cormorant Garamond | 日期和文章数量 | `fonts/cormorantgaramond/` |
| Noto Serif SC | 中文标题、摘要及正文 | `fonts/notoserifsc/` |
| Noto Sans SC | 导航、按钮、元信息及代码中的中文 | `fonts/notosanssc/` |
| Noto Sans Mono | 代码 | `fonts/notosansmono/` |

只有主动更新字体时才运行 `python tools/vendor-fonts.py`（Python 标准库即可）。该工具从 Google Fonts 下载 WOFF2 分片，保留 `unicode-range` 与字重范围，将 URL 改为本地路径，并保存官方许可证和校验清单。更新后重新构建、运行测试，并将字体、样式表与清单一并提交。Google Fonts 上游：[字体仓库](https://github.com/google/fonts)。

## 文章摘要

首页及后续分页优先使用文章 front matter 中的非空字符串 `summary`，按纯文本显示并转义 HTML；支持 YAML 折叠多行写法：

```yaml
---
title: 文章标题
summary: >-
  在这里写文章摘要。
  多行会合并成一段文字。
---
```

`summary` 缺失、为空、仅含空白或不是字符串时，沿用 Shiro 原有摘要逻辑：先使用文章的 `excerpt`（包括 `<!-- more -->` 之前的内容），否则按 `_config.shiro.yml` 中的 `excerpt.fallback` 设置从正文生成摘要。摘要继续使用三行斜体排版，`summary` 不替换文章正文。

## 测试

```bash
npm run build
npm run check:public
npm test
npx playwright install chromium
npm run test:e2e
```

若本机已经安装 Google Chrome，也可使用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`，无需安装另一套浏览器。`PREVIEW_PORT` 可设置浏览器测试使用的端口。

浏览器测试覆盖精简首屏、站名右侧“全部文章”的布局和跳转、摘要使用正文宋体并保持斜体、实际文章导航、分页、中文搜索、随机阅读、深色模式持久化、精简后的桌面和手机菜单、键盘操作、目录跳转，以及 320 / 390 / 768 / 1024 / 1440px 下的首页、正文、归档、留言、标签和分类布局；这些宽度下还检查页脚紧接页码，避免上方间距重新叠加。另检查独立花簇分布在两侧、中央不再堆叠、各自朝不同方向位移时纸纹保持静止、不同相位完整循环中的速度与加速度上限、首屏两侧与纸面上方的花瓣数量、前景花瓣的绘制层级及覆盖控件时的实际点击穿透、飘动时边缘覆盖与横向溢出、可见性信号触发暂停与恢复、动态切换减少动效、禁用 JavaScript 时的可读性、纸纹与花瓣本地加载解码、花朵素材的真实透明通道、宽屏下纹样不拉伸放大、背景、边框与前景随页面等距滚动、长短页面的背景覆盖、上下花角在页首与页尾完整显示及装饰不遮挡搜索操作。测试会阻断第三方服务请求，Giscus 登录发言和 MathJax CDN 实际加载不属于离线回归测试的验证范围。

GitHub Actions 构建时运行产物检查和 Node 测试。浏览器回归测试可按需在本地执行；长页尺寸检查先等待本地字体就绪，并在懒加载评论样式引起布局变化时重新定位页底花角，仍要求花角完整可见。审阅截图可放在已忽略的 `artifacts/review/`，测试失败的截图与 trace 位于已忽略的 `test-results/`。

整体动效测试采样真实浏览器帧，验证文章入场时的位移和透明度连续变化、重复进入视口不重播、手机菜单高度平滑展开与收起，以及关闭时立即恢复不可交互状态。页面导航检查原生过渡的启用和结束，浏览器跳过过渡时仍要求轻柔入场且内容可读；主题切换另验证原生淡入淡出实际启动与完成，结束后标题不重复入场。原生功能检查仅在浏览器支持相应 API 时执行，另检查减少动态效果和缺少 IntersectionObserver 时内容仍然可读。

预加载回归在新浏览器上下文中分别延迟样式表、背景和站名字体，确认装饰资源在 CSS 解析前就开始请求，字体只在样式选择后请求，资源及字体就绪前不暴露不完整的页面，且每项关键资源只请求一次。另在关闭缓存的快速冷启动中检查装饰资源及 Pagefind 组件只请求一次；站内跳转检查上一页在延迟期间保持可见。另模拟图片、字体与加载脚本失败，要求内容仍可显示。Node 测试检查资源更新后预加载路径随 CSS 改变、蒙版请求模式匹配、未强制预加载回退字体，以及首页、分页、归档与正文的提示和脚本顺序。

摘要测试使用真实文章卡片模板和 Shiro 视图模型，覆盖 `summary` 优先级、多行 YAML、HTML 转义，以及无有效 `summary` 时的手动摘要、自动截断和关闭自动摘要等回退行为。浏览器另在明暗主题与桌面、手机宽度下检查标题和摘要的字号比例、最小字号、最大行长，以及标题、元信息、摘要之间不会重叠。对比度检查将本地纤维纹理的实际像素、明暗模式的混合方式、透明度和柔光一起计算，覆盖纸纹最深、最浅位置的标题、元信息、摘要、日期与阅读链接对比度；纸纹起伏按纹理最亮与最暗位置的相对对比衡量，兼顾柔白纸和蓝灰纸。另要求明暗纸面的相对亮度有足够差距、日间使用深色字且夜间使用浅色字，防止两个模式重新变得接近。花枝测试采样完整循环，检查摆幅扩大后速度和加速度仍保持平缓。字体测试阻断第三方请求，通过 Chrome 实际字形字体信息分别验证本机优先和本机字体缺失后的完整 Web Font 回退，覆盖站名、中文标题、摘要、导航、日期和代码；Node 测试校验每份 WOFF2、许可证及构建拷贝的完整性。
