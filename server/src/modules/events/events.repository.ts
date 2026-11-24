import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { num, projectFilter, type ResolvedRange } from '../../common/monitor/range';
import { PrismaService } from '../../prisma/prisma.service';
import type { EventQueryDto } from './event.dto';

export type NewEvent = Prisma.EventCreateManyInput;
export type EventFilter = Omit<EventQueryDto, 'range' | 'tz' | 'page' | 'limit'> & {
  from: Date;
  to: Date;
};
export type TrackSummary = { name: string; count: number; visitors: number; lastSeen: Date };

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(data: NewEvent[]) {
    if (data.length) await this.prisma.event.createMany({ data });
  }

  findPage(filter: EventFilter, skip: number, take: number) {
    const where: Prisma.EventWhereInput = {
      projectId: filter.projectId,
      type: filter.type,
      name: filter.name,
      visitorId: filter.visitorId,
      userId: filter.userId,
      ip: filter.ip,
      path: filter.path ? { contains: filter.path } : undefined,
      createdAt: { gte: filter.from, lte: filter.to },
    };
    return this.prisma.$transaction([
      this.prisma.event.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.event.count({ where }),
    ]);
  }

  /** 埋点事件按名称汇总：触发次数、触发人数、最近一次时间。 */
  async trackSummary(range: ResolvedRange): Promise<TrackSummary[]> {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT name, count(*) AS count, count(DISTINCT visitor_id) AS visitors, max(created_at) AS last_seen
      FROM events
      WHERE type = 'track' AND created_at >= ${range.from} AND created_at <= ${range.to}
        ${projectFilter(range.projectId)}
      GROUP BY name ORDER BY count DESC LIMIT 100`;
    return rows.map((r) => ({
      name: String(r.name),
      count: num(r.count),
      visitors: num(r.visitors),
      lastSeen: r.last_seen as Date,
    }));
  }

  async deleteBefore(date: Date) {
    return (await this.prisma.event.deleteMany({ where: { createdAt: { lt: date } } })).count;
  }
}
