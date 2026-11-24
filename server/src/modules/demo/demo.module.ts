import { Module } from '@nestjs/common';
import { ErrorsModule } from '../errors/errors.module';
import { EventsModule } from '../events/events.module';
import { LogsModule } from '../logs/logs.module';
import { ProjectsModule } from '../projects/projects.module';
import { DemoDataSeeder } from './demo-data.seeder';

@Module({
  imports: [ProjectsModule, EventsModule, ErrorsModule, LogsModule],
  providers: [DemoDataSeeder],
})
export class DemoModule {}
