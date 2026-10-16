import argon2 from 'argon2';
import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { AuthorType, MediaKind, Role } from '../../shared/types/enums';
import { slugify } from '../../shared/utils/slugify';
import type { Paginated } from '../../shared/types/pagination';
import { authRepository } from '../auth/auth.repository';
import type { SessionUser } from '../auth/auth.types';
import { authorsRepository } from '../authors/authors.repository';
import { mediaService } from '../media/media.service';
import { usersRepository } from './users.repository';
import type { IUserPublic, IUserWithAuthor } from './users.types';
import type { ListUsersInput, PromoteUserInput, UpdateUserInput } from './users.service.types';

export class UsersService {
  private async ensureExists(id: string): Promise<IUserPublic> {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  async getMe(id: string): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  list(input: ListUsersInput): Promise<Paginated<IUserWithAuthor>> {
    return usersRepository.findMany(
      { ...(input.role ? { role: input.role } : {}), ...(input.search ? { search: input.search } : {}) },
      { page: input.page, limit: input.limit },
    );
  }

  async getById(id: string): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  // Turning a reader into a columnist. Creates the byline and flips the role
  // in a single transaction — see the repository for why that matters.
  async promoteToColumnist(
    actor: SessionUser,
    id: string,
    input: PromoteUserInput,
  ): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);

    if (!user) throw new NotFound('User not found.');

    if (user.author) {
      throw new Conflict('This user already has an author profile.');
    }

    if (user.role === Role.ADMIN) {
      throw new Conflict('The admin does not need an author profile to publish news.');
    }

    const slug = slugify(input.slug ?? input.name);

    if (!slug) {
      throw new ValidationError('Could not build a slug from this name.', {
        name: 'Use at least one letter or number.',
      });
    }

    const slugTaken = await authorsRepository.findBySlug(slug);

    if (slugTaken) {
      throw new Conflict(`An author with the slug "${slug}" already exists.`);
    }

    if (input.photoId) {
      await mediaService.requireUsable(actor, input.photoId, MediaKind.IMAGE, 'photoId');
    }

    return usersRepository.promoteToColumnist({
      userId: id,
      name: input.name,
      slug,
      bio: input.bio ?? null,
      photoId: input.photoId ?? null,
      columnTitle: input.columnTitle ?? null,
      type: AuthorType.COLUMNIST,
    });
  }

  async update(actorId: string, id: string, input: UpdateUserInput): Promise<IUserPublic> {
    const target = await this.ensureExists(id);

    // An admin locking themselves out is unrecoverable without psql access.
    if (actorId === id) {
      if (input.active === false) {
        throw new Forbidden('You cannot deactivate your own account.');
      }
      if (input.role && input.role !== Role.ADMIN) {
        throw new Forbidden('You cannot remove your own admin role.');
      }
    }

    // Demoting a columnist keeps the byline and the published columns online.
    // They only lose panel access. Taking the texts down is an editorial
    // decision, made separately by deactivating the author.
    const updated = await usersRepository.update(id, input);

    const lostAccess =
      input.active === false || (input.role !== undefined && input.role !== target.role);

    if (lostAccess) {
      await authRepository.deleteSessionsOfUser(id);
    }

    return updated;
  }

  // There is no email-based reset flow: readers who forget a password matter
  // little today, and a columnist has the admin. Adding SMTP would mean a
  // provider, domain verification and templates, none of which is in scope.
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.ensureExists(id);

    await usersRepository.updatePasswordHash(id, await argon2.hash(newPassword));

    // The whole point of storing sessions in Postgres: the account is logged
    // out everywhere the moment its password changes.
    await authRepository.deleteSessionsOfUser(id);
  }
}

export const usersService = new UsersService();
