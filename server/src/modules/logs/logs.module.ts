import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { LogsController } from './logs.controller';
import { LogsRepository } from './logs.repository';
import { LogsService } from './logs.service';
import { RequestLogMiddleware } from './request-log.middleware';

@Module({
  imports: [TokenModule],
  controllers: [LogsController],
  providers: [LogsService, LogsRepository, RequestLogMiddleware],
  exports: [LogsService, RequestLogMiddleware],
})
export class LogsModule {}
