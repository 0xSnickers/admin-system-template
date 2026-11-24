import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ErrorsModule } from '../errors/errors.module';
import { EventsModule } from '../events/events.module';
import { IpsModule } from '../ips/ips.module';
import { LogsModule } from '../logs/logs.module';
import { ProjectsModule } from '../projects/projects.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { textJsonBody } from './text-body.middleware';

@Module({
  imports: [ProjectsModule, IpsModule, EventsModule, ErrorsModule, LogsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(textJsonBody).forRoutes(IngestController);
  }
}
