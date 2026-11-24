import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FileLogger } from '../src/common/file-logger';
import { logSink, type AppLogEntry } from '../src/common/monitor/log-sink';
import { fingerprint } from '../src/modules/errors/fingerprint';
import { LogsService } from '../src/modules/logs/logs.service';
import { DEMO_USER } from '../src/modules/users/demo-user.seeder';
import { createTestAppWithStore, login, type MonitorStore } from './support/app';

describe('Monitoring: admin & internals (e2e, in-memory)', () => {
  let app: INestApplication;
  let store: MonitorStore;
  let admin: Record<string, string>;
  let member: Record<string, string>;
  let appKey: string;
  const http = () => request(app.getHttpServer());
  const event = {
    type: 'pageview',
    name: 'pageview',
    url: 'https://app.test/a?b=1',
    visitorId: 'v1',
    sessionId: 's1',
  };

  beforeAll(async () => {
    ({ app, store } = await createTestAppWithStore());
    admin = {
      Authorization: `Bearer ${(await login(app, DEMO_USER.email, DEMO_USER.password)).token}`,
    };
    const reg = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Viewer', email: 'viewer@example.com', password: 'password123' });
    member = { Authorization: `Bearer ${reg.body.data.accessToken}` };
    ({ appKey } = (
      await http().post('/api/v1/projects').set(admin).send({ name: 'Shop' })
    ).body.data);
  });
  afterAll(() => app.close());

  describe('ip rules', () => {
    it('blocking an IP rejects its uploads; duplicates and unknown ids are errors', async () => {
      // 先上报一次拿到本机 IP（IPv4 / IPv6 取决于运行环境），再把它拉黑。
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [event] })
        .expect(200);
      const ip = store.events.at(-1)!.ip;
      const rule = await http()
        .post('/api/v1/ip-rules')
        .set(admin)
        .send({ ip, note: 'test' })
        .expect(201);
      const dup = await http().post('/api/v1/ip-rules').set(admin).send({ ip }).expect(409);
      expect(dup.body.code).toBe('IP_RULE_EXISTS');
      await http().post('/api/v1/ip-rules').set(admin).send({ ip: 'not-an-ip' }).expect(400);
      await http().post('/api/v1/ip-rules').set(member).send({ ip: '10.0.0.1' }).expect(403);

      const blocked = await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [event] })
        .expect(403);
      expect(blocked.body.code).toBe('IP_BLOCKED');

      await http().delete(`/api/v1/ip-rules/${rule.body.data.id}`).set(admin).expect(200);
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [event] })
        .expect(200);
      const gone = await http()
        .delete(`/api/v1/ip-rules/${rule.body.data.id}`)
        .set(admin)
        .expect(404);
      expect(gone.body.code).toBe('IP_RULE_NOT_FOUND');
      await http().get('/api/v1/ips/not-an-ip').set(admin).expect(400);
      await http().get('/api/v1/ips/8.8.8.8').set(admin).expect(200);
    });
  });

  describe('dashboards', () => {
    it('validate range / tz and require login', async () => {
      await http().get('/api/v1/analytics/overview').expect(401);
      const ok = await http()
        .get('/api/v1/analytics/overview?range=7d&tz=Asia/Shanghai')
        .set(member)
        .expect(200);
      expect(ok.body.data).toHaveProperty('current.pv', 0);
      expect(ok.body.data.range.bucket).toBe('day');
      await http().get('/api/v1/analytics/trend?range=1y').set(member).expect(400);
      await http().get('/api/v1/analytics/trend?projectId=nope').set(member).expect(400);
      for (const path of ['audience', 'pages'])
        await http().get(`/api/v1/analytics/${path}`).set(member).expect(200);
      for (const path of [
        '/api/v1/events',
        '/api/v1/events/summary',
        '/api/v1/logs/stats',
        '/api/v1/ips',
        '/api/v1/ip-rules',
      ]) {
        await http().get(path).set(member).expect(200);
      }
    });
  });

  describe('self logging', () => {
    it('records its own requests (skipping successful ingest) and app errors', async () => {
      const before = store.logs.length;
      await http().get('/api/v1/projects').set(admin).expect(200);
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [event] });
      await new Promise((r) => setTimeout(r, 50));
      // 缓冲区定时落库，测试里直接 flush。
      await app.get(LogsService).flush();
      const added = store.logs.slice(before);
      expect(added.some((l) => l.path === '/api/v1/projects' && l.status === 200)).toBe(true);
      expect(added.some((l) => l.path?.startsWith('/api/v1/ingest') && (l.status ?? 0) < 400)).toBe(
        false,
      );
    });

    it('FileLogger forwards error stacks to the log sink', () => {
      const seen: AppLogEntry[] = [];
      logSink.register((entry) => seen.push(entry));
      new FileLogger('info', '').error('boom', 'Error: boom\n    at x', 'OrdersService');
      logSink.register(null);
      expect(seen[0]).toMatchObject({ level: 'error', context: 'OrdersService', message: 'boom' });
      expect(seen[0]!.stack).toContain('at x');
    });
  });

  it('fingerprint ignores volatile numbers and line numbers', () => {
    expect(fingerprint('js', 'Failed id 123', 'at a (x.js:1:2)')).toBe(
      fingerprint('js', 'Failed id 987', 'at a (x.js:40:7)'),
    );
    expect(fingerprint('js', 'A', 'at a (x.js:1:2)')).not.toBe(
      fingerprint('js', 'A', 'at b (y.js:1:2)'),
    );
  });

  it('rate limits ingest per IP', async () => {
    const results: number[] = [];
    // 限额 50 / 分钟（test/support/env.ts）；发 120 次，即使跨过分钟边界也必然有一个窗口超限。
    for (let i = 0; i < 120; i++) {
      results.push(
        (
          await http()
            .post('/api/v1/ingest/events')
            .send({ appKey: 'pk_nope', events: [event] })
        ).status,
      );
    }
    expect(results).toContain(429);
  });
});
