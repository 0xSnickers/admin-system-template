import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientInfo } from '../../common/monitor/client-info';
import { IngestEventsDto, IngestLogsDto } from './ingest.dto';
import { IngestService } from './ingest.service';

/**
 * 公开上报接口：用 appKey（请求体或 `X-App-Key` 头）识别项目，不需要登录。
 * 允许任意来源跨域（见 main.ts 的 CORS 配置），支持 `text/plain` 以兼容 sendBeacon。
 */
@Controller('v1/ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  /** 前端 SDK：访问、埋点、性能、异常。 */
  @Post('events')
  @HttpCode(200)
  events(
    @Body() dto: IngestEventsDto,
    @Headers('x-app-key') appKey: string | undefined,
    @Req() req: Request,
  ) {
    return this.ingest.ingestEvents(dto, appKey, clientInfo(req));
  }

  /** 后端服务：请求日志、应用日志。 */
  @Post('logs')
  @HttpCode(200)
  logs(
    @Body() dto: IngestLogsDto,
    @Headers('x-app-key') appKey: string | undefined,
    @Req() req: Request,
  ) {
    return this.ingest.ingestLogs(dto, appKey, clientInfo(req));
  }
}
