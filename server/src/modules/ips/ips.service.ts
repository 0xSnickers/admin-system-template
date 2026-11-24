import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/http/app.exception';
import { RangeQueryDto, resolveRange } from '../../common/monitor/range';
import { pageResult } from '../../common/page';
import type { CreateIpRuleDto, IpQueryDto } from './ip.dto';
import { IpsRepository } from './ips.repository';

const RULES_TTL_MS = 30_000;

@Injectable()
export class IpsService {
  private blocked: { ips: Set<string>; expires: number } | null = null;

  constructor(private readonly repo: IpsRepository) {}

  async list(query: IpQueryDto) {
    const { page, limit } = query;
    const { items, total } = await this.repo.findPage(
      resolveRange(query),
      query.q,
      (page - 1) * limit,
      limit,
    );
    return pageResult(items, total, { page, limit });
  }

  detail(ip: string, query: RangeQueryDto) {
    return this.repo.detail(resolveRange(query), ip);
  }

  rules() {
    return this.repo.findRules();
  }

  async block(dto: CreateIpRuleDto) {
    if (await this.repo.findRuleByIp(dto.ip)) {
      throw AppException.conflict('IP_RULE_EXISTS', 'IP is already blocked');
    }
    const rule = await this.repo.createRule(dto.ip, dto.note ?? '');
    this.blocked = null;
    return rule;
  }

  async unblock(id: string) {
    if (!(await this.repo.findRuleById(id))) {
      throw AppException.notFound('IP_RULE_NOT_FOUND', 'IP rule not found');
    }
    await this.repo.deleteRule(id);
    this.blocked = null;
    return { id };
  }

  /** 上报接口使用：黑名单缓存 30 秒。 */
  async isBlocked(ip: string) {
    if (!this.blocked || this.blocked.expires < Date.now()) {
      const rules = await this.repo.findRules();
      this.blocked = { ips: new Set(rules.map((r) => r.ip)), expires: Date.now() + RULES_TTL_MS };
    }
    return this.blocked.ips.has(ip);
  }
}
