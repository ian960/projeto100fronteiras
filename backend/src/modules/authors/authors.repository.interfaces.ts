import type { IAuthorPublic, IAuthorWithPostCount } from './authors.types';
import type { CreateAuthorData, FindAuthorsFilters, UpdateAuthorData } from './authors.repository.types';

export interface IAuthorsRepository {
  findMany(filters: FindAuthorsFilters): Promise<IAuthorPublic[]>;
  findManyWithPostCount(filters: FindAuthorsFilters): Promise<IAuthorWithPostCount[]>;
  findById(id: string): Promise<IAuthorPublic | null>;
  findBySlug(slug: string): Promise<IAuthorPublic | null>;
  findByUserId(userId: string): Promise<IAuthorPublic | null>;
  create(data: CreateAuthorData): Promise<IAuthorPublic>;
  update(id: string, data: UpdateAuthorData): Promise<IAuthorPublic>;
  delete(id: string): Promise<void>;
  countPosts(authorId: string): Promise<number>;
}
