import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { ErrorsService } from '../errors/errors.service';
import { EventsService } from '../events/events.service';
import { LogsService } from '../logs/logs.service';

const HOUR_MS = 3_600_000;

/** 每小时删除超过 DATA_RETENTION_DAYS 的监控数据。多实例部署时只需一个实例执行（重复执行也无副作用）。 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventsService,
    private readonly errors: ErrorsService,
    private readonly logs: LogsService,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => void this.purge(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async purge(now = new Date()) {
    const days = this.config.get('DATA_RETENTION_DAYS', { infer: true });
    const cutoff = new Date(now.getTime() - days * 24 * HOUR_MS);
    try {
      const [events, errors, logs] = await Promise.all([
        this.events.purgeBefore(cutoff),
        this.errors.purgeBefore(cutoff),
        this.logs.purgeBefore(cutoff),
      ]);
      if (events + errors + logs > 0) {
        this.logger.log(
          `purged before ${cutoff.toISOString()}: ${events} events, ${errors} errors, ${logs} logs`,
        );
      }
    } catch (error) {
      this.logger.error('retention purge failed', (error as Error).stack);
    }
  }
}
