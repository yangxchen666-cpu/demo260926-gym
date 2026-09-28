# 场馆信息浏览与搜索网页 — 实施计划

## Context

在 `e:\Dev\demo001`（空目录，未初始化 git）从零搭建场馆信息浏览/搜索网页。需求：输入框按场馆名称实时搜索，卡片展示场馆（缩略图、名称、位置）。

用户确认的技术选型：
- **Vite + React + TypeScript**，项目放在新建的 `frontend/` 子目录内
- **独立 JSON 文件**：`public/venues.json`，fetch 加载（Vite dev server 提供）
- **Tailwind CSS**（v4，`@tailwindcss/vite` 插件方式，CSS 内配置，无 tailwind.config.js）
- 缩略图：picsum.photos，每场馆独立 seed 保证图片稳定唯一

## 实施步骤

### 1. 脚手架
```bash
mkdir /e/Dev/demo001/frontend
cd /e/Dev/demo001/frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite
```
- 在空目录内用 `.` 避免 overwrite 提示；交互提问选包名 `frontend`、标准 Vite
- 不执行 `git init`（用户未要求版本控制）

### 2. Tailwind v4 接入
- `vite.config.ts`：plugins 加入 `tailwindcss()`
- `src/index.css` 重写为 `@import "tailwindcss";` + `@theme` 自定义 token（主色、字体栈含中文回退 "PingFang SC"/"Microsoft YaHei"）

### 3. 文件结构
```
demo001/frontend/
├── index.html              # 改：lang="zh-CN"，<title>场馆信息浏览</title>
├── public/venues.json      # 新建：24 条模拟场馆数据
└── src/
    ├── main.tsx            # 保持
    ├── index.css           # Tailwind 入口 + @theme token
    ├── App.tsx             # 重写：状态 + fetch + 组合
    ├── types.ts            # Venue 接口定义
    └── components/
        ├── SearchBar.tsx   # 新建
        ├── VenueCard.tsx   # 新建
        └── VenueGrid.tsx   # 新建
```
删除 `src/assets/react.svg` 模板残留；不再使用 `App.css`（样式全部 Tailwind utility）。

### 4. 组件设计（状态全部在 App，不过度设计）
| 组件 | 职责 |
|---|---|
| `App.tsx` | 状态：`venues: Venue[]`、`status`('loading'/'error'/'ready')、`query`；useEffect fetch `/venues.json`；useMemo 计算过滤结果 |
| `SearchBar.tsx` | 受控输入，接收 `value`/`onChange`，带清空(×)按钮 |
| `VenueCard.tsx` | 纯展示：缩略图 + 名称 + 位置 |
| `VenueGrid.tsx` | 网格渲染卡片 + 无结果提示 |

`types.ts`：
```ts
export interface Venue {
  id: number;
  name: string;
  type: string;
  location: string;
  image: string;
}
```

### 5. venues.json — 24 条
```json
{
  "id": 1,
  "name": "上海东方体育中心",
  "type": "体育馆",
  "location": "上海市浦东新区耀体路300号",
  "image": "https://picsum.photos/seed/venue-shanghai-oriental/400/260"
}
```
- 8 个类别（体育馆/游泳馆/网球中心/剧院/音乐厅/会展中心/篮球馆/足球场）× 各 3 条
- 城市分布：北京、上海、广州、深圳、成都、杭州、武汉、西安、南京、重庆
- 每条 seed 唯一（`venue-<拼音或id>`），尺寸 400/260 匹配卡片比例

### 6. 搜索逻辑
- 实时过滤，无需防抖（24 条 `includes` 瞬时完成）
- 同时匹配名称和位置（搜城市名也能命中）；`trim().toLowerCase()` 处理空格与英文大小写（对中文无影响）
- 拼音搜索（"tiyuguan"→体育馆）明确排除在范围外

### 7. 状态处理
1. loading → "加载中…"
2. fetch 失败（`res.ok` 检查 + try/catch）→ "加载失败" + 重新加载按钮
3. 有查询词但无结果 → 「未找到与 "xxx" 相关的场馆」
4. 正常 → 网格；空查询显示全部，可附"共 N 个场馆"计数

### 8. 样式（Tailwind utility）
- **顺序要求：写任何 UI 代码前先调用 frontend-design skill 获取视觉方向**（配色/字体/卡片质感），再用 `@theme` token + utility classes 落地
- 网格：`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5`，无媒体查询自适应
- 图片：`loading="lazy"` + `aspect-[400/260] object-cover` + 中性底色，避免布局抖动
- 卡片：上图下文（图圆角顶部 / 名称 font-semibold / 位置次要色 `truncate` 单行省略）

## 验证
1. `npm run dev` 打开 `http://localhost:5173`
2. 初始加载出 24 张卡片、图片各异（需联网）、无控制台报错
3. 输入"体育馆"实时收窄；输入"上海"按位置命中；输入乱码显示无结果；清空恢复全部
4. Network 面板确认 `venues.json` 200
5. DevTools 设备模拟：网格 4→3→2→1 列无横向滚动
6. `npx tsc --noEmit` 无类型错误
7. 收尾：`npm run build && npm run preview` 确认生产构建同样正常

---

## 变更记录

### 2026-09-28 数据扩充 + 前端分页

- **数据**：`public/venues.json` 从 24 条扩充到 48 条，8 个类别各 6 条，新增天津、苏州、长沙、青岛、厦门、沈阳、哈尔滨、佛山、郑州、昆明、大连、济南、合肥、昆山等城市
- **分页**：纯前端分页，每页 12 条（4 列 × 3 行）
  - `src/App.tsx`：新增 `page` state；`filtered` 之后切片（`PAGE_SIZE = 12`）；派生 `totalPages` 并对页码越界做 clamp；搜索输入变化时重置回第 1 页
  - `src/components/Pagination.tsx`（新建）：上一页/页码/下一页控件，当前页印章红底 + `aria-current="page"`，首/末页边界禁用；页数超过 7 时折叠中间页码为省略号（当前 4 页用不到，为后续扩容预留）
  - 分页条仅在结果数 > 每页大小时渲染，无结果时隐藏
- **验证**：`tsc` + `npm run build` 零错误；dev server 数据校验 48 条、8 类 × 6、id 与 seed 均唯一

### 2026-09-28 分页器增强：页码直达输入框 + 折叠规则调整

- **页码直达**：分页条中间（页码与「下一页」之间）新增输入框，显示为 `输入框 / 总页数`，回车或失焦提交；非法输入忽略，超出范围自动 clamp 到 `[1, 总页数]`，提交后清空
- **折叠规则**：页数 > 8 时只保留前四后二页码（`1 2 3 4 … N-1 N`），其余省略；若当前页落在省略区间则单独插入并高亮，避免翻到中间页时失去位置指示
- **验证**：`tsc` + `npm run build` 零错误；折叠函数边界用例（4/8/9/20 页 × 首/中/尾页）全部符合预期

### 2026-09-28 分页器布局微调

- 「下一页」按钮与页码输入框交换位置，分页条顺序变为：上一页 / 页码 / 下一页 / 输入框
- 输入框增加 `ml-3`，与「下一页」按钮之间在统一 `gap-1.5` 基础上额外拉开空隙

### 2026-09-28 数据扩充至 120 条（10 页）

- `public/venues.json` 从 48 条扩充到 **120 条**（8 类 × 15，id 49–120），整 10 页，超过 8 页阈值，分页折叠（前四后二 + 省略号）与页码直达输入框均实际生效
- 新增城市：唐山、长春、太原、南昌、贵阳、南宁、兰州、乌鲁木齐、呼和浩特、泉州、烟台、洛阳、无锡、常州、石家庄、温州、绍兴、徐州、珠海、中山、惠州、江门、汕头、遵义、柳州、桂林、海口、福州、义乌、潍坊、南通等
- 验证：数据校验 120 条、8 类 × 15、id 与 seed 均唯一

### 2026-09-28 分页器增加首页/末页按钮

- 「上一页」左侧新增「首页」（`onChange(1)`，第 1 页禁用），「下一页」右侧新增「末页」（`onChange(totalPages)`，末页禁用），样式复用 arrowClass
- 分页条最终顺序：首页 / 上一页 / 页码 / 下一页 / 末页 / ␣ 输入框

### 2026-09-28 折叠规则改为「当前页前二后二」

- 页数 > 8 时页码区只保留当前页前二后二（`page-2 … page+2`），两侧以省略号收尾；≤8 页仍全显
- 远端跳转由「首页/末页」按钮与页码直达输入框承担
- 修复：保留页码不再恒含末页，折叠序列需显式补尾部省略号（`prev < totalPages` 时追加）
- 边界验证（10 页）：第 1 页 `1 2 3 …`、第 3 页 `1 2 3 4 5 …`、第 5 页 `… 3 4 5 6 7 …`、第 10 页 `… 8 9 10`

### 2026-09-28 视觉风格改造：体育画报（Sports Pictorial）

替换「馆藏年鉴」风格为复古体育杂志风，布局与逻辑不动，仅换视觉层：

- **token**（`index.css` @theme）：暖白纸底 `#F6F4EF`、近黑 `#14120E`、火焰橙 `#E8631C`（主）、宝蓝 `#1E4FD8`（次）；display 字体改为中文黑体 900 斜体
- **页眉**：超大粗斜体「场馆名录」+ 期号式角标（`120 VENUES · 8 TYPES`，搜索时变 `命中 N / 120`）+ 橙蓝双条纹（skew 色带，一次性绘制动画，reduced-motion 适配）
- **卡片**：2px 近黑硬边框（hover 变橙）、图片左上角球衣号码式 3 位补零编号（001–120 黑体 900 斜体）、类别改右下角橙/蓝双色块（体育馆/网球中心/音乐厅/篮球馆=橙，游泳馆/剧院/会展中心/足球场=蓝）、hover 图片轻放大
- **搜索框**：细下划线改为 2px 粗边框矩形，聚焦变橙
- **分页**：按钮与页码全部换 2px 黑边框，当前页橙底白字
- 验证：`tsc` + `npm run build` 零错误，无旧类名残留
