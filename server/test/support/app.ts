import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/common/setup-app';
import { RefreshTokenRepository } from '../../src/modules/auth/refresh-token.repository';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { ErrorsRepository } from '../../src/modules/errors/errors.repository';
import { EventsRepository } from '../../src/modules/events/events.repository';
import { IpsRepository } from '../../src/modules/ips/ips.repository';
import { LogsRepository } from '../../src/modules/logs/logs.repository';
import { ProjectsRepository } from '../../src/modules/projects/projects.repository';
import { createMemoryRepos } from './memory';
import { createMonitorMemory } from './monitor-memory';

export type MonitorStore = ReturnType<typeof createMonitorMemory>['store'];

/** Boots the real AppModule with in-memory persistence (demo admin is seeded). */
export async function createTestApp(): Promise<INestApplication> {
  return (await createTestAppWithStore()).app;
}

/** 同 createTestApp，额外返回监控数据的内存存储，便于断言写入结果。 */
export async function createTestAppWithStore(): Promise<{
  app: INestApplication;
  store: MonitorStore;
}> {
  const { usersRepo, refreshRepo } = createMemoryRepos();
  const monitor = createMonitorMemory();
  const { projectsRepo, eventsRepo, errorsRepo, logsRepo, ipsRepo, analyticsRepo } = monitor.repos;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: async () => [{ ok: 1 }], $disconnect: async () => {} })
    .overrideProvider(UsersRepository)
    .useValue(usersRepo)
    .overrideProvider(RefreshTokenRepository)
    .useValue(refreshRepo)
    .overrideProvider(ProjectsRepository)
    .useValue(projectsRepo)
    .overrideProvider(EventsRepository)
    .useValue(eventsRepo)
    .overrideProvider(ErrorsRepository)
    .useValue(errorsRepo)
    .overrideProvider(LogsRepository)
    .useValue(logsRepo)
    .overrideProvider(IpsRepository)
    .useValue(ipsRepo)
    .overrideProvider(AnalyticsRepository)
    .useValue(analyticsRepo)
    .compile();
  const app = setupApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, store: monitor.store };
}

export async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  const cookie =
    (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';
  return { token: res.body.data?.accessToken as string, cookie, res };
}
