import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { DemoModule } from './modules/demo/demo.module';
import { ErrorsModule } from './modules/errors/errors.module';
import { EventsModule } from './modules/events/events.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { IpsModule } from './modules/ips/ips.module';
import { LogsModule } from './modules/logs/logs.module';
import { RequestLogMiddleware } from './modules/logs/request-log.middleware';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    IngestModule,
    EventsModule,
    ErrorsModule,
    LogsModule,
    IpsModule,
    AnalyticsModule,
    MaintenanceModule,
    DemoModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Nest 11（path-to-regexp v8）的全量通配写法，`'*'` 会触发 LegacyRouteConverter 警告。
    consumer.apply(RequestIdMiddleware, RequestLogMiddleware).forRoutes('{*path}');
  }
}
