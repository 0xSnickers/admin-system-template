import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { logSink } from '../../common/monitor/log-sink';
import { resolveRange } from '../../common/monitor/range';
import { pageResult } from '../../common/page';
import type { LogQueryDto, LogStatsQueryDto } from './log.dto';
import { LogsRepository, type NewServerLog } from './logs.repository';

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER = 200;
/** 数据库不可用时最多缓存的条数，超出丢弃最旧的，避免内存无限增长。 */
const MAX_PENDING = 5_000;

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private buffer: NewServerLog[] = [];
  private timer?: NodeJS.Timeout;
  private flushing = false;

  constructor(
    private readonly repo: LogsRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get serviceName() {
    return this.config.get('SERVICE_NAME', { infer: true });
  }

  get selfLogEnabled() {
    return this.config.get('SELF_LOG_ENABLED', { infer: true });
  }

  onModuleInit() {
    if (!this.selfLogEnabled) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
    logSink.register(({ level, context, message, stack }) =>
      this.enqueue({
        service: this.serviceName,
        level,
        message: `[${context}] ${message}`.slice(0, 2000),
        meta: stack ? { stack: stack.slice(0, 8000) } : {},
      }),
    );
  }

  async onModuleDestroy() {
    logSink.register(null);
    clearInterval(this.timer);
    await this.flush();
  }

  /** 本服务自己的日志：先进缓冲区，定时批量写库。 */
  enqueue(entry: NewServerLog) {
    if (!this.selfLogEnabled) return;
    this.buffer.push(entry);
    if (this.buffer.length > MAX_PENDING) this.buffer.splice(0, this.buffer.length - MAX_PENDING);
    if (this.buffer.length >= MAX_BUFFER) void this.flush();
  }

  async flush() {
    if (this.flushing || !this.buffer.length) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.repo.createMany(batch);
    } catch (error) {
      // 不用 Nest Logger：它会再次进入 logSink 形成循环。
      this.buffer.unshift(...batch.slice(-MAX_PENDING));
      console.warn('[logs] flush failed', (error as Error).message);
    } finally {
      this.flushing = false;
    }
  }

  /** 外部服务上报的日志直接写库。 */
  record(logs: NewServerLog[]) {
    return this.repo.createMany(logs);
  }

  async list(query: LogQueryDto) {
    const { from, to } = resolveRange(query);
    const { page, limit } = query;
    const [items, total] = await this.repo.findPage({ ...query, from, to }, (page - 1) * limit, limit);
    return pageResult(items, total, { page, limit });
  }

  stats(query: LogStatsQueryDto) {
    return this.repo.stats(resolveRange(query), query.service);
  }

  services() {
    return this.repo.services();
  }

  purgeBefore(date: Date) {
    return this.repo.deleteBefore(date);
  }
}
