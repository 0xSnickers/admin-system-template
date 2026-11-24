import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedRangeQueryDto } from '../../common/monitor/range';

export const ERROR_TYPES = ['js', 'promise', 'resource', 'api', 'custom'] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];
export const ISSUE_STATUSES = ['open', 'resolved', 'ignored'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export class IssueQueryDto extends PagedRangeQueryDto {
  @IsOptional() @IsIn(ISSUE_STATUSES) status?: IssueStatus;
  @IsOptional() @IsIn(ERROR_TYPES) type?: ErrorType;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
  @IsOptional() @IsIn(['frequent', 'recent']) sort: 'frequent' | 'recent' = 'frequent';
}

export class UpdateIssueDto {
  @IsIn(ISSUE_STATUSES) status: IssueStatus;
}
