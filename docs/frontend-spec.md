# Frontend SPEC — 场馆目录 Web 应用技术规格

> 状态基线:2026-10-02。本文档描述**当前实现**,对应 `frontend/` 目录。

## 1. 技术栈与构建

| 组件 | 版本 |
|---|---|
| React | ^19.2.8 |
| TypeScript | ~6.0.2(注意:**未开启 `"strict": true`**,现状事实) |
| Vite | ^8.3.0(+ @vitejs/plugin-react ^6.1.1) |
| Tailwind CSS | v4 ^4.3.3(经 `@tailwindcss/vite` 插件,纯 CSS 配置,无 tailwind.config.js) |
| react-router-dom | ^7.18.4 |
| Lint | oxlint ^1.81.0(react/typescript/oxc 插件;rules-of-hooks error、only-export-components warn) |

scripts:`dev`(vite)、`build`(`tsc -b && vite build`,project references 拆 app/node 两 tsconfig)、`lint`(oxlint)、`preview`。

tsconfig.app.json 要点:target ES2023、moduleResolution bundler、`verbatimModuleSyntax`(类型必须 `import type`)、`noUnusedLocals/noUnusedParameters`、jsx react-jsx。

## 2. 架构

- **挂载序**(`main.tsx:8-16`):`StrictMode > AuthProvider > BrowserRouter > App`(AuthProvider 在 Router 外层,不依赖路由)
- **路由表**(`App.tsx:15-19`):`/` → VenueDirectoryPage;`/venues/:id` → VenueDetailPage;`*` → `<Navigate to="/" replace />`
- 路由切换 `useEffect` 按 `location.pathname` 变化 `scrollTo(0, 0)`(进详情回顶;返回列表由浏览器恢复滚动)
- **数据流**:fetch 相对路径 `/api` → Vite 代理 → FastAPI;列表页状态三来源 URL(searchParams)→ 请求(seq ref 防竞态)→ 组件 state
- **代理**(`vite.config.ts`,server 与 preview 同):`'/api' → https://localhost:8000, secure: false`(后端自签 TLS)

## 3. 文件清单(src/,16 文件)

| 文件 | 职责 |
|---|---|
| `main.tsx` | 入口挂载 |
| `App.tsx` | 路由壳 + 回顶 |
| `auth.tsx` | AuthProvider + useAuth(token 存取/登录态/错误中文化) |
| `types.ts` | Venue/VenueDetail/VenueType/AuthUser/AuthResponse/CaptchaData |
| `typeColors.ts` | 类型 → 色块 class 映射 |
| `index.css` | Tailwind 入口 + @theme token + 条纹动画 |
| `App.css` | 空占位(样式已全部 Tailwind 化) |
| `pages/VenueDirectoryPage.tsx` | 目录页(搜索/筛选/分页/取数) |
| `pages/VenueDetailPage.tsx` | 详情页 |
| `components/` | AuthButton、AuthModal、Pagination、SearchBar、TypeFilter、VenueCard、VenueGrid(7 个) |

## 4. 页面规格

### VenueDirectoryPage

- **URL 参数协议**:`q`(默认 '' 不写入)、`type`、`page`(非法值回退 1;第 1 页不写入保持 URL 干净)
- `updateParams`(`:22-35`):回调式 `setSearchParams(prev => ...)`,避免覆盖其他参数,支持 `{ replace }`
- **防抖**(`:57-73`):300ms setTimeout;trim 后与 URL 现值相同则跳过;写 q 用 `replace: true`(不堆积历史)并删 page;q 置空时删参数
- **取数**(`:84-117`):`GET /api/venues?q=&type=&page=&page_size=12`;依赖数组含 `reloadTick`(错误页「重新加载」按钮触发)
- **防竞态**:`const cur = ++seq.current`,响应回来 `cur !== seq.current` 则丢弃(成功/失败分支均判)
- **页码越界收缩**(`:103-110`):总页数收缩后 page > tp 写回末页;仅 1 页时删 page 参数
- **状态区分**:首屏(items 空 + loading)显示整页加载;翻页/筛选保留旧网格不闪 loading;错误态独立文案 + 重试按钮
- **头部统计**(`:134-151`):有筛选 `命中 N VENUES`,无筛选 `N VENUES · M TYPES`,容器 `aria-live="polite"`
- 类型下拉:挂载时 `GET /api/venue-types` 一次性拉取,失败静默降级 `[]`

### VenueDetailPage

- **大图**(`:10-13`):`heroImage(url)` = `url.replace(/\/400\/260$/, '/1200/780')`——同 picsum seed 放大,与卡片缩略图同比例;LCP 元素不懒加载
- **状态机**:`loading | ready | notfound | error`;id 非正整数不发请求直接 notfound;404 → notfound,其余 → error;同样有 seq 防竞态 + reloadTick
- `document.title`:ready 时 `${venue.name} · 场馆目录`,否则「场馆目录」
- 信息栅格(`:154-172`):`dl` + Fact 子组件,4 字段——类型(色块 chip)/开放时间/位置/客服电话(`tel:` 链接,非数字剔除后拨号)
- 简介段落 `border-l-4 border-flame pl-4` 引用块;容器 `max-w-2xl`(目录页 `max-w-6xl`)

## 5. 认证模块

### auth.tsx

- `TOKEN_KEY = 'demo001-token'`:勾「记住」→ localStorage(30 天),否则 sessionStorage(关浏览器失效);写入前先双清
- 状态 `status: 'checking' | 'authed' | 'guest'`,惰性初始化(有 token 起 checking,无 token 直接 guest)
- `login(email, password, captchaId, captchaCode, remember)` / `register(username, email, password, confirmPassword)`(注册恒 remember=true,注册即登录)/ `logout()` 同步清态
- **刷新恢复**:挂载 effect 带 token 调 `GET /api/me`,任何失败 → 清 token 回 guest
- `apiError`(`:24-38`):字符串 detail 原样透出;pydantic 数组 detail →「输入格式有误,请检查」;非 JSON →「请求失败(status),请稍后重试」

### AuthModal

- 登录字段:邮箱/密码/验证码/记住登录复选框;注册字段:用户名/邮箱/密码/确认密码(注册无验证码)
- **预校验与服务端同规则**:用户名 2–20、邮箱 `^[^@\s]+@[^@\s]+\.[^@\s]+$`、密码 ≥6、两次一致;验证码非空且已加载
- 验证码:打开/切回登录视图时拉取;图片即按钮点击刷新;加载失败显示「点击加载」占位;输入框 maxLength 4 + 自动大写;**登录失败自动刷新并清空输入**(旧码已被服务端消费)
- 交互:ESC 关闭、遮罩**不**关闭(防误触)、弹窗期锁 body 滚动、`submitting` 防重复提交、错误 `role="alert"`
- 条件挂载(关闭即卸载),重开从空白开始

### AuthButton

- `checking` 态返回 null(避免闪现「登录」又跳回已登录);访客 flame 描边「登录」;登录态用户名(truncate + title)+「退出」

## 6. 组件规格

| 组件 | props | 行为要点 |
|---|---|---|
| VenueCard | `{ venue }` | 整卡 `Link` 跳详情;编号 `padStart(3,'0')` 左上角标;类型色块右下;名称 `line-clamp-2` 固定两行防撑卡;缩略图 lazy + hover 轻放大;**预订按钮**占位——`preventDefault + stopPropagation` 阻止冒泡到 Link |
| Pagination | `{ page, totalPages, onChange }` | ≤8 页全显,>8 页当前页 ±2 折叠补省略号;首页/末页边界禁用;直达输入框 Enter/Escape/onBlur 提交,NaN 放弃,夹取 `[1, totalPages]`;当前页 `aria-current` + flame 实心 |
| TypeFilter | `{ types, value, onChange }` | 原生 select + 自绘箭头,左色点随选中类型 |
| SearchBar | 受控输入 | 放大镜图标 + 清空按钮 |
| VenueGrid | `{ venues, query }` | auto-fill 网格(`minmax(240px,1fr)`);空态提示含示例词「羽毛球」「上海」 |

## 7. 设计系统(index.css @theme)

| token | 值 | 用途 |
|---|---|---|
| `--color-paper` | #f6f4ef | 暖白纸底 |
| `--color-card` | #ffffff | 卡面 |
| `--color-ink` | #14120e | 近黑(文字/边框) |
| `--color-flame` | #e8631c | 火焰橙(主强调/hover/当前页) |
| `--color-royal` | #1e4fd8 | 宝蓝(次强调) |
| `--color-line` | #d8d4ca | 分隔线/占位底 |
| `--color-muted` | #6b675c | 次要文字 |

字体:`--font-display` 与 `--font-sans` 同栈(PingFang SC / Microsoft YaHei / HarmonyOS Sans SC / system-ui)——画报感由 `font-black italic` 字重斜体实现,非独立字体。

- `.pictorial-stripes`:两条 `skewX(-12deg)` 斜切色带(flame 10px 全宽 + royal 5px 62%),`scaleX(0→1)` 一次性绘制动画;`prefers-reduced-motion` 下直接满展开
- 类型色映射(typeColors.ts):篮球场/网球场 = flame,足球场/羽毛球场 = royal,未知兜底 ink
- 画报风共性:`border-2 border-ink` 硬边框、`font-display font-black italic` 标题、flame hover/焦点(全站 `focus-visible:outline-2 outline-flame`)、AuthModal 加 `shadow-[6px_6px_0_#14120e]` 印刷式投影

## 8. 工程约定

- Tailwind v4 按字面量编译,**class 必须是字符串字面量**,动态映射走查表(typeColors)
- 类型导入一律 `import type`(verbatimModuleSyntax)
- 列表状态优先存 URL(searchParams),不退回 useState;新增拉取逻辑沿用 seq ref 防竞态模式

## 9. 已知技术债

- tsconfig 未开 `strict`(Vite 模板默认被移除)
- `App.css` 空占位文件、`public/venues.json` 废弃残留(数据源已迁 backend,勿编辑)
- `index.html` title「场馆名录」/meta description 与现状不符(见 frontend-prd.md 已知瑕疵)
- oxlint 存量 warning:auth.tsx only-export-components、两个页面 set-state-in-effect(已接受)
