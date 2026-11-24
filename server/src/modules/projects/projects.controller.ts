import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UuidPipe } from '../../common/http/pipes';
import { PageQueryDto } from '../../common/page';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { ProjectsService } from './projects.service';

@Controller('v1/projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidPipe) id: string) {
    return this.projects.get(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Post(':id/rotate-key')
  @Roles('admin')
  rotateKey(@Param('id', UuidPipe) id: string) {
    return this.projects.rotateKey(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', UuidPipe) id: string) {
    return this.projects.remove(id);
  }
}
