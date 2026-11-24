# monitor-server

监控后台的服务端：接收前端 SDK 上报的**访问量 / 用户埋点 / 前端异常 / 页面性能**，接收后端服务上报的**日志**，记录**本服务自身的请求与异常日志**，并提供统计、明细、**IP 监控**与黑名单接口。

基于 `my-backend-tempalte` 的 NestJS 模板生成：统一响应、JWT + HttpOnly Cookie 鉴权、用户模块、`scripts/*.sh` 均与模板一致。

**技术栈**：NestJS 11 · Prisma 6 · PostgreSQL 16 · class-validator · @nestjs/jwt · Jest + supertest

> 接口契约见 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)（第 9 节起为监控扩展）。

## 快速开始

```bash
./scripts/setup.sh        # 复制 .env、安装依赖
./scripts/db.sh up        # 启动 PostgreSQL 并执行 Prisma 迁移
./scripts/dev.sh          # http://localhost:9000/api/health
./scripts/test.sh         # 类型检查 + ESLint + Jest e2e（内存仓储，不需要数据库）
npm run smoke             # 服务运行时：对真实数据库跑 40 项端到端检查
```

开发环境默认：

- 演示账号 `demo@example.com` / `password123`（admin，`SEED_DEMO_USER=true`）
- 演示项目 **Demo Web**，appKey `pk_demo_web`，带 7 天模拟数据（`SEED_DEMO_DATA=true`，项目已存在则跳过）

## 模块

| 模块 | 路径 | 说明 |
|---|---|---|
| `projects` | `/api/v1/projects` | 被监控项目与 appKey（缓存命中结果，重置后立即失效） |
| `ingest` | `/api/v1/ingest/events`、`/ingest/logs` | 公开上报：appKey、限流、IP 黑名单、`text/plain` 兼容 sendBeacon、UA / IP 解析 |
| `events` | `/api/v1/events` | 访问、埋点、性能明细与埋点汇总 |
| `errors` | `/api/v1/errors/issues` | 指纹聚合、回归自动重新打开、发生现场（堆栈 / 操作路径 / 环境） |
| `logs` | `/api/v1/logs` | 后端日志查询、级别 / 状态码分布、慢接口 P95；`RequestLogMiddleware` 记录本服务请求 |
| `ips` | `/api/v1/ips`、`/api/v1/ip-rules` | IP 汇总（合并三张表）、单 IP 画像、黑名单 |
| `analytics` | `/api/v1/analytics/*` | PV / UV / 会话 / 环比 / 趋势 / 页面 / 来源 / 设备 |
| `maintenance` | — | 每小时清理超过 `DATA_RETENTION_DAYS` 的数据 |
| `demo` | — | 开发环境模拟数据 |

统计类 SQL 集中在各模块的 `*.repository.ts`，时间桶、时区、项目过滤的 SQL 片段在 `src/common/monitor/range.ts`。

## 配置（在模板基础上新增）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SERVICE_NAME` | `monitor-server` | 本服务在「后端日志」中的服务名 |
| `TRUST_PROXY` | `false` | 部署在 Nginx / 网关后面时设为 `true`，从 `X-Forwarded-For` 取真实 IP（直接暴露公网时保持 `false`，否则 IP 可伪造） |
| `SELF_LOG_ENABLED` | `true` | 本服务请求日志与 warn / error 写入数据库 |
| `INGEST_RATE_LIMIT` | `600` | 上报接口每 IP 每分钟上限（单实例内存计数；多实例请在网关限流） |
| `DATA_RETENTION_DAYS` | `30` | 数据保留天数 |
| `SEED_DEMO_DATA` | `false` | 创建演示项目和模拟数据；生产环境开启会拒绝启动 |

CORS：上报接口允许任意来源（不带 Cookie）；其余接口只允许 `CORS_ORIGINS`。

## 外部后端如何上报日志

Node 服务用 SDK 的 `monitor-sdk/node`（见 `../sdk/README.md`），其他语言直接调用：

```bash
curl -X POST http://localhost:9000/api/v1/ingest/logs \
  -H 'Content-Type: application/json' -H 'X-App-Key: pk_demo_web' \
  -d '{"service":"order-api","logs":[{"level":"error","message":"db timeout","method":"POST","path":"/orders","status":503,"durationMs":3000,"ip":"1.2.3.4"}]}'
```

## 目录结构

```text
src/
├── main.ts                        # 文件日志、helmet、CORS（上报接口放开）、trust proxy
├── app.module.ts                  # 注册所有模块；RequestId + RequestLog 中间件
├── common/
│   ├── monitor/                   # range（时间范围 / SQL 片段）、client-info（IP / UA）、log-sink
│   ├── file-logger.ts             # 控制台 + logs/app.log；warn / error 转发到 log-sink 落库
│   └── http/                      # 模板：AppException、异常过滤器、响应拦截器、管道、错误文案
└── modules/
    ├── auth/ users/               # 模板：鉴权、用户
    ├── projects/ ingest/ events/ errors/ logs/ ips/ analytics/
    └── maintenance/ demo/
prisma/migrations/20260201000000_monitoring/   # 监控表
test/                              # e2e（内存仓储）：app / monitor / monitor-admin
scripts/smoke.mjs                  # 真实数据库冒烟测试
```

## 已知限制

- 没有 GeoIP 库，IP 监控只显示 IP 本身；需要地理位置时可引入 `geoip-lite` / MaxMind 在 `client-info.ts` 中解析。
- 限流、appKey 缓存、黑名单缓存都是单实例内存实现；多实例部署时黑名单最多有 30 秒延迟，限流应交给网关。
- 数据量很大（每天千万级事件）时建议把 `events` 换成 ClickHouse / TimescaleDB，接口层不用改。
