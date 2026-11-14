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
  findFeatured(): Promise<IPostListItem[]>;
  findLatest(type: FindPublishedFilters['type'], limit: number, categoryId?: string): Promise<IPostListItem[]>;
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
  findAttachmentMediaIds(postId: string): Promise<string[]>;

  create(data: CreatePostData): Promise<IPostDetail>;
  update(id: string, data: UpdatePostData): Promise<IPostDetail>;
  delete(id: string): Promise<void>;

  // Puts `id` in the home carousel (at the front) or takes it out.
  setFeatured(id: string, featured: boolean): Promise<IPostDetail>;
}
