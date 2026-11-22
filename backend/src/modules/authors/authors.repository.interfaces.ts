import type { IAuthorPublic, IAuthorWithPostCount, IColumnistCard } from './authors.types';
import type {
  CreateAuthorData,
  DeleteAuthorOptions,
  FindAuthorsFilters,
  UpdateAuthorData,
} from './authors.repository.types';

export interface IAuthorsRepository {
  findMany(filters: FindAuthorsFilters): Promise<IAuthorPublic[]>;
  findManyWithPostCount(filters: FindAuthorsFilters): Promise<IAuthorWithPostCount[]>;
  findColumnistCards(): Promise<IColumnistCard[]>;
  findById(id: string): Promise<IAuthorPublic | null>;
  findBySlug(slug: string): Promise<IAuthorPublic | null>;
  findByUserId(userId: string): Promise<IAuthorPublic | null>;
  create(data: CreateAuthorData): Promise<IAuthorPublic>;
  update(id: string, data: UpdateAuthorData): Promise<IAuthorPublic>;
  delete(id: string): Promise<void>;
  deleteWithPosts(id: string, options: DeleteAuthorOptions): Promise<void>;
  countPosts(authorId: string): Promise<number>;
  reorder(ids: string[]): Promise<void>;
  countByIds(ids: string[]): Promise<number>;
}
