import type { Paginated, PaginationParams } from '../../shared/types/pagination';
import type { IPost, IPostDetail, IPostListItem, IPostWithAudit } from './posts.types';
import type {
  CreatePostData,
  FindForPanelFilters,
  FindPublishedFilters,
  UpdatePostData,
} from './posts.repository.types';

export interface IPostsRepository {
  // Public
  findPublished(
    filters: FindPublishedFilters,
    pagination: PaginationParams,
  ): Promise<Paginated<IPostListItem>>;
  findPublishedBySlug(slug: string): Promise<IPostDetail | null>;
  findFeatured(): Promise<IPostListItem | null>;
  findLatest(type: FindPublishedFilters['type'], limit: number): Promise<IPostListItem[]>;
  findPublishedByIds(ids: string[]): Promise<IPostListItem[]>;

  // Panel
  findForPanel(
    filters: FindForPanelFilters,
    pagination: PaginationParams,
  ): Promise<Paginated<IPostListItem>>;
  findByIdWithAudit(id: string): Promise<IPostWithAudit | null>;

  // Plain row, used by the policy checks.
  findById(id: string): Promise<IPost | null>;
  findBySlug(slug: string): Promise<IPost | null>;

  create(data: CreatePostData): Promise<IPostDetail>;
  update(id: string, data: UpdatePostData): Promise<IPostDetail>;
  delete(id: string): Promise<void>;

  // Clears the current feature flag and sets it on `id`, in one transaction.
  setFeatured(id: string): Promise<IPostDetail>;
}
