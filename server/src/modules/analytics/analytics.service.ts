import { Injectable } from '@nestjs/common';
import { RangeQueryDto, resolveRange } from '../../common/monitor/range';
import { AnalyticsRepository, type Totals } from './analytics.repository';

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  /** 核心指标 + 上一个等长周期的值（前端计算环比）。 */
  async overview(query: RangeQueryDto) {
    const range = resolveRange(query);
    const [current, previous] = await Promise.all([
      this.repo.totals(range.projectId, range.from, range.to),
      this.repo.totals(range.projectId, range.previous.from, range.previous.to),
    ]);
    const result: { current: Totals; previous: Totals } = { current, previous };
    return { range: { from: range.from, to: range.to, bucket: range.bucket }, ...result };
  }

  trend(query: RangeQueryDto) {
    return this.repo.trend(resolveRange(query));
  }

  pages(query: RangeQueryDto) {
    return this.repo.topPages(resolveRange(query), 20);
  }

  /** 来源 + 设备分布，访问分析页一次取回。 */
  async audience(query: RangeQueryDto) {
    const range = resolveRange(query);
    const [referrers, browsers, systems, devices] = await Promise.all([
      this.repo.referrers(range),
      this.repo.dimension(range, 'browser'),
      this.repo.dimension(range, 'os'),
      this.repo.dimension(range, 'device'),
    ]);
    return { referrers, browsers, systems, devices };
  }
}
