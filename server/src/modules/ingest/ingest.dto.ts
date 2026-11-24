import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ERROR_TYPES, type ErrorType } from '../errors/error.dto';
import { EVENT_TYPES } from '../events/event.dto';
import { LOG_LEVELS, type LogLevel } from '../logs/log.dto';

/** 超长字段截断而不是拒收：SDK 侧数据不可控，丢整批的代价比截断大。 */
const clip =
  (max: number) =>
  ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.slice(0, max) : value;

export const INGEST_EVENT_TYPES = [...EVENT_TYPES, 'error'] as const;

export class IngestErrorDto {
  @IsIn(ERROR_TYPES) type: ErrorType;
  @Transform(clip(1000)) @IsString() @Length(1, 1000) message: string;
  @IsOptional() @Transform(clip(10_000)) @IsString() stack?: string;
  @IsOptional() @Transform(clip(512)) @IsString() source?: string;
}

export class IngestEventDto {
  @IsIn(INGEST_EVENT_TYPES) type: (typeof INGEST_EVENT_TYPES)[number];
  @Transform(clip(100)) @IsString() @Length(1, 100) name: string;
  @Transform(clip(2048)) @IsString() @Length(1, 2048) url: string;
  @IsOptional() @Transform(clip(2048)) @IsString() referrer?: string;
  @IsString() @Length(1, 64) visitorId: string;
  @IsString() @Length(1, 64) sessionId: string;
  @IsOptional() @IsString() @Length(1, 64) userId?: string;
  @IsOptional() @IsString() @Length(1, 64) release?: string;
  /** 客户端时间戳（毫秒）。 */
  @IsOptional() @IsNumber() ts?: number;
  @IsOptional() @IsObject() properties?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(50) breadcrumbs?: unknown[];
  @IsOptional() @ValidateNested() @Type(() => IngestErrorDto) error?: IngestErrorDto;
}

export class IngestEventsDto {
  @IsOptional() @IsString() @Length(1, 64) appKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];
}

export class IngestLogDto {
  @IsIn(LOG_LEVELS) level: LogLevel;
  @Transform(clip(2000)) @IsString() @Length(1, 2000) message: string;
  @IsOptional() @IsNumber() ts?: number;
  @IsOptional() @IsString() @Length(1, 64) requestId?: string;
  @IsOptional() @IsString() @Length(1, 10) method?: string;
  @IsOptional() @Transform(clip(512)) @IsString() path?: string;
  @IsOptional() @IsInt() @Min(100) @Max(599) status?: number;
  @IsOptional() @IsInt() @Min(0) durationMs?: number;
  /** 发起请求的终端用户 IP（不是上报方的 IP）。 */
  @IsOptional() @IsString() @Length(1, 64) ip?: string;
  @IsOptional() @Transform(clip(512)) @IsString() userAgent?: string;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class IngestLogsDto {
  @IsOptional() @IsString() @Length(1, 64) appKey?: string;
  @IsString() @Length(1, 50) service: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => IngestLogDto)
  logs: IngestLogDto[];
}
