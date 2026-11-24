import { Injectable } from '@nestjs/common';
import { Prisma, type ErrorIssue } from '@prisma/client';
import {
  bucketOf,
  bucketSeries,
  inRange,
  num,
  projectFilter,
  type ResolvedRange,
} from '../../common/monitor/range';
import { PrismaService } from '../../prisma/prisma.service';
import type { IssueQueryDto, IssueStatus } from './error.dto';

export type NewErrorEvent = Omit<Prisma.ErrorEventCreateManyInput, 'issueId'>;
export type IssueGroup = {
  projectId: string;
  fingerprint: string;
  type: string;
  message: string;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  events: NewErrorEvent[];
};
export type IssueFilter = Pick<IssueQueryDto, 'status' | 'type' | 'q' | 'sort'>;
export type IssueRow = ErrorIssue & { rangeCount: number; users: number };

const toIssueRow = (r: Record<string, unknown>): IssueRow => ({
  id: String(r.id),
  projectId: String(r.project_id),
  fingerprint: String(r.fingerprint),
  type: String(r.type),
  message: String(r.message),
  source: String(r.source),
  status: String(r.status),
  count: num(r.count),
  firstSeen: r.first_seen as Date,
  lastSeen: r.last_seen as Date,
  createdAt: r.created_at as Date,
  updatedAt: r.updated_at as Date,
  rangeCount: num(r.range_count),
  users: num(r.users),
});

@Injectable()
export class ErrorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 按指纹 upsert 问题（已解决的问题再次出现会自动重新打开），并写入发生记录。 */
  async record(groups: IssueGroup[]) {
    if (!groups.length) return;
    await this.prisma.$transaction(async (tx) => {
      for (const g of groups) {
        const [row] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO error_issues (id, project_id, fingerprint, type, message, source, status, count, first_seen, last_seen, created_at, updated_at)
          VALUES (gen_random_uuid(), ${g.projectId}::uuid, ${g.fingerprint}, ${g.type}, ${g.message}, ${g.source},
                  'open', ${g.events.length}, ${g.firstSeen}, ${g.lastSeen}, now(), now())
          ON CONFLICT (project_id, fingerprint) DO UPDATE SET
            count = error_issues.count + EXCLUDED.count,
            first_seen = LEAST(error_issues.first_seen, EXCLUDED.first_seen),
            last_seen = GREATEST(error_issues.last_seen, EXCLUDED.last_seen),
            status = CASE WHEN error_issues.status = 'resolved' THEN 'open' ELSE error_issues.status END,
            updated_at = now()
          RETURNING id`;
        await tx.errorEvent.createMany({ data: g.events.map((e) => ({ ...e, issueId: row!.id })) });
      }
    });
  }

  /** 时间范围内发生过的问题，附带范围内次数和影响人数。 */
  async findIssues(range: ResolvedRange, filter: IssueFilter, skip: number, take: number) {
    const where = Prisma.sql`
      e.created_at >= ${range.from} AND e.created_at <= ${range.to}
      ${projectFilter(range.projectId, 'i.project_id')}
      ${filter.status ? Prisma.sql`AND i.status = ${filter.status}` : Prisma.empty}
      ${filter.type ? Prisma.sql`AND i.type = ${filter.type}` : Prisma.empty}
      ${filter.q ? Prisma.sql`AND i.message ILIKE ${`%${filter.q}%`}` : Prisma.empty}`;
    const order =
      filter.sort === 'recent'
        ? Prisma.sql`i.last_seen DESC`
        : Prisma.sql`range_count DESC, i.last_seen DESC`;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT i.*, count(e.id) AS range_count, count(DISTINCT e.visitor_id) AS users
        FROM error_issues i JOIN error_events e ON e.issue_id = i.id
        WHERE ${where}
        GROUP BY i.id ORDER BY ${order} LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(DISTINCT i.id) AS total
        FROM error_issues i JOIN error_events e ON e.issue_id = i.id
        WHERE ${where}`,
    ]);
    return { items: rows.map(toIssueRow), total: num(totals[0]?.total) };
  }

  findIssue(id: string) {
    return this.prisma.errorIssue.findUnique({ where: { id } });
  }

  updateStatus(id: string, status: IssueStatus) {
    return this.prisma.errorIssue.update({ where: { id }, data: { status } });
  }

  findEvents(issueId: string, skip: number, take: number) {
    const where = { issueId };
    return this.prisma.$transaction([
      this.prisma.errorEvent.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.errorEvent.count({ where }),
    ]);
  }

  /** 单个问题：范围内趋势、影响人数、浏览器 / 系统分布。 */
  async issueStats(issueId: string, range: ResolvedRange) {
    const [trend, users, browsers, systems] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        WITH ${bucketSeries(range)},
        agg AS (
          SELECT ${bucketOf(range)} AS b, count(*) AS count FROM error_events
          WHERE issue_id = ${issueId}::uuid AND ${inRange(range.from, range.to)}
          GROUP BY 1)
        SELECT (buckets.b AT TIME ZONE ${range.tz}) AS bucket, coalesce(agg.count, 0) AS count
        FROM buckets LEFT JOIN agg USING (b) ORDER BY buckets.b`,
      this.prisma.$queryRaw<{ users: bigint }[]>`
        SELECT count(DISTINCT visitor_id) AS users FROM error_events WHERE issue_id = ${issueId}::uuid`,
      this.groupBy(issueId, 'browser'),
      this.groupBy(issueId, 'os'),
    ]);
    return {
      trend: trend.map((r) => ({ bucket: r.bucket as Date, count: num(r.count) })),
      users: num(users[0]?.users),
      browsers,
      systems,
    };
  }

  private async groupBy(issueId: string, field: 'browser' | 'os') {
    const rows = await this.prisma.errorEvent.groupBy({
      by: [field],
      where: { issueId },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    });
    return rows.map((r) => ({ name: String(r[field]), count: r._count._all }));
  }

  async deleteBefore(date: Date) {
    const { count } = await this.prisma.errorEvent.deleteMany({
      where: { createdAt: { lt: date } },
    });
    await this.prisma.errorIssue.deleteMany({ where: { lastSeen: { lt: date } } });
    return count;
  }
}
