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

export type IpSummary = {
  ip: string;
  total: number;
  pageviews: number;
  events: number;
  errors: number;
  requests: number;
  visitors: number;
  firstSeen: Date;
  lastSeen: Date;
  blocked: boolean;
};

const toSummary = (r: Record<string, unknown>): IpSummary => ({
  ip: String(r.ip),
  total: num(r.total),
  pageviews: num(r.pageviews),
  events: num(r.events),
  errors: num(r.errors),
  requests: num(r.requests),
  visitors: num(r.visitors),
  firstSeen: r.first_seen as Date,
  lastSeen: r.last_seen as Date,
  blocked: Boolean(r.blocked),
});

@Injectable()
export class IpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 把三张表的数据按 IP 合并（UNION ALL 后聚合）。 */
  private unionSql(range: ResolvedRange, ipFilter: Prisma.Sql) {
    const scope = Prisma.sql`${inRange(range.from, range.to)} ${projectFilter(range.projectId)} ${ipFilter}`;
    return Prisma.sql`
      SELECT ip, count(*) FILTER (WHERE type = 'pageview') AS pageviews, count(*) AS events, 0 AS errors, 0 AS requests,
             count(DISTINCT visitor_id) AS visitors, min(created_at) AS first_seen, max(created_at) AS last_seen
        FROM events WHERE ${scope} GROUP BY ip
      UNION ALL
      SELECT ip, 0, 0, count(*), 0, 0, min(created_at), max(created_at) FROM error_events WHERE ${scope} GROUP BY ip
      UNION ALL
      SELECT ip, 0, 0, 0, count(*), 0, min(created_at), max(created_at)
        FROM server_logs WHERE ${scope} AND ip IS NOT NULL AND status IS NOT NULL GROUP BY ip`;
  }

  async findPage(range: ResolvedRange, q: string | undefined, skip: number, take: number) {
    const ipFilter = q ? Prisma.sql`AND ip LIKE ${`${q.replace(/[%_]/g, '')}%`}` : Prisma.empty;
    const union = this.unionSql(range, ipFilter);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT t.ip, sum(pageviews) AS pageviews, sum(events) AS events, sum(errors) AS errors,
               sum(requests) AS requests, sum(events) + sum(errors) + sum(requests) AS total,
               max(visitors) AS visitors, min(first_seen) AS first_seen, max(last_seen) AS last_seen,
               bool_or(r.id IS NOT NULL) AS blocked
        FROM (${union}) t LEFT JOIN ip_rules r ON r.ip = t.ip
        GROUP BY t.ip ORDER BY total DESC, last_seen DESC LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<
        { total: bigint }[]
      >`SELECT count(DISTINCT ip) AS total FROM (${union}) t`,
    ]);
    return { items: rows.map(toSummary), total: num(totals[0]?.total) };
  }

  /** 单个 IP 画像：汇总、趋势、访问页面、设备、访客、最近错误和请求。 */
  async detail(range: ResolvedRange, ip: string) {
    const ipFilter = Prisma.sql`AND ip = ${ip}`;
    const scope = Prisma.sql`${inRange(range.from, range.to)} ${projectFilter(range.projectId)} ${ipFilter}`;
    const [summary, trend, pages, agents, visitors, errors, requests] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT ${ip} AS ip, sum(pageviews) AS pageviews, sum(events) AS events, sum(errors) AS errors,
               sum(requests) AS requests, sum(events) + sum(errors) + sum(requests) AS total,
               max(visitors) AS visitors, min(first_seen) AS first_seen, max(last_seen) AS last_seen,
               EXISTS (SELECT 1 FROM ip_rules WHERE ip = ${ip}) AS blocked
        FROM (${this.unionSql(range, ipFilter)}) t`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        WITH ${bucketSeries(range)},
        agg AS (
          SELECT b, sum(c) AS count FROM (
            SELECT ${bucketOf(range)} AS b, count(*) AS c FROM events WHERE ${scope} GROUP BY 1
            UNION ALL
            SELECT ${bucketOf(range)}, count(*) FROM server_logs WHERE ${scope} AND status IS NOT NULL GROUP BY 1
          ) x GROUP BY b)
        SELECT (buckets.b AT TIME ZONE ${range.tz}) AS bucket, coalesce(agg.count, 0) AS count
        FROM buckets LEFT JOIN agg USING (b) ORDER BY buckets.b`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT path AS name, count(*) AS count FROM events WHERE ${scope} AND type = 'pageview'
        GROUP BY path ORDER BY count DESC LIMIT 10`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT browser || ' / ' || os || ' / ' || device AS name, count(*) AS count FROM events WHERE ${scope}
        GROUP BY 1 ORDER BY count DESC LIMIT 10`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT visitor_id AS name, count(*) AS count FROM events WHERE ${scope}
        GROUP BY visitor_id ORDER BY count DESC LIMIT 10`,
      this.prisma.errorEvent.findMany({
        where: { ip, projectId: range.projectId, createdAt: { gte: range.from, lte: range.to } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, issueId: true, message: true, path: true, createdAt: true },
      }),
      this.prisma.serverLog.findMany({
        where: {
          ip,
          projectId: range.projectId,
          status: { not: null },
          createdAt: { gte: range.from, lte: range.to },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          service: true,
          method: true,
          path: true,
          status: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ]);
    const named = (rows: Record<string, unknown>[]) =>
      rows.map((r) => ({ name: String(r.name), count: num(r.count) }));
    return {
      summary: summary[0]?.first_seen ? toSummary(summary[0]) : null,
      trend: trend.map((r) => ({ bucket: r.bucket as Date, count: num(r.count) })),
      pages: named(pages),
      agents: named(agents),
      visitors: named(visitors),
      errors,
      requests,
    };
  }

  findRules() {
    return this.prisma.ipRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findRuleByIp(ip: string) {
    return this.prisma.ipRule.findUnique({ where: { ip } });
  }

  findRuleById(id: string) {
    return this.prisma.ipRule.findUnique({ where: { id } });
  }

  createRule(ip: string, note: string) {
    return this.prisma.ipRule.create({ data: { ip, note } });
  }

  async deleteRule(id: string) {
    await this.prisma.ipRule.delete({ where: { id } });
  }
}
