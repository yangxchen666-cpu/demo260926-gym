# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

场馆目录（中文 UI）：React 19 SPA + FastAPI + PostgreSQL。点击目录卡片进入 `/venues/:id` 详情页。

数据链路：React (Vite :5173) → `/api` proxy → FastAPI (uvicorn :8000) → PostgreSQL `demo001`。

两端各自的命令与细节见 `frontend/CLAUDE.md` 与 `backend/CLAUDE.md`。

## 跨两端约定

- **唯一数据源**是 `backend/data/venues.json`（经 `seed.py` 全量重建入库）；`frontend/public/venues.json` 是废弃残留，**不要编辑**
- **改字段需两侧同步**：`backend/data/venues.json` + `app/seed.py` 建列/INSERT + `app/db.py` 查询 → 重跑 seed → 前端 `frontend/src/types.ts`
- 列表接口只返回 5 字段（卡片所需），详情接口返回全部 8 字段

## 开发文档

`docs/implementation-plan.md` 按日期记录每期功能的设计与验证结论，改动后按惯例追加一节。

## 环境注意事项

- Windows 控制台是 GBK：Python 内联命令传中文会乱码（详见 backend/CLAUDE.md）
- 直连 GitHub 会 Connection reset，本机 127.0.0.1:7890 有代理：`git -c http.proxy=http://127.0.0.1:7890 push ...`
