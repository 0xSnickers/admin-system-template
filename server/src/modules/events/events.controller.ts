import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RangeQueryDto } from '../../common/monitor/range';
import { AuthGuard } from '../auth/auth.guard';
import { EventQueryDto } from './event.dto';
import { EventsService } from './events.service';

@Controller('v1/events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** 行为明细（访问 / 埋点 / 性能），默认按时间倒序。 */
  @Get()
  list(@Query() query: EventQueryDto) {
    return this.events.list(query);
  }

  /** 埋点事件汇总。 */
  @Get('summary')
  summary(@Query() query: RangeQueryDto) {
    return this.events.trackSummary(query);
  }
}
