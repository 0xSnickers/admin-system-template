import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DEMO_USER } from '../src/modules/users/demo-user.seeder';
import { createTestAppWithStore, login, type MonitorStore } from './support/app';

describe('Monitoring: projects & ingest (e2e, in-memory)', () => {
  let app: INestApplication;
  let store: MonitorStore;
  let admin: Record<string, string>;
  let member: Record<string, string>;
  let appKey: string;
  let projectId: string;
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
  });
  afterAll(() => app.close());

  describe('projects', () => {
    it('admin creates a project with a generated appKey; members are read-only', async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set(admin)
        .send({ name: ' Shop ' })
        .expect(201);
      expect(res.body.data).toMatchObject({ name: 'Shop', description: '' });
      expect(res.body.data.appKey).toMatch(/^pk_[0-9a-f]{32}$/);
      ({ appKey, id: projectId } = res.body.data);

      await http().post('/api/v1/projects').set(member).send({ name: 'Nope' }).expect(403);
      const list = await http().get('/api/v1/projects').set(member).expect(200);
      expect(list.body.data.pagination.total).toBe(1);
      await http().get('/api/v1/projects').expect(401);
    });

    it('validates input and returns PROJECT_NOT_FOUND', async () => {
      const bad = await http().post('/api/v1/projects').set(admin).send({ name: 'x' }).expect(400);
      expect(bad.body.details).toHaveProperty('name');
      const missing = await http()
        .get('/api/v1/projects/00000000-0000-4000-8000-000000000000')
        .set(admin)
        .expect(404);
      expect(missing.body.code).toBe('PROJECT_NOT_FOUND');
    });

    it('rotating the key invalidates the old one', async () => {
      const temp = (await http().post('/api/v1/projects').set(admin).send({ name: 'Temp' })).body
        .data;
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey: temp.appKey, events: [event] })
        .expect(200);
      const rotated = await http()
        .post(`/api/v1/projects/${temp.id}/rotate-key`)
        .set(admin)
        .expect(201);
      expect(rotated.body.data.appKey).not.toBe(temp.appKey);
      const old = await http()
        .post('/api/v1/ingest/events')
        .send({ appKey: temp.appKey, events: [event] });
      expect(old.status).toBe(401);
      await http().delete(`/api/v1/projects/${temp.id}`).set(admin).expect(200);
    });
  });

  describe('ingest', () => {
    it('accepts JSON and enriches events with path, IP and device', async () => {
      const res = await http()
        .post('/api/v1/ingest/events')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')
        .send({
          appKey,
          events: [event, { ...event, type: 'track', name: 'buy_click', properties: { sku: 1 } }],
        })
        .expect(200);
      expect(res.body.data).toEqual({ accepted: 2 });
      const saved = store.events.filter((e) => e.projectId === projectId);
      expect(saved[0]).toMatchObject({
        path: '/a',
        os: 'iOS',
        device: 'mobile',
        browser: 'Safari',
      });
      expect(saved[0]!.ip).toMatch(/127\.0\.0\.1|::1/);
      expect(saved[1]!.properties).toEqual({ sku: 1 });
    });

    it('accepts text/plain bodies (sendBeacon) and the X-App-Key header', async () => {
      await http()
        .post('/api/v1/ingest/events')
        .set('Content-Type', 'text/plain;charset=UTF-8')
        .set('X-App-Key', appKey)
        .send(JSON.stringify({ events: [event] }))
        .expect(200);
      const bad = await http()
        .post('/api/v1/ingest/events')
        .set('Content-Type', 'text/plain')
        .send('{oops');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown app keys and invalid events with field paths', async () => {
      const key = await http()
        .post('/api/v1/ingest/events')
        .send({ appKey: 'pk_nope', events: [event] });
      expect(key.status).toBe(401);
      expect(key.body.code).toBe('INVALID_APP_KEY');
      const invalid = await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [{ ...event, type: 'click' }] })
        .expect(400);
      expect(invalid.body.details).toHaveProperty(['events.0.type']);
      await http().post('/api/v1/ingest/events').send({ appKey, events: [] }).expect(400);
    });

    it('groups errors into issues and reopens resolved issues on regression', async () => {
      const err = {
        ...event,
        type: 'error',
        name: 'TypeError',
        error: {
          type: 'js',
          message: 'TypeError: x is undefined (id 123)',
          stack: 'at render (app.js:1:10)',
        },
      };
      const twice = {
        ...err,
        error: { ...err.error, message: 'TypeError: x is undefined (id 456)' },
      };
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [err, twice] })
        .expect(200);
      expect(store.issues.size).toBe(1);
      const [issue] = [...store.issues.values()];
      expect(issue!.count).toBe(2);

      const list = await http().get('/api/v1/errors/issues').set(member).expect(200);
      expect(list.body.data.items[0].id).toBe(issue!.id);
      await http()
        .put(`/api/v1/errors/issues/${issue!.id}`)
        .set(member)
        .send({ status: 'resolved' })
        .expect(403);
      await http()
        .put(`/api/v1/errors/issues/${issue!.id}`)
        .set(admin)
        .send({ status: 'resolved' })
        .expect(200);
      await http()
        .post('/api/v1/ingest/events')
        .send({ appKey, events: [err] })
        .expect(200);
      expect(store.issues.get(issue!.id)).toMatchObject({ status: 'open', count: 3 });

      const events = await http()
        .get(`/api/v1/errors/issues/${issue!.id}/events`)
        .set(admin)
        .expect(200);
      expect(events.body.data.pagination.total).toBe(3);
      const bad = await http()
        .put(`/api/v1/errors/issues/${issue!.id}`)
        .set(admin)
        .send({ status: 'done' });
      expect(bad.status).toBe(400);
      const missing = await http()
        .get('/api/v1/errors/issues/00000000-0000-4000-8000-000000000000')
        .set(admin)
        .expect(404);
      expect(missing.body.code).toBe('ISSUE_NOT_FOUND');
    });

    it('stores backend logs from external services', async () => {
      await http()
        .post('/api/v1/ingest/logs')
        .set('X-App-Key', appKey)
        .send({
          service: 'order-api',
          logs: [{ level: 'error', message: 'db timeout', status: 503, method: 'post' }],
        })
        .expect(200);
      const res = await http().get('/api/v1/logs?service=order-api').set(admin).expect(200);
      expect(res.body.data.items[0]).toMatchObject({ projectId, method: 'POST', status: 503 });
      const bad = await http()
        .post('/api/v1/ingest/logs')
        .set('X-App-Key', appKey)
        .send({ service: 'x', logs: [{ level: 'fatal', message: 'm' }] });
      expect(bad.status).toBe(400);
    });
  });
});
