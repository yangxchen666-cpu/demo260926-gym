# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

场馆目录（中文 UI）：React 19 SPA + FastAPI + PostgreSQL。点击目录卡片进入 `/venues/:id` 详情页。

数据链路：React (Vite :5173) → `/api` proxy → FastAPI (uvicorn :8000) → PostgreSQL `demo001`。

管理后台：admin-frontend (Vite :5174) → `/api` proxy → admin-backend (uvicorn :9000) → 同一 PostgreSQL `demo001`，对场馆/用户数据做增删改查维护。

四端各自的命令与细节见 `frontend/CLAUDE.md`、`backend/CLAUDE.md`、`admin-frontend/CLAUDE.md` 与 `admin-backend/CLAUDE.md`。

## 跨端约定

- **唯一数据源是 PostgreSQL `demo001`**；`backend/data/venues.json` 仅为初始种子（经 `seed.py` 全量重建入库），**重跑 seed 会覆盖管理端的增删改**（users/admins 表不受影响）；`frontend/public/venues.json` 是废弃残留，**不要编辑**
- **改场馆字段需多端同步**：`backend/data/venues.json` + `backend/app/seed.py` 建列/INSERT + `backend/app/db.py` 查询 + `admin-backend/app/db.py` 查询 → 重跑 seed → `frontend/src/types.ts` 与 `admin-frontend/src/types.ts`
- 前台列表接口只返回 5 字段（卡片所需），详情接口返回全部 8 字段；管理端列表/详情均返回 8 字段

## 开发文档

`docs/implementation-plan.md` 按日期记录每期功能的设计与验证结论，改动后按惯例追加一节。

## 环境注意事项

- 端口分配：Vite 前台 5173 / 管理端 5174；uvicorn backend 8000 / admin-backend 9000（TLS 复用 `backend/certs`）；8001 与 9001 分别是两端验证脚本的进程内端口
- Windows 控制台是 GBK：Python 内联命令传中文会乱码（详见 backend/CLAUDE.md）
- 直连 GitHub 会 Connection reset，本机 127.0.0.1:7890 有代理：`git -c http.proxy=http://127.0.0.1:7890 push ...`
