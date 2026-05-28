# AI 错题本 MVP（React + Supabase）

基于你的 PRD 搭建的 MVP 基础框架，当前覆盖四个核心页面：

- `错题录入`：题干/错误答案录入 + OCR 文本确认字段
- `AI 对话诊断`：2-3 轮问答采集并输出结构化诊断
- `错因归纳`：展示知识点、错误类型、状态标签、置信度
- `薄弱点地图`：按知识点聚合错误次数并排序

## 1) 本地启动

```bash
npm install
npm run dev
```

## 2) Supabase 配置

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 在 `.env` 中填入：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `LLM_API_KEY`（仅后端使用，不暴露给浏览器）
- 可选：`LLM_API_URL`、`LLM_MODEL`、`PORT`

3. 在 Supabase SQL Editor 执行 `supabase/schema.sql` 建表。

> 未配置 Supabase 时，项目会自动使用内存数据模式，方便先跑前端流程。

## 3) 关键目录

- `src/pages`：四个 MVP 页面
- `src/lib/supabase.ts`：Supabase 客户端初始化
- `src/lib/repository.ts`：数据读写封装（Supabase + 内存 fallback）
- `src/lib/mockAi.ts`：前端诊断服务调用封装（调用 `/api/diagnosis`）
- `server/index.js`：后端诊断 API（LLM 调用 + JSON 重试容错）
- `src/types.ts`：领域模型定义

## 4) 下一步建议（按优先级）

1. 给后端诊断接口增加鉴权（例如 JWT）
2. 增加 OCR 上传与识别 API（当前页面是 OCR 文本确认占位）
3. 接入认证与学生维度数据隔离（RLS）
4. 新增推送模块（V1.5）
