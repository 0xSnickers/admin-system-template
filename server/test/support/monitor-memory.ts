import { randomUUID } from 'node:crypto';
import type { ErrorEvent, ErrorIssue, Event, IpRule, Project, ServerLog } from '@prisma/client';
import type { IssueGroup } from '../../src/modules/errors/errors.repository';
import type { NewEvent } from '../../src/modules/events/events.repository';
import type { NewServerLog } from '../../src/modules/logs/logs.repository';
import type { NewProject } from '../../src/modules/projects/projects.repository';

/** 监控模块的内存仓储。聚合类 SQL（趋势、IP 汇总）只返回空结构，真实查询见 scripts/smoke.mjs。 */
export function createMonitorMemory() {
  const projects = new Map<string, Project>();
  const events: Event[] = [];
  const issues = new Map<string, ErrorIssue>();
  const errorEvents: ErrorEvent[] = [];
  const logs: ServerLog[] = [];
  const rules = new Map<string, IpRule>();
  const page = <T>(items: T[], skip: number, take: number): [T[], number] => [
    items.slice(skip, skip + take),
    items.length,
  ];

  const projectsRepo = {
    async findPage(skip: number, take: number) {
      return page([...projects.values()].reverse(), skip, take);
    },
    async findById(id: string) {
      return projects.get(id) ?? null;
    },
    async findByAppKey(appKey: string) {
      return [...projects.values()].find((p) => p.appKey === appKey) ?? null;
    },
    async create(data: NewProject) {
      const now = new Date();
      const row: Project = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
      projects.set(row.id, row);
      return row;
    },
    async update(id: string, data: Partial<NewProject>) {
      const row = { ...projects.get(id)!, ...data, updatedAt: new Date() };
      projects.set(id, row);
      return row;
    },
    async delete(id: string) {
      projects.delete(id);
    },
  };

  const eventsRepo = {
    async createMany(data: NewEvent[]) {
      for (const e of data) events.push({ id: randomUUID(), createdAt: new Date(), ...e } as Event);
    },
    async findPage(filter: { type?: string; projectId?: string }, skip: number, take: number) {
      const rows = events.filter(
        (e) =>
          (!filter.type || e.type === filter.type) &&
          (!filter.projectId || e.projectId === filter.projectId),
      );
      return page(rows.reverse(), skip, take);
    },
    async trackSummary() {
      return [];
    },
    async deleteBefore() {
      return 0;
    },
  };

  const errorsRepo = {
    async record(groups: IssueGroup[]) {
      for (const g of groups) {
        const existing = [...issues.values()].find(
          (i) => i.projectId === g.projectId && i.fingerprint === g.fingerprint,
        );
        const now = new Date();
        const issue: ErrorIssue = existing
          ? {
              ...existing,
              count: existing.count + g.events.length,
              lastSeen: g.lastSeen,
              status: existing.status === 'resolved' ? 'open' : existing.status,
            }
          : {
              id: randomUUID(),
              ...g,
              status: 'open',
              count: g.events.length,
              createdAt: now,
              updatedAt: now,
            };
        issues.set(issue.id, issue);
        for (const e of g.events)
          errorEvents.push({ id: randomUUID(), ...e, issueId: issue.id } as ErrorEvent);
      }
    },
    async findIssues(_range: unknown, filter: { status?: string }, skip: number, take: number) {
      const rows = [...issues.values()]
        .filter((i) => !filter.status || i.status === filter.status)
        .map((i) => ({ ...i, rangeCount: i.count, users: 1 }));
      return { items: rows.slice(skip, skip + take), total: rows.length };
    },
    async findIssue(id: string) {
      return issues.get(id) ?? null;
    },
    async updateStatus(id: string, status: string) {
      const row = { ...issues.get(id)!, status };
      issues.set(id, row);
      return row;
    },
    async findEvents(issueId: string, skip: number, take: number) {
      return page(
        errorEvents.filter((e) => e.issueId === issueId),
        skip,
        take,
      );
    },
    async issueStats() {
      return { trend: [], users: 0, browsers: [], systems: [] };
    },
    async deleteBefore() {
      return 0;
    },
  };

  const logsRepo = {
    async createMany(data: NewServerLog[]) {
      for (const l of data)
        logs.push({ id: randomUUID(), createdAt: new Date(), ...l } as ServerLog);
    },
    async findPage(filter: { service?: string }, skip: number, take: number) {
      return page(
        logs.filter((l) => !filter.service || l.service === filter.service).reverse(),
        skip,
        take,
      );
    },
    async services() {
      return [...new Set(logs.map((l) => l.service))].map((service) => ({ service }));
    },
    async stats() {
      return { levels: [], statuses: [], trend: [], slowest: [] };
    },
    async deleteBefore() {
      return 0;
    },
  };

  const ipsRepo = {
    async findPage() {
      return { items: [], total: 0 };
    },
    async detail() {
      return {
        summary: null,
        trend: [],
        pages: [],
        agents: [],
        visitors: [],
        errors: [],
        requests: [],
      };
    },
    async findRules() {
      return [...rules.values()];
    },
    async findRuleByIp(ip: string) {
      return [...rules.values()].find((r) => r.ip === ip) ?? null;
    },
    async findRuleById(id: string) {
      return rules.get(id) ?? null;
    },
    async createRule(ip: string, note: string) {
      const row: IpRule = { id: randomUUID(), ip, note, createdAt: new Date() };
      rules.set(row.id, row);
      return row;
    },
    async deleteRule(id: string) {
      rules.delete(id);
    },
  };

  const zero = {
    pv: 0,
    uv: 0,
    sessions: 0,
    ips: 0,
    events: 0,
    errors: 0,
    errorVisitors: 0,
    requests: 0,
    serverErrors: 0,
    avgDurationMs: 0,
    avgLoadMs: 0,
    avgFcpMs: 0,
  };
  const analyticsRepo = {
    async totals() {
      return zero;
    },
    async trend() {
      return [];
    },
    async topPages() {
      return [];
    },
    async referrers() {
      return [];
    },
    async dimension() {
      return [];
    },
  };

  return {
    repos: { projectsRepo, eventsRepo, errorsRepo, logsRepo, ipsRepo, analyticsRepo },
    store: { projects, events, issues, errorEvents, logs, rules },
  };
}
