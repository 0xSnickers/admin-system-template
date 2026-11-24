import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { FileLogger } from './common/file-logger';
import { setupApp } from './common/setup-app';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  app.useLogger(
    new FileLogger(
      config.get('LOG_LEVEL', { infer: true }),
      config.get('LOG_FILE', { infer: true }),
    ),
  );

  // 部署在反向代理后面时从 X-Forwarded-For 读取真实 IP（IP 监控依赖它）。
  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', true);
  // 上报接口会被任意站点调用，允许跨域读取响应。
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // 上报接口允许任意来源（不带 Cookie）；其余接口只允许 CORS_ORIGINS 白名单。
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors((req: Request, callback: (error: Error | null, options: CorsOptions) => void) => {
    const isIngest = req.url.startsWith('/api/v1/ingest/');
    callback(
      null,
      isIngest
        ? { origin: true, credentials: false, maxAge: 86400 }
        : { origin: origins, credentials: true },
    );
  });
  app.enableShutdownHooks();
  setupApp(app);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`HTTP server listening on :${port}`, 'Bootstrap');
}

void bootstrap();
