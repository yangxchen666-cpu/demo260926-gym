# Backend PRD — 场馆目录 API

> 状态基线:2026-10-02(类型收口为四类 × 15 条 = 60 条)。本文档描述**当前已交付**的产品需求,非未来规划。

## 1. 产品概述

场馆目录 API 是 demo001 的数据与账号后端:为前端 SPA(React)提供场馆浏览检索与用户注册登录的 REST 接口。技术形态为 FastAPI 单服务 + PostgreSQL,通过 Vite 同源代理被前端消费(无 CORS,不直接面向浏览器跨域)。

## 2. 用户与场景

直接消费方是前端 SPA(以及开发调试者)。核心场景:

| 场景 | 涉及接口 |
|---|---|
| 浏览场馆目录、搜索筛选、翻页 | `GET /api/venues` |
| 查看场馆详情 | `GET /api/venues/{id}` |
| 获取类型筛选选项 | `GET /api/venue-types` |
| 注册(注册即登录) | `POST /api/auth/register` |
| 登录(带图形验证码) | `GET /api/captcha` + `POST /api/auth/login` |
| 页面刷新后恢复登录态 | `GET /api/me` |

## 3. 功能需求(已交付)

### FR1 场馆列表

- 分页:`page`(默认 1,≥1)、`page_size`(默认 12,1–100)
- 关键词 `q`:对 name、location 模糊匹配(不区分大小写)
- 类型 `type`:与库中类型**精确**匹配
- 响应:`{total, page, page_size, items}`;列表项仅 5 字段(id/name/type/location/image),详情字段不外泄到列表

### FR2 场馆详情

- 按 id 返回全部 8 字段(含 description/opening_hours/contact)
- 不存在 → 404 `venue not found`;id 非整数 → 422

### FR3 类型清单

- `GET /api/venue-types` 返回去重后的类型列表(字母序),驱动前端筛选下拉

### FR4 用户注册

- 字段规则:用户名 2–20 字符;邮箱格式校验(≤254);密码 6–128 位;两次密码须一致(不一致 → 422 中文提示)
- 用户名/邮箱分别冲突 → 对应 409 中文提示(字段级,便于前端定位)
- **注册即登录**:成功直接返回 token(固定 30 天有效期),省去注册后再登录一步

### FR5 图形验证码

- 4 位去混淆字符(无 0/O、1/l/I),SVG 图片 base64 内嵌返回
- 有效期 5 分钟;`Cache-Control: no-store`
- **一次性消费**:无论登录成败,验证码用后即焚(防重放)

### FR6 用户登录

- 校验顺序固定:验证码 → 用户 → 密码
- 验证码过期/错误 → 400(两种文案区分);邮箱或密码错误 → 统一 401「邮箱或密码错误」(**防账号枚举**,不暴露账号是否存在)
- `remember`:勾选 → token 30 天;不勾 → 1 天(关浏览器后由前端 storage 策略配合失效)

### FR7 登录态恢复

- `GET /api/me` 凭 `Authorization: Bearer <token>` 返回用户公开信息(id/username/email);token 无效或用户已不存在统一 401

## 4. 非功能需求(已满足)

- **传输安全**:后段链路 TLS(uvicorn 自签证书,Vite 代理 `secure: false`),密码与 token 不走明文
- **密码存储**:scrypt 加盐哈希(参数随哈希串自描述存储),比较用恒定时间函数
- **注入防护**:全部 SQL 参数化,动态 WHERE 仅拼条件结构不拼值
- **架构安全**:同源代理模型,服务不直接暴露公网 CORS 面;`.env`(数据库口令/JWT 密钥)不入库

## 5. 数据资产

- **场馆 60 条**:足球场、篮球场、羽毛球场、网球场各 15 条;数据库层 CHECK 约束强制四类合法值
- 每条 8 字段:id、name、type、location、image、description、opening_hours、contact
- 数据唯一源:`backend/data/venues.json`(seed 全量重建入库;文案由 `scripts/enrich_venues.py` 按 id 种子确定性生成,幂等)

## 6. 边界与已知限制(demo 级)

| 限制 | 说明 |
|---|---|
| JWT 无服务端撤销 | 改密码后旧 token 仍有效到过期;退出登录仅前端删 token |
| 验证码进程内存储 | dict + Lock,**必须单 worker** 部署,多 worker 之间不共享 |
| 无测试套件 | 仅 `scripts/verify_auth.py` 覆盖认证端点端到端路径 |
| 依赖未锁版本 | requirements.txt 全部裸包名,新环境装最新版有兼容风险 |
| 响应无 schema | 响应直接返回 dict,未建 pydantic 响应模型(OpenAPI 文档不完整) |

## 7. 版本现状

- 2026-10-02:类型收口四类、数据 120 → 60 条、type 列加 CHECK 约束
- 2026-09-29:注册/登录/验证码/JWT;后段链路 HTTPS
- 2026-09-28:数据迁移 PostgreSQL,FastAPI 上线(此前为前端静态 JSON)
