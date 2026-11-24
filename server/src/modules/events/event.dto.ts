import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedRangeQueryDto } from '../../common/monitor/range';

export const EVENT_TYPES = ['pageview', 'track', 'performance'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export class EventQueryDto extends PagedRangeQueryDto {
  @IsOptional() @IsIn(EVENT_TYPES) type?: EventType;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(64) visitorId?: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(64) ip?: string;
  @IsOptional() @IsString() @MaxLength(100) path?: string;
}
