import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProjectDto {
  @Transform(trim) @IsString() @Length(2, 50) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) description?: string;
}

export class UpdateProjectDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 50) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) description?: string;
}
