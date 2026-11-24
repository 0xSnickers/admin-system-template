import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app.exception';
import { toPath, type ClientInfo } from '../../common/monitor/client-info';
import { ErrorsService, type ErrorOccurrence } from '../errors/errors.service';
import { EventsService } from '../events/events.service';
import type { NewEvent } from '../events/events.repository';
import { IpsService } from '../ips/ips.service';
import { LogsService } from '../logs/logs.service';
import type { NewServerLog } from '../logs/logs.repository';
import { ProjectsService } from '../projects/projects.service';
import type { IngestEventDto, IngestEventsDto, IngestLogsDto } from './ingest.dto';
import { RateLimiter } from './rate-limiter';

const MAX_JSON = 4096;
const DAY_MS = 86_400_000;

/** JSON 字段超过 4KB 时丢弃内容，只保留标记。 */
const capJson = <T>(value: T | undefined, fallback: T): T => {
  if (value === undefined) return fallback;
  return JSON.stringify(value).length > MAX_JSON ? ({ _truncated: true } as T) : value;
};

/** 客户端时间只用于展示，限制在 [now - 1 天, now] 内，防止乱序时钟污染数据。 */
const clampTime = (ts: number | undefined, now: Date) =>
  ts && ts <= now.getTime() && ts > now.getTime() - DAY_MS ? new Date(ts) : now;

@Injectable()
export class IngestService {
  private readonly limiter: RateLimiter;

  constructor(
    config: ConfigService<Env, true>,
    private readonly projects: ProjectsService,
    private readonly ips: IpsService,
    private readonly events: EventsService,
    private readonly errors: ErrorsService,
    private readonly logs: LogsService,
  ) {
    this.limiter = new RateLimiter(config.get('INGEST_RATE_LIMIT', { infer: true }));
  }

  /** 限流 -> appKey -> 黑名单，返回项目。 */
  private async authorize(appKey: string | undefined, client: ClientInfo) {
    if (!this.limiter.hit(client.ip)) {
      throw new AppException('RATE_LIMITED', 'Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    const project = await this.projects.resolveAppKey(appKey);
    if (await this.ips.isBlocked(client.ip)) {
      throw new AppException('IP_BLOCKED', 'This IP is blocked', HttpStatus.FORBIDDEN);
    }
    return project;
  }

  async ingestEvents(dto: IngestEventsDto, appKey: string | undefined, client: ClientInfo) {
    const project = await this.authorize(dto.appKey ?? appKey, client);
    const now = new Date();
    const events: NewEvent[] = [];
    const errors: ErrorOccurrence[] = [];

    for (const e of dto.events) {
      const base = {
        projectId: project.id,
        url: e.url,
        path: toPath(e.url),
        visitorId: e.visitorId,
        sessionId: e.sessionId,
        userId: e.userId ?? null,
        ip: client.ip,
        browser: client.browser,
        os: client.os,
        device: client.device,
        release: e.release ?? null,
      };
      if (e.type === 'error') {
        errors.push(this.toError(e, base, now));
      } else {
        events.push({
          ...base,
          type: e.type,
          name: e.name,
          referrer: e.referrer ?? '',
          properties: capJson(e.properties, {}) as object,
          occurredAt: clampTime(e.ts, now),
          createdAt: now,
        });
      }
    }

    await Promise.all([this.events.record(events), this.errors.record(errors)]);
    return { accepted: dto.events.length };
  }

  private toError(
    e: IngestEventDto,
    base: Omit<ErrorOccurrence, 'type' | 'source' | 'message' | 'createdAt'>,
    now: Date,
  ): ErrorOccurrence {
    return {
      ...base,
      type: e.error?.type ?? 'custom',
      message: e.error?.message ?? e.name,
      stack: e.error?.stack ?? '',
      source: e.error?.source ?? '',
      breadcrumbs: capJson(e.breadcrumbs, []) as object,
      extra: capJson(e.properties, {}) as object,
      createdAt: now,
    };
  }

  async ingestLogs(dto: IngestLogsDto, appKey: string | undefined, client: ClientInfo) {
    const project = await this.authorize(dto.appKey ?? appKey, client);
    const now = new Date();
    const logs: NewServerLog[] = dto.logs.map((l) => ({
      projectId: project.id,
      service: dto.service,
      level: l.level,
      message: l.message,
      requestId: l.requestId ?? null,
      method: l.method?.toUpperCase() ?? null,
      path: l.path ?? null,
      status: l.status ?? null,
      durationMs: l.durationMs ?? null,
      ip: l.ip ?? null,
      userAgent: l.userAgent ?? null,
      meta: capJson(l.meta, {}) as object,
      createdAt: clampTime(l.ts, now),
    }));
    await this.logs.record(logs);
    return { accepted: logs.length };
  }
}
