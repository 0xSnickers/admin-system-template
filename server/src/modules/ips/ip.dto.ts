import { Transform } from 'class-transformer';
import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedRangeQueryDto } from '../../common/monitor/range';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class IpQueryDto extends PagedRangeQueryDto {
  /** IP 前缀搜索，如 `192.168.` */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(64) q?: string;
}

export class CreateIpRuleDto {
  @Transform(trim) @IsIP() ip: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) note?: string;
}
