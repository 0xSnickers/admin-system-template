import { randomUUID } from 'node:crypto';
import { parseUserAgent } from '../../common/monitor/client-info';
import type { ErrorOccurrence } from '../errors/errors.service';
import type { NewEvent } from '../events/events.repository';
import type { NewServerLog } from '../logs/logs.repository';
import { AGENTS, APIS, ERRORS, ORIGIN, PAGES, REFERRERS, TRACKS } from './demo-fixtures';

/** 可复现的伪随机数（mulberry32），保证每次生成的演示数据形态一致。 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, items: [T, number][]) => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [item, w] of items) if ((x -= w) < 0) return item;
  return items[0]![0];
};

/** 白天流量更高（按 UTC+8 的作息）。 */
const hourWeight = (date: Date) => {
  const h = (date.getUTCHours() + 8) % 24;
  return h < 7 ? 0.15 : h < 9 ? 0.6 : h < 12 ? 1 : h < 14 ? 0.8 : h < 18 ? 0.9 : h < 23 ? 1.2 : 0.5;
};

export type DemoData = { events: NewEvent[]; errors: ErrorOccurrence[]; logs: NewServerLog[] };

export function generateDemoData(
  projectId: string,
  now = new Date(),
  days = 7,
  seed = 20260201,
): DemoData {
  const r = rng(seed);
  const ips = Array.from({ length: 80 }, () =>
    [
      1 + Math.floor(r() * 222),
      Math.floor(r() * 255),
      Math.floor(r() * 255),
      1 + Math.floor(r() * 253),
    ].join('.'),
  );
  const visitors = Array.from({ length: 420 }, () => ({
    id: randomUUID(),
    ip: ips[Math.floor(r() * ips.length)]!,
    ua: pick(r, AGENTS),
    userId: r() < 0.3 ? `u_${Math.floor(r() * 10_000)}` : null,
  }));
  const data: DemoData = { events: [], errors: [], logs: [] };
  const span = days * 86_400_000;

  for (const visitor of visitors) {
    const { browser, os, device } = parseUserAgent(visitor.ua);
    const sessions = 1 + Math.floor(r() * 4);
    for (let s = 0; s < sessions; s++) {
      let t = now.getTime() - r() * span;
      if (r() > hourWeight(new Date(t))) continue;
      const sessionId = randomUUID();
      const base = {
        projectId,
        visitorId: visitor.id,
        sessionId,
        userId: visitor.userId,
        ip: visitor.ip,
        browser,
        os,
        device,
        release: '1.4.2',
      };
      let referrer = pick(r, REFERRERS);
      const views = 1 + Math.floor(r() * 6);
      for (let v = 0; v < views && t < now.getTime(); v++) {
        const path = pick(r, PAGES);
        const at = new Date(t);
        const url = `${ORIGIN}${path}`;
        data.events.push({
          ...base,
          type: 'pageview',
          name: 'pageview',
          url,
          path,
          referrer,
          properties: {},
          occurredAt: at,
          createdAt: at,
        });
        referrer = url;
        if (v === 0) {
          const load = Math.round(600 + r() * 1800 + (device === 'mobile' ? 600 : 0));
          data.events.push({
            ...base,
            type: 'performance',
            name: 'page_load',
            url,
            path,
            properties: { ttfb: Math.round(load * 0.2), fcp: Math.round(load * 0.55), load },
            occurredAt: at,
            createdAt: at,
          });
        }
        if (r() < 0.45) {
          const name = pick(r, TRACKS);
          const props =
            name === 'purchase_success' ? { amount: Math.round(20 + r() * 500) } : { from: path };
          data.events.push({
            ...base,
            type: 'track',
            name,
            url,
            path,
            properties: props,
            occurredAt: new Date(t + 4000),
            createdAt: new Date(t + 4000),
          });
        }
        if (r() < 0.035) {
          const err = pick(
            r,
            ERRORS.map((e) => [e, e.weight] as [(typeof ERRORS)[number], number]),
          );
          data.errors.push({
            ...base,
            type: err.type,
            message: err.message,
            stack: err.stack,
            source: '',
            url: `${ORIGIN}${err.path}`,
            path: err.path,
            breadcrumbs: [{ type: 'pageview', message: path, ts: t }],
            extra: {},
            createdAt: new Date(t + 2000),
          });
        }
        const calls = 1 + Math.floor(r() * 3);
        for (let c = 0; c < calls; c++) {
          const [method, apiPath] = pick(
            r,
            APIS.map(([m, p, w]) => [[m, p], w] as [[string, string], number]),
          );
          const roll = r();
          const status =
            roll < 0.01
              ? 500
              : roll < 0.015
                ? 502
                : roll < 0.05
                  ? 404
                  : roll < 0.07
                    ? 401
                    : method === 'POST'
                      ? 201
                      : 200;
          const durationMs = Math.round(
            Math.exp(3.4 + r() * 1.6 + (apiPath === '/api/search' ? 1 : 0)),
          );
          data.logs.push({
            projectId,
            service: 'demo-api',
            level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
            message: `${method} ${apiPath} ${status}`,
            requestId: randomUUID(),
            method,
            path: apiPath,
            status,
            durationMs,
            ip: visitor.ip,
            userAgent: visitor.ua,
            meta: {},
            createdAt: new Date(t + 300 + c * 150),
          });
          if (status >= 500) {
            data.logs.push({
              projectId,
              service: 'demo-api',
              level: 'error',
              message: `[OrdersService] ${status === 500 ? 'deadlock detected while creating order' : 'upstream payment gateway timeout'}`,
              meta: {
                stack:
                  'Error: deadlock detected\n    at OrdersService.create (src/orders/orders.service.ts:88:13)',
              },
              createdAt: new Date(t + 320 + c * 150),
            });
          }
        }
        t += 15_000 + r() * 90_000;
      }
    }
  }

  // 一个高频爬虫 IP，用于演示 IP 监控。
  const botUa = 'Mozilla/5.0 (compatible; ExampleBot/2.1; +http://example.com/bot)';
  const bot = parseUserAgent(botUa);
  for (let i = 0; i < 600; i++) {
    const at = new Date(now.getTime() - 6 * 3_600_000 + i * 20_000);
    const path = pick(r, PAGES);
    data.events.push({
      projectId,
      type: 'pageview',
      name: 'pageview',
      url: `${ORIGIN}${path}`,
      path,
      referrer: '',
      visitorId: 'bot-visitor',
      sessionId: `bot-${Math.floor(i / 50)}`,
      userId: null,
      ip: '203.0.113.66',
      ...bot,
      release: null,
      properties: {},
      occurredAt: at,
      createdAt: at,
    });
  }
  return data;
}
