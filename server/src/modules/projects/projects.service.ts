import { Injectable } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/http/app.exception';
import { PageQueryDto, pageResult } from '../../common/page';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { ProjectsRepository } from './projects.repository';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 1_000;

export const generateAppKey = () => `pk_${randomBytes(16).toString('hex')}`;

@Injectable()
export class ProjectsService {
  /**
   * appKey -> 项目。上报接口每次都要校验 appKey，缓存避免每个请求都查库。
   * 只缓存命中结果（不缓存「不存在」，否则随机 appKey 会撑爆缓存，新建项目也会被旧的否定结果挡住）。
   */
  private readonly cache = new Map<string, { project: Project; expires: number }>();

  constructor(private readonly repo: ProjectsRepository) {}

  async list(query: PageQueryDto) {
    const [items, total] = await this.repo.findPage((query.page - 1) * query.limit, query.limit);
    return pageResult(items, total, query);
  }

  async get(id: string) {
    const project = await this.repo.findById(id);
    if (!project) throw AppException.notFound('PROJECT_NOT_FOUND', 'Project not found');
    return project;
  }

  create(dto: CreateProjectDto, appKey = generateAppKey()) {
    return this.repo.create({ name: dto.name, description: dto.description ?? '', appKey });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.get(id);
    return this.repo.update(id, dto);
  }

  async rotateKey(id: string) {
    const project = await this.get(id);
    this.cache.delete(project.appKey);
    return this.repo.update(id, { appKey: generateAppKey() });
  }

  async remove(id: string) {
    const project = await this.get(id);
    this.cache.delete(project.appKey);
    await this.repo.delete(id);
    return { id };
  }

  /** 上报鉴权：appKey 不存在时抛 INVALID_APP_KEY。 */
  async resolveAppKey(appKey: string | undefined): Promise<Project> {
    if (!appKey) throw new AppException('INVALID_APP_KEY', 'Invalid app key', 401);
    const hit = this.cache.get(appKey);
    if (hit && hit.expires > Date.now()) return hit.project;

    const project = await this.repo.findByAppKey(appKey);
    if (!project) throw new AppException('INVALID_APP_KEY', 'Invalid app key', 401);
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(appKey, { project, expires: Date.now() + CACHE_TTL_MS });
    return project;
  }
}
