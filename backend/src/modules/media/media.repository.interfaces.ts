import type { IMedia } from './media.types';
import type { CreateMediaData, MediaUsage } from './media.repository.types';

export interface IMediaRepository {
  findById(id: string): Promise<IMedia | null>;
  findByIds(ids: string[]): Promise<IMedia[]>;
  findByPublicId(publicId: string): Promise<IMedia | null>;
  create(data: CreateMediaData): Promise<IMedia>;
  countUsage(media: Pick<IMedia, 'id' | 'publicId'>): Promise<MediaUsage>;
  delete(id: string): Promise<void>;
}
