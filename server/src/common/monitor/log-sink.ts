/**
 * 应用日志 -> 数据库的桥。FileLogger 在 warn / error 时调用 `logSink.write`，
 * LogsModule 启动后注册真实实现；未注册时是空操作（测试、迁移脚本等场景）。
 * 放在 common 里是为了避免 FileLogger 依赖业务模块。
 */
export type AppLogEntry = {
  level: 'warn' | 'error';
  context: string;
  message: string;
  stack?: string;
};

let writer: ((entry: AppLogEntry) => void) | null = null;

export const logSink = {
  register(next: ((entry: AppLogEntry) => void) | null) {
    writer = next;
  },
  write(entry: AppLogEntry) {
    try {
      writer?.(entry);
    } catch {
      // 日志落库失败不能影响业务。
    }
  },
};
