import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { clientInfo } from '../../common/monitor/client-info';
import { LogsService } from './logs.service';

/** 不落库的路径：健康检查，以及成功的上报请求（量大且价值低，失败的仍然记录）。 */
const isNoise = (path: string, status: number) =>
  path === '/api/health' || path === '/api/ready' || (path.startsWith('/api/v1/ingest/') && status < 400);

/** 把本服务的每个请求写入 server_logs（异步批量），供后台「后端日志」查看。 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(private readonly logs: LogsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.logs.selfLogEnabled) return next();
    const start = Date.now();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
      if (isNoise(path, res.statusCode)) return;
      const { ip, userAgent } = clientInfo(req);
      const status = res.statusCode;
      this.logs.enqueue({
        service: this.logs.serviceName,
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        message: `${req.method} ${path} ${status}`,
        requestId: String(req.headers['x-request-id'] ?? '').slice(0, 64) || null,
        method: req.method,
        path: req.originalUrl.slice(0, 512),
        status,
        durationMs: Date.now() - start,
        ip,
        userAgent,
      });
    });
    next();
  }
}
