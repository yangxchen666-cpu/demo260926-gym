# admin-backend/CLAUDE.md

FastAPI + psycopg3 + PostgreSQL 的后台管理 API（见根目录 CLAUDE.md 的数据链路）：管理员登录（独立 admins 表）+ venues/users 全量 CRUD。与 backend 同风格：无 Pydantic 响应模型、无 router 拆分、无 CORS（前端走 Vite 同源代理），接口直接返回 dict。

## 命令

```bash
.venv/Scripts/uvicorn app.main:app --port 9000 --ssl-keyfile ../backend/certs/key.pem --ssl-certfile ../backend/cert.pem   # TLS 复用 backend 自签证书，无 --reload
.venv/Scripts/python scripts/verify_admin.py    # 端到端验证（进程内起 :9001，无需先启动服务，54 项断言）
.venv/Scripts/python scripts/smoke_tls.py       # 对已启动的 :9000 做 TLS 冒烟 + 前台 token 隔离实证
.venv/Scripts/python scripts/cross_check.py     # 经 admin-frontend 代理(:5174) 做建/查/改/删往返（自清理，需 dev server 在跑）
.venv/Scripts/python scripts/seed_demo_check.py create\|verify  # 跨端实证：admin 建场馆→前台(:8000)可见→重跑 seed→消失（分两步，中间跑 backend 的 seed）
```

无测试套件。`.env`（已 gitignore，模板 `.env.example`）四项：`DATABASE_URL`、`ADMIN_JWT_SECRET`（**必须与 backend 的 JWT_SECRET 不同**——两表 id 都从 1 起，共用会让前台用户 token 在此误认证；token 另带 `scope=admin` 声明双保险，有效期 8 小时）、`ADMIN_INITIAL_EMAIL`/`ADMIN_INITIAL_PASSWORD`（启动时预置的默认管理员）。

## 架构要点

**admins 表**：启动时幂等 `CREATE TABLE IF NOT EXISTS`（email 唯一、小写存储）+ 按 .env 预置默认管理员（`ON CONFLICT (email) DO NOTHING`）。**改 .env 密码不会更新已存在行**——重置方法：`DELETE FROM admins WHERE email = '…'` 后重启。venues/users 表也幂等 ensure（DDL 与 backend 一致），空库可独立运行。

**认证**：`app/auth.py` 的 scrypt 哈希与 backend 同格式（自描述串 `scrypt$…`，两端实现一致但互相独立，不跨目录 import）；`require_admin` 是 FastAPI Depends（Bearer → decode → 查 admins 行），除登录外全部端点挂载——管理员被删行后 token 立即失效。登录无验证码（内部工具），防枚举统一 401「邮箱或密码错误」。

**场馆 id 非自增**：seed 建表时 id 来自 JSON 显式值，admin 创建用 `INSERT … SELECT COALESCE(MAX(id),0)+1 …` + UniqueViolation 重试 3 次（并发窗口极小）。不要改成 identity——seed 会 DROP+CREATE 重建表，改了也会被抹掉。

**seed 覆盖语义**：backend 重跑 `python -m app.seed` 会全量重建 venues，管理端对场馆的增删改全部丢失（users/admins 不受影响）。

**端点**（12 个，`/api` 前缀）：`POST /api/auth/login`、`GET /api/me`；venues 与 users 各 5 个（列表 q/type 筛选 + 分页、详情、创建、全量更新、删除）。用户 email 一律小写、唯一冲突按约束名定位返回 409 中文提示；`PUT /api/users/{id}` 的 `password` 为 null/空串 = 不改密码。错误码风格与 backend 一致：404 英文 detail，409/登录错误中文。

## 环境注意事项

- Windows 控制台是 GBK：脚本控制台输出只打印 ASCII（详见 backend/CLAUDE.md）
- 端口：主服务 9000；verify_admin.py 进程内用 9001（backend 的 verify_auth 用 8001）
