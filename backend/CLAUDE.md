# backend/CLAUDE.md

FastAPI + psycopg3 + PostgreSQL 的场馆目录 API（见根目录 CLAUDE.md 的数据链路）。无 Pydantic 模型、无 router 拆分、无 CORS（前端走 Vite 同源代理），接口直接返回 dict。

## 命令

```bash
.venv/Scripts/uvicorn app.main:app --port 8000   # 无 --reload，改代码需手动重启
.venv/Scripts/python -m app.seed                  # 幂等重建：DROP TABLE + CREATE + 导入 120 条
.venv/Scripts/python scripts/enrich_venues.py     # 重新生成 venues.json 的 description/opening_hours/contact
```

无测试套件。数据库连接串在 `.env` 的 `DATABASE_URL`（已 gitignore，模板 `.env.example`），默认 `postgresql://postgres:postgres@localhost:5432/demo001`。

## 架构要点

**数据管道（改字段的正确路径）**：`data/venues.json` 是唯一数据源 → `app/seed.py`（`DROP TABLE IF EXISTS` + `CREATE` 8 列 + executemany INSERT）→ DB → API。改表结构 = 改 JSON 字段 + 改 seed.py 建列与 INSERT，然后重跑 seed。seed 是全量重建，不要用 `CREATE TABLE IF NOT EXISTS` + 增量 ALTER 之类的半迁移（旧表缺列会让 INSERT 失败）。

**接口字段约定**：`GET /api/venues`（列表，分页 + q/type 筛选）只 SELECT 5 字段；`GET /api/venues/{id}` 返回全部 8 字段（404 = venue not found，非整数 id 422）。新增字段需同步：`db.py` 的两个查询与 dict 字面量、`seed.py`、`data/venues.json`、前端 `types.ts`。

**查询层**：`app/db.py` 用 psycopg_pool 连接池（lifespan 里 open/close），全部参数化 SQL；列表的动态 WHERE 用 conds/params 列表拼 `AND`。新查询照此风格写显式 dict 字面量返回。

**假数据生成**：`scripts/enrich_venues.py` 用 `random.Random(venue["id"])` 逐条种子化——幂等，重跑覆盖为相同值；文案在脚本内的句池（FACILITY/FEATURE/SERVICE、HOURS、AREA_CODE）里改，改完重跑即可，不要手工编 120 条。

## 环境注意事项

- Windows 控制台是 GBK：python -c 内联中文字符串会乱码/报错，需写 UTF-8 编码的临时 .py 文件执行；脚本控制台输出只打印 ASCII（避免 print 中文）
