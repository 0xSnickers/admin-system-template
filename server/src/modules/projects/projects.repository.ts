import { Injectable } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NewProject = { name: string; description: string; appKey: string };

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPage(skip: number, take: number): Promise<[Project[], number]> {
    return this.prisma.$transaction([
      this.prisma.project.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.project.count(),
    ]);
  }

  findById(id: string) {
    return this.prisma.project.findUnique({ where: { id } });
  }

  findByAppKey(appKey: string) {
    return this.prisma.project.findUnique({ where: { appKey } });
  }

  create(data: NewProject) {
    return this.prisma.project.create({ data });
  }

  update(id: string, data: Partial<NewProject>) {
    return this.prisma.project.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }
}
