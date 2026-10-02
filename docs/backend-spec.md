# Backend SPEC — 场馆目录 API 技术规格

> 状态基线:2026-10-02。本文档描述**当前实现**,对应 `backend/` 目录。

## 1. 技术栈

| 组件 | 版本/说明 |
|---|---|
| Python | 3.14(Windows,venv 在 `backend/.venv`) |
| Web 框架 | FastAPI(单 app,无 router 拆分、无 CORS、无响应模型) |
| 数据库驱动 | psycopg[binary] + psycopg-pool(连接池) |
| 认证 | pyjwt(HS256);密码哈希用标准库 hashlib.scrypt |
| 配置 | python-dotenv(`backend/.env`,已 gitignore) |
| 依赖声明 | requirements.txt 全部裸包名,**未锁版本** |

## 2. 架构

```
React (Vite :5173) ──/api 同源代理──> FastAPI (uvicorn :8000, TLS 自签) ──psycopg 池──> PostgreSQL demo001
```

- 单进程 uvicorn,**必须单 worker**(验证码进程内存储的硬约束);启动不带 `--reload`,改代码需手动重启
- lifespan(`app/main.py:10-15`):启动时 `db.pool.open()` + `auth.ensure_users_table()`(幂等建 users 表),关闭时 `pool.close()`
- 模块间解耦约定:seed 只管 venues(全量重建),auth 启动时自建 users 表,**互不触碰**

## 3. 模块结构

| 文件 | 职责 |
|---|---|
| `app/main.py` | 7 个端点定义、lifespan |
| `app/db.py` | 连接池 + 3 个场馆查询函数 |
| `app/auth.py` | scrypt 哈希、JWT、users 表、注册/鉴权 |
| `app/captcha.py` | SVG 验证码生成与一次性校验 |
| `app/seed.py` | 建库建表 + venues.json 全量导入 |
| `data/venues.json` | **唯一数据源**(60 条 × 8 字段) |
| `scripts/enrich_venues.py` | 按 id 种子确定性生成 description/opening_hours/contact(幂等) |
| `scripts/verify_auth.py` | 认证端点端到端验证(进程内起 :8001,无需先启服务) |
| `certs/`(gitignore) | 自签 TLS 证书 key.pem / cert.pem |

## 4. 接口规格

### GET /api/venues(`main.py:21-29`)

| Query 参数 | 类型/约束 | 默认 |
|---|---|---|
| `q` | str | `""` |
| `type` | str(精确匹配) | `""` |
| `page` | int ≥ 1 | 1 |
| `page_size` | int 1–100 | 12 |

响应:`{"total": int, "page": int, "page_size": int, "items": [{id, name, type, location, image}]}`。参数非法 → FastAPI 自动 422。

### GET /api/venues/{venue_id}(`main.py:32-37`)

- Path `venue_id: int`,非整数 → 422
- 成功:8 字段全量 `{id, name, type, location, image, description, opening_hours, contact}`(`db.py:72-81`)
- 不存在 → 404 `{"detail": "venue not found"}`

### GET /api/venue-types(`main.py:40-42`)

返回 `list[str]`(`SELECT DISTINCT type ... ORDER BY type`)。

### POST /api/auth/register(`main.py:62-75`,201)

请求体 `RegisterRequest`(`main.py:45-51`):

| 字段 | 校验 |
|---|---|
| `username` | 2–20 字符 |
| `email` | ≤254,pattern `^[^@\s]+@[^@\s]+\.[^@\s]+$` |
| `password` | 6–128 字符 |
| `confirm_password` | 须与 password 一致 |

- 成功:`{"token", "id", "username", "email"}`,**token 固定 30 天**(注册即登录)
- 422「两次输入的密码不一致」/ 409「用户名已被占用」/ 409「邮箱已被占用」/ 字段校验失败自动 422

### GET /api/captcha(`main.py:78-81`)

响应:`{"captcha_id": str, "image": "data:image/svg+xml;base64,..."}`,响应头 `Cache-Control: no-store`。

### POST /api/auth/login(`main.py:84-97`)

请求体 `LoginRequest`(`main.py:54-59`):`email`、`password`、`captcha_id`、`captcha_code`、`remember: bool = False`。

内部校验顺序固定:消费验证码(成败均不可重放)→ 查用户 → 验密码。

| 错误 | 触发 |
|---|---|
| 400「验证码已过期，请刷新后重试」 | captcha_id 不存在或超时 |
| 400「验证码错误」 | 比对不匹配 |
| 401「邮箱或密码错误」 | 用户不存在**或**密码错(统一提示,防枚举) |

成功同 register 响应;token 有效期 remember ? 30 天 : 1 天。

### GET /api/me(`main.py:100-114`)

- Header `Authorization: Bearer <token>`("bearer" 大小写不敏感,手工解析)
- 成功:`{id, username, email}`;无/坏 token 或用户已不存在 → 401 `not authenticated`

## 5. 数据模型

### venues 表(`seed.py:47-57`,seed 时 DROP + CREATE 重建)

```sql
CREATE TABLE venues (
    id integer PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('足球场', '篮球场', '羽毛球场', '网球场')),
    location text NOT NULL,
    image text NOT NULL,
    description text NOT NULL,
    opening_hours text NOT NULL,
    contact text NOT NULL
)
```

### users 表(`auth.py:85-97`,启动时 CREATE IF NOT EXISTS)

```sql
CREATE TABLE IF NOT EXISTS users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
)
```

email 一律小写存储;username 大小写敏感(可分别注册,已知语义)。

### 数据管道

`data/venues.json`(唯一源)→ `python -m app.seed`(幂等全量重建:先连 postgres 库 `ensure_database()` 建库,再 DROP+CREATE+executemany INSERT)→ API。文案字段由 `scripts/enrich_venues.py` 确定性生成:每条 `random.Random(venue_id)` 种子化,句池按 4 类型分档,重跑覆盖为相同值。

## 6. 安全机制细节

### 密码哈希(`auth.py:37-57`)

- scrypt `n=16384, r=8, p=1, dklen=32`;盐 `secrets.token_bytes(16)`
- 哈希串自描述格式:`scrypt$16384$8$1$<salt.hex>$<digest.hex>`(参数内嵌,验签时反推,比较用 `hmac.compare_digest`)

### JWT(`auth.py:26-28, 64-73`)

- HS256;claims `{sub: str(user_id), username, iat, exp}`
- 有效期:`TOKEN_DAYS_REMEMBERED=30` / `TOKEN_DAYS_SESSION=1`
- `JWT_SECRET` 缺省时用不安全默认值并打 warning(生产必须配置)
- `decode_token` 捕获全部异常返回 None,调用方统一按未认证处理

### 验证码(`captcha.py`)

- 字符集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`(去 0/O、1/l/I),码长 4,TTL 300s
- 存储:进程内 dict `{captcha_id: (code, expire)}` + `threading.Lock`;generate 时惰性清过期
- **先 pop 后比对**(一次性,防重放);比较大小写不敏感、去空格
- SVG:140×44,逐字符随机旋转 ±25°/位移/字号 24-28,三色取自前端 @theme(paper 底 + ink/flame/royal 字色),polyline 干扰线 + 噪点;base64 data URL 输出,零绘图依赖

### 其他

- 注册竞态:先 SELECT 预检给字段级 409,INSERT 捕获 `UniqueViolation` 按约束名兜底
- SQL 全参数化;列表动态 WHERE 用 conds/params 列表拼 `AND`,值不拼接
- TLS:`backend/certs/` 自签证书(SAN 含 localhost + 127.0.0.1),整目录 gitignore;重生成命令见 `backend/CLAUDE.md:16`

## 7. 运行手册

```bash
cd backend
# 启动(无 --reload)
.venv/Scripts/uvicorn app.main:app --port 8000 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem
# 重导数据(幂等,DROP+重建 venues)
.venv/Scripts/python -m app.seed
# 重新生成 venues.json 文案(幂等)
.venv/Scripts/python scripts/enrich_venues.py
# 认证端点端到端验证(进程内起 :8001)
.venv/Scripts/python scripts/verify_auth.py
```

`.env` 键(模板 `.env.example`):`DATABASE_URL`(默认 `postgresql://postgres:postgres@localhost:5432/demo001`)、`JWT_SECRET`。

## 8. 已知技术债与环境约束

- **单 worker 硬约束**:验证码进程内存储,禁止 `--workers N`
- 无测试套件(仅 verify_auth.py 脚本级验证)
- requirements 未锁版本;Windows 控制台 GBK——python 内联中文会乱码,脚本输出仅 ASCII
- 部署注意:生产形态为反向代理终结 TLS → uvicorn 内网 HTTP(见 `docs/deployment-plan.md`,待实施)
