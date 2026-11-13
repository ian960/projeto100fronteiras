import type { Paginated, PaginationParams } from '../../shared/types/pagination';
import type { AuthorType } from '../../shared/types/enums';
import type { IUserCredentials, IUserMe, IUserPublic, IUserWithAuthor } from './users.types';
import type {
  CreateUserData,
  FindUsersFilters,
  UpdateProfileData,
  UpdateUserData,
} from './users.repository.types';

export type PromoteToColumnistData = {
  userId: string;
  name: string;
  slug: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
  type: AuthorType;
};

export interface IUsersRepository {
  findMany(filters: FindUsersFilters, pagination: PaginationParams): Promise<Paginated<IUserWithAuthor>>;
  findById(id: string): Promise<IUserPublic | null>;
  findByIdWithAuthor(id: string): Promise<IUserWithAuthor | null>;
  findMe(id: string): Promise<IUserMe | null>;
  updateProfile(id: string, data: UpdateProfileData): Promise<IUserMe>;
  findByEmail(email: string): Promise<IUserPublic | null>;
  findByIdWithCredentials(id: string): Promise<IUserCredentials | null>;
  create(data: CreateUserData): Promise<IUserPublic>;
  update(id: string, data: UpdateUserData): Promise<IUserPublic>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  promoteToColumnist(data: PromoteToColumnistData): Promise<IUserWithAuthor>;
}
