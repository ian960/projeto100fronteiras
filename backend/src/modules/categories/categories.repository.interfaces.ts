import { ICategory, ICategoryPublic, ICategoryWithPostCount } from './categories.types';
import { CreateCategoryData, UpdateCategoryData } from './categories.repository.types';

export interface ICategoryRepository {
  findAll(): Promise<ICategoryPublic[]>;
  findAllActive(): Promise<ICategoryPublic[]>;
  findAllWithPostCount(): Promise<ICategoryWithPostCount[]>;
  findById(id: string): Promise<ICategoryPublic | null>;
  findBySlug(slug: string): Promise<ICategory | null>;
  create(data: CreateCategoryData): Promise<ICategoryPublic>;
  update(id: string, data: UpdateCategoryData): Promise<ICategoryPublic>;
  delete(id: string): Promise<void>;
}