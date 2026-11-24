# AGENTS.md — 监控后台

三个独立项目，各自有 `AGENTS.md`，修改哪个就先读哪个：

- `server/`：NestJS（来自 my-backend-tempalte）。接口行为以 `server/docs/API_CONTRACT.md` 为准，契约先行。
- `web/`：React（来自 my-frontend-template）。规范见 `web/AGENTS.md` 与 `web/docs/`。
- `sdk/`：零依赖上报 SDK。改上报字段时同时改 `server` 的 `ingest.dto.ts` 和契约第 11 节。

跨项目约束：

- 上报协议（`/ingest/events`、`/ingest/logs`）是 `sdk` 与 `server` 之间的契约，任何字段变更三处同步：`sdk/src/types.ts`、`server/src/modules/ingest/ingest.dto.ts`、`server/docs/API_CONTRACT.md`。
- `web` 通过别名引用 `sdk/src`，SDK 的公开 API 变更要同时跑 `web` 的检查。
- 修改后运行 `./scripts/check-all.sh`；改了 SQL 或上报逻辑，再启动服务跑 `cd server && npm run smoke`。
