import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bucketOf,
  bucketSeries,
  inRange,
  num,
  projectFilter,
  type ResolvedRange,
} from '../../common/monitor/range';
import { PrismaService } from '../../prisma/prisma.service';
import type { LogQueryDto } from './log.dto';

export type NewServerLog = Prisma.ServerLogCreateManyInput;
export type LogFilter = Pick<LogQueryDto, 'projectId' | 'service' | 'level' | 'statusClass' | 'requestId' | 'ip' | 'q'> & {
  from: Date;
  to: Date;
};

const statusRange = (cls?: string) => {
  if (!cls) return undefined;
  const base = Number(cls[0]) * 100;
  return { gte: base, lt: base + 100 };
};

@Injectable()
export class LogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(data: NewServerLog[]) {
    if (data.length) await this.prisma.serverLog.createMany({ data });
  }

  findPage(filter: LogFilter, skip: number, take: number) {
    const where: Prisma.ServerLogWhereInput = {
      projectId: filter.projectId,
      service: filter.service,
      level: filter.level,
      status: statusRange(filter.statusClass),
      requestId: filter.requestId,
      ip: filter.ip,
      createdAt: { gte: filter.from, lte: filter.to },
      OR: filter.q
        ? [
            { message: { contains: filter.q, mode: 'insensitive' } },
            { path: { contains: filter.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    return this.prisma.$transaction([
      this.prisma.serverLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.serverLog.count({ where }),
    ]);
  }

  async services() {
    const rows = await this.prisma.serverLog.groupBy({
      by: ['service', 'projectId'],
      _max: { createdAt: true },
      orderBy: { service: 'asc' },
    });
    return rows.map((r) => ({ service: r.service, projectId: r.projectId, lastSeen: r._max.createdAt }));
  }

  /** 级别分布、状态码分布、请求趋势（含 5xx、平均耗时）、慢接口 Top 10。 */
  async stats(range: ResolvedRange, service?: string) {
    const scope = Prisma.sql`${inRange(range.from, range.to)} ${projectFilter(range.projectId)}
      ${service ? Prisma.sql`AND service = ${service}` : Prisma.empty}`;
    const [levels, statuses, trend, slow] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT level AS name, count(*) AS count FROM server_logs WHERE ${scope} GROUP BY level ORDER BY count DESC`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT (status / 100)::text || 'xx' AS name, count(*) AS count FROM server_logs
        WHERE ${scope} AND status IS NOT NULL GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        WITH ${bucketSeries(range)},
        agg AS (
          SELECT ${bucketOf(range)} AS b,
            count(*) FILTER (WHERE status IS NOT NULL) AS requests,
            count(*) FILTER (WHERE status >= 500) AS server_errors,
            count(*) FILTER (WHERE level = 'error') AS errors,
            avg(duration_ms) AS avg_ms
          FROM server_logs WHERE ${scope} GROUP BY 1)
        SELECT (buckets.b AT TIME ZONE ${range.tz}) AS bucket, agg.requests, agg.server_errors, agg.errors, agg.avg_ms
        FROM buckets LEFT JOIN agg USING (b) ORDER BY buckets.b`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT method, regexp_replace(path, '\\?.*$', '') AS path, count(*) AS count,
          avg(duration_ms) AS avg_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
          count(*) FILTER (WHERE status >= 500) AS server_errors
        FROM server_logs WHERE ${scope} AND duration_ms IS NOT NULL
        GROUP BY 1, 2 ORDER BY p95_ms DESC LIMIT 10`,
    ]);
    const named = (rows: Record<string, unknown>[]) =>
      rows.map((r) => ({ name: String(r.name), count: num(r.count) }));
    return {
      levels: named(levels),
      statuses: named(statuses),
      trend: trend.map((r) => ({
        bucket: r.bucket as Date,
        requests: num(r.requests),
        serverErrors: num(r.server_errors),
        errors: num(r.errors),
        avgMs: Math.round(num(r.avg_ms)),
      })),
      slowest: slow.map((r) => ({
        method: String(r.method ?? ''),
        path: String(r.path ?? ''),
        count: num(r.count),
        avgMs: Math.round(num(r.avg_ms)),
        p95Ms: Math.round(num(r.p95_ms)),
        serverErrors: num(r.server_errors),
      })),
    };
  }

  async deleteBefore(date: Date) {
    return (await this.prisma.serverLog.deleteMany({ where: { createdAt: { lt: date } } })).count;
  }
}
