import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { ICategoryRepository } from './categories.repository.interfaces';
import { CreateCategoryData, UpdateCategoryData } from './categories.repository.types';
import { ICategory, ICategoryPublic, ICategoryWithPostCount } from './categories.types';

export class CategoriesRepository implements ICategoryRepository {
  private readonly publicSelect = {
    id: true,
    name: true,
    slug: true,
    sortOrder: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  // sortOrder é o que o admin controla; name desempata
  private readonly menuOrder = [
    { sortOrder: 'asc' },
    { name: 'asc' },
  ] as const;

  async findAll(): Promise<ICategoryPublic[]> {
    try {
      return await prisma.category.findMany({
        select: this.publicSelect,
        orderBy: [...this.menuOrder],
      });
    } catch (err) {
      logger.error('Erro ao buscar categorias', err);
      throw err;
    }
  }

  async findAllActive(): Promise<ICategoryPublic[]> {
    try {
      return await prisma.category.findMany({
        where: { active: true },
        select: this.publicSelect,
        orderBy: [...this.menuOrder],
      });
    } catch (err) {
      logger.error('Erro ao buscar categorias ativas', err);
      throw err;
    }
  }

  async findAllWithPostCount(): Promise<ICategoryWithPostCount[]> {
    try {
      return await prisma.category.findMany({
        select: {
          ...this.publicSelect,
          _count: { select: { posts: true } },
        },
        orderBy: [...this.menuOrder],
      });
    } catch (err) {
      logger.error('Erro ao buscar categorias com contagem', err);
      throw err;
    }
  }

  async findById(id: string): Promise<ICategoryPublic | null> {
    try {
      return await prisma.category.findUnique({
        where: { id },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao buscar categoria por id', err);
      throw err;
    }
  }

  async findBySlug(slug: string): Promise<ICategory | null> {
    try {
      return await prisma.category.findUnique({
        where: { slug },
      });
    } catch (err) {
      logger.error('Erro ao buscar categoria por slug', err);
      throw err;
    }
  }

  async create(data: CreateCategoryData): Promise<ICategoryPublic> {
    try {
      return await prisma.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao criar categoria', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateCategoryData): Promise<ICategoryPublic> {
    try {
      return await prisma.category.update({
        where: { id },
        data,
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao atualizar categoria', err);
      throw err;
    }
  }

  async countPosts(categoryId: string): Promise<number> {
    try {
      return await prisma.post.count({where: { categoryId}});
    } catch(err) {
      logger.error('Erro ao contar posts da categoria', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.category.delete({ where: { id } });
    } catch (err) {
      logger.error('Erro ao remover categoria', err);
      throw err;
    }
  }
}

export const categoriesRepository = new CategoriesRepository();