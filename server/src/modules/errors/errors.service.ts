import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/http/app.exception';
import { RangeQueryDto, resolveRange } from '../../common/monitor/range';
import { PageQueryDto, pageResult } from '../../common/page';
import type { IssueQueryDto, IssueStatus } from './error.dto';
import { ErrorsRepository, type IssueGroup, type NewErrorEvent } from './errors.repository';
import { fingerprint } from './fingerprint';

export type ErrorOccurrence = NewErrorEvent & { type: string; source: string; createdAt: Date };

@Injectable()
export class ErrorsService {
  constructor(private readonly repo: ErrorsRepository) {}

  /** 写入一批异常：按 项目 + 指纹 分组后批量 upsert。 */
  async record(occurrences: ErrorOccurrence[]) {
    const groups = new Map<string, IssueGroup>();
    for (const { type, source, ...event } of occurrences) {
      const fp = fingerprint(type, event.message, event.stack ?? '', source);
      const key = `${event.projectId}:${fp}`;
      const group = groups.get(key) ?? {
        projectId: event.projectId,
        fingerprint: fp,
        type,
        message: event.message,
        source,
        firstSeen: event.createdAt,
        lastSeen: event.createdAt,
        events: [],
      };
      if (event.createdAt < group.firstSeen) group.firstSeen = event.createdAt;
      if (event.createdAt > group.lastSeen) group.lastSeen = event.createdAt;
      group.events.push(event);
      groups.set(key, group);
    }
    await this.repo.record([...groups.values()]);
  }

  async listIssues(query: IssueQueryDto) {
    const { page, limit } = query;
    const { items, total } = await this.repo.findIssues(
      resolveRange(query),
      query,
      (page - 1) * limit,
      limit,
    );
    return pageResult(items, total, { page, limit });
  }

  async getIssue(id: string, query: RangeQueryDto) {
    const issue = await this.findOrThrow(id);
    return { ...issue, ...(await this.repo.issueStats(id, resolveRange(query))) };
  }

  async listEvents(id: string, query: PageQueryDto) {
    await this.findOrThrow(id);
    const [items, total] = await this.repo.findEvents(
      id,
      (query.page - 1) * query.limit,
      query.limit,
    );
    return pageResult(items, total, query);
  }

  async updateStatus(id: string, status: IssueStatus) {
    await this.findOrThrow(id);
    return this.repo.updateStatus(id, status);
  }

  purgeBefore(date: Date) {
    return this.repo.deleteBefore(date);
  }

  private async findOrThrow(id: string) {
    const issue = await this.repo.findIssue(id);
    if (!issue) throw AppException.notFound('ISSUE_NOT_FOUND', 'Issue not found');
    return issue;
  }
}
