import { Module } from '@nestjs/common';
import { ErrorsModule } from '../errors/errors.module';
import { EventsModule } from '../events/events.module';
import { LogsModule } from '../logs/logs.module';
import { RetentionService } from './retention.service';

@Module({
  imports: [EventsModule, ErrorsModule, LogsModule],
  providers: [RetentionService],
})
export class MaintenanceModule {}
