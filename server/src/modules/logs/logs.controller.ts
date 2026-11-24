import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { LogQueryDto, LogStatsQueryDto } from './log.dto';
import { LogsService } from './logs.service';

@Controller('v1/logs')
@UseGuards(AuthGuard)
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  list(@Query() query: LogQueryDto) {
    return this.logs.list(query);
  }

  @Get('stats')
  stats(@Query() query: LogStatsQueryDto) {
    return this.logs.stats(query);
  }

  /** 已上报过日志的服务列表（用于筛选）。 */
  @Get('services')
  services() {
    return this.logs.services();
  }
}
