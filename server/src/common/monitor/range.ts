import { Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const RANGES = ['1h', '24h', '7d', '30d'] as const;
export type RangeKey = (typeof RANGES)[number];
export type Bucket = 'minute' | 'hour' | 'day';

const RANGE_SPEC: Record<RangeKey, { ms: number; bucket: Bucket }> = {
  '1h': { ms: 3_600_000, bucket: 'minute' },
  '24h': { ms: 86_400_000, bucket: 'hour' },
  '7d': { ms: 7 * 86_400_000, bucket: 'day' },
  '30d': { ms: 30 * 86_400_000, bucket: 'day' },
};

const isTimeZone = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** 统计类接口共用的查询参数：项目、时间范围、时区（按时区切分小时 / 天）。 */
export class RangeQueryDto {
  @IsOptional() @IsUUID() projectId?: string;

  @IsOptional() @IsIn(RANGES) range: RangeKey = '24h';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (isTimeZone(value) ? value : 'UTC'))
  tz: string = 'UTC';
}

export type ResolvedRange = {
  projectId?: string;
  from: Date;
  to: Date;
  bucket: Bucket;
  tz: string;
  /** 上一个等长周期，用于「较上期」对比。 */
  previous: { from: Date; to: Date };
};

export function resolveRange(query: RangeQueryDto, now = new Date()): ResolvedRange {
  const spec = RANGE_SPEC[query.range ?? '24h'];
  const from = new Date(now.getTime() - spec.ms);
  return {
    projectId: query.projectId,
    from,
    to: now,
    bucket: spec.bucket,
    tz: query.tz ?? 'UTC',
    previous: { from: new Date(from.getTime() - spec.ms), to: from },
  };
}

/** 统计范围 + 分页（明细列表使用）。 */
export class PagedRangeQueryDto extends RangeQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

/** SQL 片段：可选的项目过滤。 */
export const projectFilter = (projectId?: string, column = 'project_id') =>
  projectId ? Prisma.sql`AND ${Prisma.raw(column)} = ${projectId}::uuid` : Prisma.empty;

/** COUNT 返回 bigint，统一转成 number。 */
export const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

/** SQL 片段：按时区切分的时间桶序列（CTE `buckets(b)`，b 为当地时间）。 */
export const bucketSeries = (range: ResolvedRange) => Prisma.sql`
  buckets AS (
    SELECT generate_series(
      date_trunc(${range.bucket}, ${range.from}::timestamptz AT TIME ZONE ${range.tz}),
      date_trunc(${range.bucket}, ${range.to}::timestamptz AT TIME ZONE ${range.tz}),
      ${`1 ${range.bucket}`}::interval) AS b)`;

/** SQL 片段：把 created_at 归入当地时间桶。 */
export const bucketOf = (range: ResolvedRange, column = 'created_at') =>
  Prisma.sql`date_trunc(${range.bucket}, ${Prisma.raw(column)} AT TIME ZONE ${range.tz})`;

/** SQL 片段：created_at 落在范围内。 */
export const inRange = (from: Date, to: Date, column = 'created_at') =>
  Prisma.sql`${Prisma.raw(column)} >= ${from} AND ${Prisma.raw(column)} <= ${to}`;
