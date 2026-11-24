import { Injectable } from '@nestjs/common';
import { pageResult } from '../../common/page';
import { RangeQueryDto, resolveRange } from '../../common/monitor/range';
import type { EventQueryDto } from './event.dto';
import { EventsRepository, type NewEvent } from './events.repository';

@Injectable()
export class EventsService {
  constructor(private readonly repo: EventsRepository) {}

  async list(query: EventQueryDto) {
    const { from, to } = resolveRange(query);
    const { page, limit } = query;
    const [items, total] = await this.repo.findPage(
      { ...query, from, to },
      (page - 1) * limit,
      limit,
    );
    return pageResult(items, total, { page, limit });
  }

  record(events: NewEvent[]) {
    return this.repo.createMany(events);
  }

  purgeBefore(date: Date) {
    return this.repo.deleteBefore(date);
  }

  trackSummary(query: RangeQueryDto) {
    return this.repo.trackSummary(resolveRange(query));
  }
}
