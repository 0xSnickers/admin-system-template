import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { ErrorsService } from '../errors/errors.service';
import { EventsService } from '../events/events.service';
import { LogsService } from '../logs/logs.service';
import { ProjectsService } from '../projects/projects.service';
import { generateDemoData } from './demo-data';

export const DEMO_PROJECT = {
  name: 'Demo Web',
  appKey: 'pk_demo_web',
  description: '演示项目：7 天模拟数据',
};

const chunk = <T>(items: T[], size = 1000) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/** SEED_DEMO_DATA=true 时创建演示项目并写入 7 天模拟数据（项目已存在则跳过）。 */
@Injectable()
export class DemoDataSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoDataSeeder.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly projects: ProjectsService,
    private readonly events: EventsService,
    private readonly errors: ErrorsService,
    private readonly logs: LogsService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get('SEED_DEMO_DATA', { infer: true })) return;
    const exists = await this.projects.resolveAppKey(DEMO_PROJECT.appKey).catch(() => null);
    if (exists) return;

    const project = await this.projects.create(DEMO_PROJECT, DEMO_PROJECT.appKey);
    const data = generateDemoData(project.id);
    for (const part of chunk(data.events)) await this.events.record(part);
    for (const part of chunk(data.logs)) await this.logs.record(part);
    for (const part of chunk(data.errors, 200)) await this.errors.record(part);
    this.logger.log(
      `demo project created (appKey ${DEMO_PROJECT.appKey}): ${data.events.length} events, ${data.errors.length} errors, ${data.logs.length} logs`,
    );
  }
}
