import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logSink } from './monitor/log-sink';

const LEVELS: Record<string, LogLevel[]> = {
  debug: ['debug', 'log', 'warn', 'error', 'fatal'],
  info: ['log', 'warn', 'error', 'fatal'],
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
};

/** Nest console logger that also appends JSON lines to LOG_FILE. */
export class FileLogger extends ConsoleLogger {
  constructor(
    level: string,
    private readonly file: string,
  ) {
    super({ logLevels: LEVELS[level] ?? LEVELS.info });
    if (file) mkdirSync(dirname(file), { recursive: true });
  }

  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ) {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack);
    // 请求日志由 RequestLogMiddleware 单独落库，这里只转发应用级 warn / error（含异常堆栈）。
    if (
      (logLevel === 'warn' || logLevel === 'error' || logLevel === 'fatal') &&
      context !== 'HTTP'
    ) {
      logSink.write({
        level: logLevel === 'warn' ? 'warn' : 'error',
        context,
        message: messages.map(String).join(' '),
        stack: typeof errorStack === 'string' ? errorStack : undefined,
      });
    }
    if (!this.file) return;
    const line = {
      time: new Date().toISOString(),
      level: logLevel,
      context,
      msg: messages.map(String).join(' '),
    };
    appendFileSync(this.file, `${JSON.stringify(line)}\n`);
  }
}
