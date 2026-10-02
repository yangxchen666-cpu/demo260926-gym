# admin-frontend/CLAUDE.md

React 19 + TypeScript + Vite 8 + Tailwind CSS v4 的管理后台 SPA（中文 UI），经 Vite proxy 调 admin-backend 的 `/api`（见根目录 CLAUDE.md 的数据链路）。

## 命令

```bash
npm run dev      # Vite :5174，/api 代理到 https://localhost:9000（admin-backend，preview 同）
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

无测试套件。

## 架构要点

**路由**（react-router-dom v7）：`/login` 公开；其余包在 `<Route element={<RequireAdmin />}>` 内（守卫 + Layout 嵌套，`<Outlet />` 渲染子路由）。`RequireAdmin`：checking 渲染 null（不闪烁）、guest 跳 /login；`Layout` 顶栏含导航与管理员邮箱/退出。编辑页二合一：`/venues/new` 与 `/venues/:id/edit` 共用 `VenueEditPage`（users 同理），编辑态挂载时拉详情回填。

**认证**：`src/auth.tsx` 的 `AdminAuthProvider`/`useAdminAuth`（status 三态，挂载时 `GET /api/me` 恢复）；token 存 localStorage，key `demo001-admin-token`（与前台 `demo001-token` 隔离，同浏览器互不污染）。`src/api.ts` 的 `apiFetch` 自动带 Bearer，**401 清 token 整页跳 /login**（抛 `AuthRedirectError`，页面层捕获后忽略，覆盖会话中途过期）；登录页用裸 fetch 走 `apiError` 中文化。

**列表状态存 URL**：两个列表页的搜索/筛选/页码存 `?q=&type=&page=`（帮助函数 `updateParams` 在 `src/search-params.ts`），搜索 300ms 防抖以 `replace` 写入；数据拉取用 seq ref 防竞态——均沿用 frontend 的既有模式，不要退回 useState。

**类型与字段**：`src/types.ts` 的 `VenueRow`（8 字段全量）/`UserRow`（含 `created_at`）与 admin-backend 返回对齐；四类型常量 `VENUE_TYPES` 前端硬编码（与 DB CHECK 约束对齐，无需接口拉取）。改字段需同步 admin-backend 与此处。

**删除语义**：删除经 `ConfirmDialog` 二次确认（遮罩/ESC 取消）；编辑/删除遇到 404（detail 为 `venue not found`/`user not found`）视为「已被他人删除」，提示并刷新列表，不当报错。

**Tailwind v4 纯 CSS 配置**：无 config 文件，token 全在 `src/index.css` 的 `@theme`（bg/surface/line/ink/muted/accent/accent-strong/danger——中性灰白 + 单一主色蓝的中性后台风）。**class 必须字面量**（v4 按字面量编译）。与前台画报风刻意切割：无粗黑边框、无斜体大字、无条纹。

**tsconfig 严格**：类型导入必须 `import type`，禁未用变量/参数——build 会因此挂。
