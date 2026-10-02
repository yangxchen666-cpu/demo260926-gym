# demo001 云服务器部署计划（Docker Compose 三容器 + 零基础手册）

> 状态：**待实施**（2026-09-29 规划完成，尚未落地任何文件）。以后部署时按本计划执行即可。
>
> 前提确认：还没买服务器（手册中需推荐）、无域名、直接 `http://IP` 访问。

## Context

项目要部署到云服务器，用户为零部署知识的 Windows 用户。项目现状（规划时已探明）：

- 无任何部署资产（无 Dockerfile / compose / nginx 配置）
- 前端 API 请求全为相对路径（同源部署零改动）、BrowserRouter 需 SPA fallback
- 后端无 CORS（同域反代则无需）
- **验证码存进程内 dict（`backend/app/captcha.py`）→ uvicorn 必须单 worker**
- seed 是 DROP+重建的全量重置语义；requirements 无版本锁定

方案：**Docker Compose 三容器**（web=nginx 托管前端静态文件并反代 /api → backend=uvicorn HTTP 单 worker → db=postgres 16，仅 web 暴露 80）。服务器上只需装 Docker + 传代码 + 填 .env + 两条命令，路径最短且可复现。

```
浏览器 ──http──> [安全组: 80]
                  │
            ┌─────▼──────┐
            │ web (nginx)│  dist 静态 + try_files SPA fallback
            └─┬───────┬──┘  /api → proxy_pass http://backend:8000
      静态请求│       │/api
    ┌─────────┘       ▼
    │            ┌──────────────┐
   dist/         │ backend      │  uvicorn :8000（单 worker、无 SSL）
 (build 期由     │ 内网，不映射  │  env: DATABASE_URL / JWT_SECRET
 node:22-alpine  └──────┬───────┘
 npm ci+build)          │ psycopg3 pool (1-5)
                  ┌─────▼──────┐
                  │ db         │  postgres:16-alpine
                  │ 卷 pgdata  │  POSTGRES_DB=demo001 预建库
                  └────────────┘  内网，不映射 5432
```

## 新增文件（7 个，全部为新增，不改任何现有代码）

### 1. `docker-compose.yml`（根目录）

- `db`：`postgres:16-alpine`，`restart: unless-stopped`，volume `pgdata`，`POSTGRES_USER/PASSWORD/DB` 取自根目录 `.env`（`${VAR:?中文错误}` 守卫缺失），**`POSTGRES_DB=demo001` 预建库**（否则 backend 首启 lifespan 建表必失败）；healthcheck `pg_isready`（retries 12 + start_period 30s）；**不映射 5432**
- `backend`：`build: ./backend`；env 注入 `DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`（compose 现场拼装，密码只维护一份）和 `JWT_SECRET`；`depends_on: db: service_healthy`
- `web`：`build: ./frontend`；`ports: "80:80"`（全栈唯一对外端口）；`depends_on: backend`

### 2. `backend/Dockerfile`

- `python:3.14-slim`（与本地同为 3.14；若构建时报 psycopg 编译错误降级 `3.12-slim`）；先 COPY requirements.txt → `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple`（层缓存），再 `COPY . .`
- CMD 显式 `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`，**注释注明单 worker 是 captcha 进程内存储的硬约束，勿加 --workers**；无 SSL（入口由 nginx 承担）

### 3. `backend/.dockerignore`

`.venv/`、`__pycache__/`、`*.pyc`、`.env`（真实密码绝不进镜像）、`certs/`、`uvicorn.log`

### 4. `frontend/Dockerfile`（多阶段）

- 阶段 1 `node:22-alpine`：COPY package.json + package-lock.json → `npm config set registry https://registry.npmmirror.com && npm ci`（国内构建必需）→ COPY . . → `npm run build`
- 阶段 2 `nginx:stable-alpine`：COPY nginx.conf + `--from=build /app/dist`

### 5. `frontend/.dockerignore`

`node_modules/`、`dist/`、`public/venues.json`（废弃残留，借此不进 dist）

### 6. `frontend/nginx.conf`（conf.d/default.conf 格式）

- `location /api { proxy_pass http://backend:8000; }`（不带 URI 部分，/api 前缀原样透传，与 FastAPI 路由对齐，零 rewrite）+ X-Real-IP / X-Forwarded-For 头
- `location / { try_files $uri $uri/ /index.html; }`（SPA fallback，`/venues/3` 刷新不 404）
- `/assets/` 长缓存 30d；gzip 开启

### 7. `.env.deploy.example`（根目录）

`POSTGRES_USER=demo001`、`POSTGRES_PASSWORD=随机串`、`POSTGRES_DB=demo001`、`JWT_SECRET=随机串`（注明 `openssl rand -hex 32` 生成）。根目录 `.env` 已被现有 `.gitignore` 的 `.env` 模式覆盖，无需改 gitignore。

## 关键设计决策

1. **seed 手动跑，不做自动 seed**：`docker compose exec backend python -m app.seed`。seed 是 DROP+重建，若挂 entrypoint 每次重启都会清空 venues 表。代价只是 up 与 seed 之间约几十秒 venues 接口 500 窗口（users/登录不受影响）。seed 的 `ensure_database()` 连 `postgres` 库建库的逻辑已核实（`backend/app/seed.py:21`）：容器内账号即 superuser，**零代码改动可用**
2. **POSTGRES_DB 预建库**：backend 的 `ensure_users_table()` 首启即成功
3. **国内网络对策全部内置**：pip 清华源、npm npmmirror 写进 Dockerfile；Docker Hub 加速器配法写进手册（腾讯机 `mirror.ccs.tencentyun.com` / 阿里机控制台个人加速地址）；代码上服务器主通道 = 本机 `git archive --format=zip -o demo001.zip HEAD` 打包 + `scp` 上传（不依赖 GitHub，本机直连 GitHub 已知会 connection reset）

## 交付文档 `docs/deployment.md`（零基础可照抄）

章节：① 方案总览图 + 最终效果 ② 买服务器（推荐腾讯/阿里轻量 2核2G、**系统镜像** Ubuntu 24.04，勿选应用镜像防 80 被占）③ 安全组只开 22/80 ④ Windows 自带 ssh 连服务器 ⑤ 服务器初始化 + **建 2G swap（必做，防 2G 内存 build 前端 OOM）** ⑥ 装 Docker（`curl -fsSL https://get.docker.com | sudo bash -s -- --mirror Aliyun`）+ 配镜像加速 ⑦ 上传代码（git archive + scp 全流程命令）⑧ 填 .env（随机串生成）⑨ `docker compose up -d --build` ⑩ 首次 seed（红色警告：重置 venues 表、不影响账号）⑪ 验收清单 ⑫ 日常更新流程 ⑬ 日志排查 ⑭ 数据备份 pg_dump 到本机 ⑮ 常见故障表（端口被占 / 密码改了不生效（POSTGRES_PASSWORD 仅首次 initdb 生效）/ 镜像拉不动 / 内存不足）⑯ 后续升级路径（域名+HTTPS 用 Caddy、图片本地化等，只列不做）

另按项目惯例在 `docs/implementation-plan.md` 末尾追加一节记录本次改动。

## 验证

**本机（改完后立即做）**：

1. `cd frontend && npm ci && npm run build` —— 与镜像内构建命令完全一致，暴露 tsc 严格模式问题
2. 检查 `docker --version`：若本机装有 Docker Desktop（WSL2），则建临时 `.env` 后 `docker compose up -d --build` 走一遍 http://localhost 全流程彩排；未装则跳过（不阻塞，服务器实装验证）
3. `docker compose config` 若可用则校验插值与守卫语法

**服务器（按手册操作时的验收清单，写入文档）**：`docker compose ps` 三服务 Up / db healthy；`curl http://127.0.0.1/api/venues` 返回 `"total":120`；浏览器开 `http://IP` 目录正常；`http://IP/venues/1` 直接刷新不 404（SPA fallback）；注册→登录→验证码通过（单 worker 正确）；`docker compose restart` 后数据仍在；`curl -I http://IP/venues.json` 404。

## 风险提示（写入手册故障表）

- picsum.photos 图片由访客浏览器加载，国内时快时慢 —— 属正常，非部署失败
- requirements 无版本锁定：构建失败时优先怀疑依赖新版破坏兼容（升级路径：pip freeze 锁版本）
- 2G 内存机器不建 swap build 前端可能 OOM-kill —— 手册已列为必做步骤
