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

export type Totals = {
  pv: number;
  uv: number;
  sessions: number;
  ips: number;
  events: number;
  errors: number;
  errorVisitors: number;
  requests: number;
  serverErrors: number;
  avgDurationMs: number;
  avgLoadMs: number;
  avgFcpMs: number;
};

export type DimensionKey = 'browser' | 'os' | 'device';
const DIMENSIONS: Record<DimensionKey, string> = { browser: 'browser', os: 'os', device: 'device' };

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async totals(projectId: string | undefined, from: Date, to: Date): Promise<Totals> {
    const scope = Prisma.sql`${inRange(from, to)} ${projectFilter(projectId)}`;
    const [[events], [errors], [logs]] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT count(*) FILTER (WHERE type = 'pageview') AS pv,
               count(DISTINCT visitor_id) FILTER (WHERE type = 'pageview') AS uv,
               count(DISTINCT session_id) AS sessions,
               count(DISTINCT ip) AS ips,
               count(*) FILTER (WHERE type = 'track') AS events,
               avg((properties->>'load')::float) FILTER (WHERE type = 'performance') AS avg_load,
               avg((properties->>'fcp')::float) FILTER (WHERE type = 'performance') AS avg_fcp
        FROM events WHERE ${scope}`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT count(*) AS errors, count(DISTINCT visitor_id) AS visitors FROM error_events WHERE ${scope}`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT count(*) AS requests, count(*) FILTER (WHERE status >= 500) AS server_errors,
               avg(duration_ms) AS avg_ms
        FROM server_logs WHERE ${scope} AND status IS NOT NULL`,
    ]);
    return {
      pv: num(events?.pv),
      uv: num(events?.uv),
      sessions: num(events?.sessions),
      ips: num(events?.ips),
      events: num(events?.events),
      errors: num(errors?.errors),
      errorVisitors: num(errors?.visitors),
      requests: num(logs?.requests),
      serverErrors: num(logs?.server_errors),
      avgDurationMs: Math.round(num(logs?.avg_ms)),
      avgLoadMs: Math.round(num(events?.avg_load)),
      avgFcpMs: Math.round(num(events?.avg_fcp)),
    };
  }

  /** PV / UV / 前端异常 / 后端请求 / 5xx 的时间序列，空桶补 0。 */
  async trend(range: ResolvedRange) {
    const scope = Prisma.sql`${inRange(range.from, range.to)} ${projectFilter(range.projectId)}`;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH ${bucketSeries(range)},
      ev AS (
        SELECT ${bucketOf(range)} AS b, count(*) AS pv, count(DISTINCT visitor_id) AS uv
        FROM events WHERE ${scope} AND type = 'pageview' GROUP BY 1),
      er AS (SELECT ${bucketOf(range)} AS b, count(*) AS errors FROM error_events WHERE ${scope} GROUP BY 1),
      lg AS (
        SELECT ${bucketOf(range)} AS b, count(*) AS requests, count(*) FILTER (WHERE status >= 500) AS server_errors
        FROM server_logs WHERE ${scope} AND status IS NOT NULL GROUP BY 1)
      SELECT (buckets.b AT TIME ZONE ${range.tz}) AS bucket, ev.pv, ev.uv, er.errors, lg.requests, lg.server_errors
      FROM buckets LEFT JOIN ev USING (b) LEFT JOIN er USING (b) LEFT JOIN lg USING (b)
      ORDER BY buckets.b`;
    return rows.map((r) => ({
      bucket: r.bucket as Date,
      pv: num(r.pv),
      uv: num(r.uv),
      errors: num(r.errors),
      requests: num(r.requests),
      serverErrors: num(r.server_errors),
    }));
  }

  async topPages(range: ResolvedRange, limit = 10) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT path, count(*) AS pv, count(DISTINCT visitor_id) AS uv
      FROM events
      WHERE type = 'pageview' AND ${inRange(range.from, range.to)} ${projectFilter(range.projectId)}
      GROUP BY path ORDER BY pv DESC LIMIT ${limit}`;
    return rows.map((r) => ({ path: String(r.path), pv: num(r.pv), uv: num(r.uv) }));
  }

  /** 来源：按 referrer 域名归类，空值为直接访问。 */
  async referrers(range: ResolvedRange, limit = 10) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT coalesce(nullif(substring(referrer from '^https?://([^/:?#]+)'), ''), '(direct)') AS name,
             count(*) AS pv, count(DISTINCT visitor_id) AS uv
      FROM events
      WHERE type = 'pageview' AND ${inRange(range.from, range.to)} ${projectFilter(range.projectId)}
      GROUP BY 1 ORDER BY pv DESC LIMIT ${limit}`;
    return rows.map((r) => ({ name: String(r.name), pv: num(r.pv), uv: num(r.uv) }));
  }

  /** 访客按浏览器 / 系统 / 设备分布（按人数）。 */
  async dimension(range: ResolvedRange, key: DimensionKey) {
    const column = Prisma.raw(DIMENSIONS[key]);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${column} AS name, count(DISTINCT visitor_id) AS visitors, count(*) AS pv
      FROM events
      WHERE type = 'pageview' AND ${inRange(range.from, range.to)} ${projectFilter(range.projectId)}
      GROUP BY 1 ORDER BY visitors DESC LIMIT 10`;
    return rows.map((r) => ({ name: String(r.name), visitors: num(r.visitors), pv: num(r.pv) }));
  }
}
