# Null's Blog

这是一个基于 Hexo 的 GitHub Pages 站点。

## 结构

- `homepage/`：站点根路径 `https://www.pylindex.top/` 的个人主页静态资源。
- `source/`：Hexo 博客源码，生成后发布到 `https://www.pylindex.top/blog/`。
- `source/CNAME`：GitHub Pages 自定义域名，目前使用 `www.pylindex.top`。
- `scripts/ensure-abbrlinks.js`：构建前补齐历史文章的固定 `abbrlink`。
- `scripts/clean-public.js`：构建前清理旧的 `public/` 产物。
- `scripts/copy-root-assets.js`：构建后把个人主页、`img.json` 和 `CNAME` 复制到 `public/` 根目录。

GitHub Actions 会发布 `public/`。不要使用 `npm run deploy` 发布到 `main` 分支；当前仓库源码也在 `main`。

## 构建

```bash
npm ci
npm run build
```

构建产物会输出到 `public/`：

- `public/index.html`：个人主页。
- `public/blog/`：Hexo 博客。
- `public/CNAME`：GitHub Pages 自定义域名配置。
