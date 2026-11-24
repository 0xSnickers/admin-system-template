import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RangeQueryDto } from '../../common/monitor/range';
import { AuthGuard } from '../auth/auth.guard';
import { AnalyticsService } from './analytics.service';

/** 访问量统计（PV / UV / 会话 / 趋势 / 页面 / 来源 / 设备）。 */
@Controller('v1/analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@Query() query: RangeQueryDto) {
    return this.analytics.overview(query);
  }

  @Get('trend')
  trend(@Query() query: RangeQueryDto) {
    return this.analytics.trend(query);
  }

  @Get('pages')
  pages(@Query() query: RangeQueryDto) {
    return this.analytics.pages(query);
  }

  @Get('audience')
  audience(@Query() query: RangeQueryDto) {
    return this.analytics.audience(query);
  }
}
