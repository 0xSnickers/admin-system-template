#!/usr/bin/env node
/**
 * 对运行中的服务做端到端冒烟测试（真实数据库，覆盖所有监控接口）。
 * 前提：开发环境启动（SEED_DEMO_USER=true、SEED_DEMO_DATA=true）。
 *
 *   ./scripts/dev.sh            # 另开终端
 *   npm run smoke               # 或 BASE_URL=http://host:9000/api npm run smoke
 *
 * 会临时创建 / 删除一个项目、拉黑 / 解除 127.0.0.1；失败时退出码为 1。
 */
const B = process.env.BASE_URL ?? 'http://localhost:9000/api';
let failures = 0;
const j = async (method, path, body, headers = {}) => {
  const res = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', 'accept-language': 'zh-CN', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
};
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label} ${String(extra).slice(0, 160)}`);
};
const login = await j('POST', '/v1/auth/login', {
  email: 'demo@example.com',
  password: 'password123',
});
const auth = { authorization: `Bearer ${login.data.data.accessToken}` };
const projects = await j('GET', '/v1/projects', undefined, auth);
const demo = projects.data.data.items.find((p) => p.appKey === 'pk_demo_web');
ok('projects list', !!demo);
for (const range of ['1h', '24h', '7d', '30d']) {
  const q = `?range=${range}&tz=Asia/Shanghai&projectId=${demo.id}`;
  const ov = await j('GET', '/v1/analytics/overview' + q, undefined, auth);
  const tr = await j('GET', '/v1/analytics/trend' + q, undefined, auth);
  ok(`overview ${range}`, ov.status === 200, JSON.stringify(ov.data.data?.current ?? ov.data));
  ok(
    `trend ${range}`,
    tr.status === 200,
    `points=${tr.data.data?.length} sample=${JSON.stringify(tr.data.data?.at(-1) ?? tr.data)}`,
  );
}
const q = `?range=7d&tz=Asia/Shanghai`;
for (const p of [
  '/v1/analytics/pages',
  '/v1/analytics/audience',
  '/v1/events/summary',
  '/v1/events',
  '/v1/events?type=track&limit=2',
  '/v1/errors/issues',
  '/v1/errors/issues?sort=recent&type=js',
  '/v1/logs',
  '/v1/logs?statusClass=5xx&q=orders',
  '/v1/logs/stats',
  '/v1/logs/services',
  '/v1/ips',
  '/v1/ips?q=203.',
  '/v1/ip-rules',
]) {
  const r = await j('GET', p + (p.includes('?') ? q.replace('?', '&') : q), undefined, auth);
  ok(`GET ${p}`, r.status === 200, JSON.stringify(r.data.data ?? r.data).slice(0, 220));
}
const issues = await j('GET', '/v1/errors/issues' + q, undefined, auth);
const issue = issues.data.data.items[0];
const det = await j('GET', `/v1/errors/issues/${issue.id}` + q, undefined, auth);
ok('issue detail', det.status === 200, JSON.stringify(det.data.data).slice(0, 300));
const ev = await j('GET', `/v1/errors/issues/${issue.id}/events`, undefined, auth);
ok('issue events', ev.status === 200 && ev.data.data.items.length > 0);
const upd = await j('PUT', `/v1/errors/issues/${issue.id}`, { status: 'resolved' }, auth);
ok('resolve issue', upd.data.data?.status === 'resolved');
const ipd = await j('GET', '/v1/ips/203.0.113.66' + q, undefined, auth);
ok(
  'ip detail',
  ipd.status === 200 && ipd.data.data.summary,
  JSON.stringify(ipd.data.data).slice(0, 300),
);

// ingest: JSON, text/plain, error regression reopen, logs, validation, bad key
const ev1 = {
  type: 'pageview',
  name: 'pageview',
  url: 'http://localhost:5173/dash?x=1',
  visitorId: 'v1',
  sessionId: 's1',
  ts: Date.now(),
};
const errEv = {
  type: 'error',
  name: issue.message,
  url: 'https://shop.example.com/cart',
  visitorId: 'v1',
  sessionId: 's1',
  error: {
    type: issue.type,
    message: issue.message,
    stack: det.data.data.message.includes('price')
      ? "TypeError: Cannot read properties of undefined (reading 'price')\n    at CartItem (https://shop.example.com/assets/index-3f2a.js:1:48211)"
      : '',
  },
};
const ing = await j(
  'POST',
  '/v1/ingest/events',
  {
    appKey: 'pk_demo_web',
    events: [ev1, { ...ev1, type: 'track', name: 'btn_click', properties: { a: 1 } }],
  },
  {
    origin: 'http://foo.test',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
  },
);
ok(
  'ingest json',
  ing.status === 200 && ing.data.data.accepted === 2,
  `acao=${ing.headers.get('access-control-allow-origin')}`,
);
const txt = await j(
  'POST',
  '/v1/ingest/events',
  JSON.stringify({ appKey: 'pk_demo_web', events: [errEv] }),
  { 'content-type': 'text/plain;charset=UTF-8' },
);
ok('ingest text/plain', txt.status === 200, JSON.stringify(txt.data));
const after = await j('GET', `/v1/errors/issues/${issue.id}` + q, undefined, auth);
ok(
  'regression reopens (js issue only)',
  after.data.data.status === (issue.type === 'js' ? 'open' : 'resolved'),
  `type=${issue.type} status=${after.data.data.status} count ${issue.count}->${after.data.data.count}`,
);
const badJson = await j('POST', '/v1/ingest/events', '{bad', { 'content-type': 'text/plain' });
ok(
  'ingest bad text json -> 400',
  badJson.status === 400 && badJson.data.code === 'VALIDATION_ERROR',
  JSON.stringify(badJson.data),
);
const badKey = await j('POST', '/v1/ingest/events', { appKey: 'nope', events: [ev1] });
ok(
  'bad appKey -> 401 INVALID_APP_KEY',
  badKey.status === 401 && badKey.data.code === 'INVALID_APP_KEY',
  badKey.data.message,
);
const invalid = await j('POST', '/v1/ingest/events', {
  appKey: 'pk_demo_web',
  events: [{ type: 'nope' }],
});
ok('invalid event -> 400', invalid.status === 400, JSON.stringify(invalid.data.details));
const logs = await j(
  'POST',
  '/v1/ingest/logs',
  {
    service: 'order-api',
    logs: [
      {
        level: 'error',
        message: 'db timeout',
        method: 'post',
        path: '/orders',
        status: 503,
        durationMs: 3000,
        ip: '8.8.8.8',
      },
    ],
  },
  { 'x-app-key': 'pk_demo_web' },
);
ok('ingest logs', logs.status === 200, JSON.stringify(logs.data));
// preflight for ingest from arbitrary origin
const pre = await fetch(B + '/v1/ingest/events', {
  method: 'OPTIONS',
  headers: {
    origin: 'http://any.test',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
  },
});
ok(
  'ingest preflight any origin',
  pre.headers.get('access-control-allow-origin') === 'http://any.test',
  pre.status,
);
const pre2 = await fetch(B + '/v1/projects', {
  method: 'OPTIONS',
  headers: { origin: 'http://any.test', 'access-control-request-method': 'GET' },
});
ok('admin api preflight rejects unknown origin', !pre2.headers.get('access-control-allow-origin'));
// ip block
const blk = await j('POST', '/v1/ip-rules', { ip: '127.0.0.1', note: 'test' }, auth);
ok('block ip', blk.status === 201, JSON.stringify(blk.data));
const dup = await j('POST', '/v1/ip-rules', { ip: '127.0.0.1' }, auth);
ok('dup block -> 409', dup.status === 409 && dup.data.code === 'IP_RULE_EXISTS');
const blocked = await j('POST', '/v1/ingest/events', { appKey: 'pk_demo_web', events: [ev1] });
ok(
  'blocked ip -> 403',
  blocked.status === 403 && blocked.data.code === 'IP_BLOCKED',
  blocked.data.message,
);
const unb = await j('DELETE', `/v1/ip-rules/${blk.data.data.id}`, undefined, auth);
ok('unblock', unb.status === 200);
// project CRUD
const np = await j('POST', '/v1/projects', { name: ' My App ', description: 'x' }, auth);
ok(
  'create project',
  np.status === 201 && np.data.data.appKey.startsWith('pk_') && np.data.data.name === 'My App',
);
const rot = await j('POST', `/v1/projects/${np.data.data.id}/rotate-key`, undefined, auth);
ok('rotate key', rot.data.data.appKey !== np.data.data.appKey);
const oldKey = await j('POST', '/v1/ingest/events', { appKey: np.data.data.appKey, events: [ev1] });
ok('old key rejected', oldKey.status === 401);
const del = await j('DELETE', `/v1/projects/${np.data.data.id}`, undefined, auth);
ok('delete project', del.status === 200);
await new Promise((r) => setTimeout(r, 2500));
const self = await j('GET', '/v1/logs?range=1h&service=monitor-server&limit=3', undefined, auth);
ok(
  'self request logs persisted',
  self.data.data.pagination.total > 0,
  JSON.stringify(self.data.data.items[0]).slice(0, 250),
);
const noise = await j(
  'GET',
  '/v1/logs?range=1h&service=monitor-server&q=ingest&limit=50',
  undefined,
  auth,
);
ok(
  'failed ingest logged, success not',
  noise.data.data.items
    .filter((l) => l.path.startsWith('/api/v1/ingest/'))
    .every((l) => l.status >= 400),
  `n=${noise.data.data.items.length}`,
);
const ext = await j('GET', '/v1/logs?range=1h&service=order-api', undefined, auth);
ok(
  'external log stored',
  ext.data.data.items[0]?.method === 'POST' && ext.data.data.items[0]?.ip === '8.8.8.8',
);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
