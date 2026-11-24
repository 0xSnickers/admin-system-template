import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { UuidPipe } from '../../common/http/pipes';
import { RangeQueryDto } from '../../common/monitor/range';
import { PageQueryDto } from '../../common/page';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { IssueQueryDto, UpdateIssueDto } from './error.dto';
import { ErrorsService } from './errors.service';

@Controller('v1/errors/issues')
@UseGuards(AuthGuard)
export class ErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  @Get()
  list(@Query() query: IssueQueryDto) {
    return this.errors.listIssues(query);
  }

  @Get(':id')
  get(@Param('id', UuidPipe) id: string, @Query() query: RangeQueryDto) {
    return this.errors.getIssue(id, query);
  }

  @Get(':id/events')
  events(@Param('id', UuidPipe) id: string, @Query() query: PageQueryDto) {
    return this.errors.listEvents(id, query);
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateIssueDto) {
    return this.errors.updateStatus(id, dto.status);
  }
}
