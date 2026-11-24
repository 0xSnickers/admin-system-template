import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedRangeQueryDto, RangeQueryDto } from '../../common/monitor/range';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LogQueryDto extends PagedRangeQueryDto {
  @IsOptional() @IsString() @MaxLength(50) service?: string;
  @IsOptional() @IsIn(LOG_LEVELS) level?: LogLevel;
  @IsOptional() @IsIn(STATUS_CLASSES) statusClass?: (typeof STATUS_CLASSES)[number];
  @IsOptional() @IsString() @MaxLength(64) requestId?: string;
  @IsOptional() @IsString() @MaxLength(64) ip?: string;
  /** 在 message / path 中模糊搜索。 */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}

export class LogStatsQueryDto extends RangeQueryDto {
  @IsOptional() @IsString() @MaxLength(50) service?: string;
}
