# AGENTS.md — monitor-server

修改前先读本文件和本目录 `README.md`；接口行为以 `docs/API_CONTRACT.md` 为准。

## 本模板

- 每个业务一个 Nest 模块（`src/modules/<name>`），在 `app.module.ts` 注册；需要鉴权的模块 `imports: [TokenModule]`，不要导入 `AuthModule`（避免循环依赖）。
- 入参用 class-validator DTO；字段规则复用 `users/user.dto.ts` 里的 `NameField` / `EmailField` / `PasswordField`。
- 控制器直接返回数据，不要手动包 `{ code, data }`；业务错误抛 `AppException`，新错误码在 `common/http/messages.ts` 补中英文。
- 路径 UUID 用 `@Param('id', UuidPipe)`，非法返回 `VALIDATION_ERROR`。
- 全局配置只在 `common/setup-app.ts` 维护，`main.ts` 和测试共用。
- 测试用 `test/support/app.ts` 启动真实 AppModule 并覆盖仓储为内存实现。

## 监控模块

- 统计查询用 `$queryRaw` + `src/common/monitor/range.ts` 的 SQL 片段（`bucketSeries` / `bucketOf` / `inRange` / `projectFilter`），时间桶按请求的 `tz` 切分，空桶补 0；COUNT 结果用 `num()` 转 number。
- 上报接口（`ingest`）是公开的：新增字段时要考虑截断与大小上限，不要信任客户端时间。
- 测试中监控仓储由 `test/support/monitor-memory.ts` 替换；聚合 SQL 在内存实现里只返回空结构，真实查询用 `npm run smoke`（需要运行中的服务和数据库）验证。
- 不要在 `LogsService` / `log-sink` 相关代码里使用 Nest `Logger` 输出错误，会形成「日志落库失败 → 记日志 → 再落库」的循环。

## 通用约束（5 个模板一致）

- 对外行为以 `docs/API_CONTRACT.md` 为准：成功 `{ code: 0, message, data }`，失败 `{ code: "ERROR_CODE", message, data: null, details? }`；不要新增其他响应形态。改契约前先确认前端模板（`my-frontend-template`）是否需要同步。
- 分层：路由 / 控制器只做输入校验与响应，业务规则放 service，数据访问放 repository；依赖只能自上而下，不允许循环依赖。
- 业务错误用模板的业务异常抛出，错误码大写下划线（如 `ORDER_NOT_FOUND`），并在错误文案表补中英文。
- 配置只从环境变量读取；新增配置项同步更新 `.env.example` 和启动时的配置校验。
- 改数据库结构必须提交迁移，已发布的迁移不修改。
- 每个新接口至少一个成功用例 + 每个业务错误码一个失败用例。
- Run & Debug 一律使用 `scripts/*.sh`；脚本失败先修脚本。日志写 `logs/`。
- 单文件 ≤300 行（TS / Python）/ ≤400 行（Go / Java），单目录 ≤8 个文件。
- 不引入未被需要的大型依赖（缓存、队列、DI 框架等），需要时先说明理由。
- `users` / `auth` 是约定的演示业务；作为新项目落地后，可以保留鉴权、替换或删除用户管理示例。

## 修改后检查

```bash
./scripts/test.sh
```

启动服务后运行 `npm run smoke` 做端到端检查，并在模板仓库根目录运行 `npm run contract` 做契约测试。无法运行时在回复中说明原因。
