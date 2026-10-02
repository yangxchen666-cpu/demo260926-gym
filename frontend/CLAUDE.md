# frontend/CLAUDE.md

React 19 + TypeScript + Vite 8 + Tailwind CSS v4 的场馆目录 SPA（中文 UI），经 Vite proxy 调后端 `/api`（见根目录 CLAUDE.md 的数据链路）。

## 命令

```bash
npm run dev      # Vite :5173，/api 代理到 https://localhost:8000（uvicorn 自签证书，preview 同）
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

无测试套件。

## 架构要点

**路由**（react-router-dom v7）：`src/App.tsx` 仅是路由壳（`/` 目录、`/venues/:id` 详情、`*` 重定向首页）+ 路由切换 `scrollTo(0,0)`；页面实体在 `src/pages/`。

**列表状态存 URL**：`VenueDirectoryPage` 的搜索/筛选/页码用 `useSearchParams` 存于 `?q=&type=&page=`——搜索词 300ms 防抖后以 `replace` 写入（避免逐键堆积历史），类型/页码用 push；输入框本地 state + 从 URL 反向同步。改列表行为时不要退回 useState，否则详情返回无法还原筛选。

**数据拉取防竞态**：两个页面都用 seq ref 模式（`const cur = ++seq.current`，响应回来时 `cur !== seq.current` 则丢弃）。新增拉取逻辑沿用。

**类型与接口字段约定**：列表接口只返回 5 字段，详情返回 8 字段；`types.ts` 用 `Venue` / `VenueDetail`（extends）对应。后端改字段需同步这里。

**Tailwind v4 纯 CSS 配置**：无 tailwind.config.js，token 全在 `src/index.css` 的 `@theme`（paper/card/ink/flame/royal/line/muted）。**class 必须是字面量字符串**，不能动态拼接（v4 按字面量编译）；类型→颜色映射走 `typeColors.ts`。

**画报风设计语言**：`border-2 border-ink` 粗黑边框、`font-display` 黑体 900 斜体大标题、`.pictorial-stripes` 页首橙蓝双条纹（index.css）。新组件保持同一语言，错误/空态/加载态样式可参照 `pages/` 两个页面里的现有实现。

**tsconfig 严格**：类型导入必须 `import type`，禁未用变量/参数——build 会因此挂。
