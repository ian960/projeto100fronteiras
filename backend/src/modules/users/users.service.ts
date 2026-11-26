import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { AuthorType, MediaKind, Role } from '../../shared/types/enums';
import { slugify } from '../../shared/utils/slugify';
import type { Paginated } from '../../shared/types/pagination';
import { authRepository } from '../auth/auth.repository';
import type { SessionUser } from '../auth/auth.types';
import { authorsRepository } from '../authors/authors.repository';
import { mediaService } from '../media/media.service';
import { isDeletedAccount } from './users.deleted';
import { usersRepository } from './users.repository';
import type { IUserMe, IUserPublic, IUserWithAuthor } from './users.types';
import { newsletterRepository } from '../newsletter/newsletter.repository';
import type {
  ListUsersInput,
  PromoteUserInput,
  UpdateMeInput,
  UpdateUserInput,
} from './users.service.types';

export class UsersService {
  private async ensureExists(id: string): Promise<IUserPublic> {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  // A deleted (anonymized) account is gone for good: nobody can promote,
  // reactivate or give it a password. The only thing left is removing the row.
  private ensureNotDeleted(user: { email: string }): void {
    if (isDeletedAccount(user)) {
      throw new Conflict('This account was deleted.');
    }
  }

  async getMe(id: string): Promise<IUserMe> {
    const user = await usersRepository.findMe(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  // "Minha conta": anyone logged in edits their own name, bio and photo.
  // The photo must be an image this same person uploaded.
  async updateMe(actor: SessionUser, input: UpdateMeInput): Promise<IUserMe> {
    if (input.avatarId) {
      await mediaService.requireUsable(actor, input.avatarId, MediaKind.IMAGE, 'avatarId');
    }

    return usersRepository.updateProfile(actor.id, input);
  }

  list(input: ListUsersInput): Promise<Paginated<IUserWithAuthor>> {
    return usersRepository.findMany(
      {
        ...(input.role ? { role: input.role } : {}),
        ...(input.search ? { search: input.search } : {}),
        deleted: input.deleted ?? false,
      },
      { page: input.page, limit: input.limit },
    );
  }

  async getById(id: string): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);
    if (!user) throw new NotFound('User not found.');
    return user;
  }

  // Turning a reader into a columnist. Creates the byline and flips the role
  // in a single transaction — see the repository for why that matters. On a
  // login that already writes as someone, the new byline joins the others.
  async promoteToColumnist(
    actor: SessionUser,
    id: string,
    input: PromoteUserInput,
  ): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);

    if (!user) throw new NotFound('User not found.');
    this.ensureNotDeleted(user);

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

  // The admin decides which bylines a login writes under: authors that
  // already exist (a writer who signed news included), usually one, more when
  // a columnist also publishes for someone else. An empty list: none.
  // Only the admin ever changes this list; the columnist only picks, post by
  // post, which of these bylines signs it.
  async setAuthors(id: string, authorIds: string[]): Promise<IUserWithAuthor> {
    const user = await usersRepository.findByIdWithAuthor(id);

    if (!user) throw new NotFound('User not found.');
    this.ensureNotDeleted(user);

    if (user.role === Role.ADMIN) {
      throw new Conflict('The admin does not need an author profile to publish news.');
    }

    const current = user.authors.map((a) => a.id);
    const unchanged = current.length === authorIds.length && authorIds.every((a) => current.includes(a));
    if (unchanged) return user;

    if (authorIds.length === 0) {
      const updated = await usersRepository.setAuthors(id, []);
      // Back to reader: the panel session goes now, not at the next login.
      await authRepository.deleteSessionsOfUser(id);
      return updated;
    }

    for (const authorId of authorIds) {
      // Already this login's: keeps it as it is, even if deactivated since.
      if (current.includes(authorId)) continue;

      const author = await authorsRepository.findById(authorId);
      if (!author) throw new NotFound('Author not found.');

      if (!author.active) {
        throw new Conflict(`The author "${author.name}" is deactivated. Reactivate it first.`);
      }

      if (author.userId && author.userId !== id) {
        throw new Conflict(`The author "${author.name}" is already linked to another account.`);
      }
    }

    return usersRepository.setAuthors(id, authorIds);
  }

  async update(actorId: string, id: string, input: UpdateUserInput): Promise<IUserPublic> {
    const target = await this.ensureExists(id);
    this.ensureNotDeleted(target);

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

  // Deleting an account, by its owner (DELETE /auth/me) or by the admin
  // (DELETE /admin/users/:id).
  //
  // A reader has nothing that points at them, so they are really deleted,
  // photo included. Someone who wrote or published posts cannot be: the posts
  // need their creator. Their personal data is wiped instead and the row stays
  // as "Conta excluída", unable to log in. Either way the person is gone.
  async deleteAccount(id: string): Promise<{ mode: 'deleted' | 'anonymized' }> {
    const target = await this.ensureExists(id);

    // Without an active admin nobody can run the portal or promote a new one.
    if (target.role === Role.ADMIN && target.active && (await usersRepository.countActiveAdmins()) <= 1) {
      throw new Conflict('The portal needs at least one active admin. Make someone else admin first.');
    }

    // The photo is the account's own; let go of it so it can be removed below.
    await usersRepository.updateProfile(id, { avatarId: null });
    const filesKept = await mediaService.removeUnusedOf(id);
    const posts = await usersRepository.countPostsOf(id);

    // Sessions are not tied to the row by a foreign key: wipe them by hand.
    await authRepository.deleteSessionsOfUser(id);

    // The newsletter is tied to the address, not to the row: it goes too.
    await newsletterRepository.deleteByEmail(target.email);

    if (posts === 0 && filesKept === 0) {
      await usersRepository.delete(id);
      return { mode: 'deleted' };
    }

    // Already anonymized and still holding posts or files: nothing more to do.
    // Say so instead of pretending, so the admin knows why the row stays.
    if (isDeletedAccount(target)) {
      throw new Conflict('This deleted account still has posts or files, so it has to stay.');
    }

    // A hash of random bytes nobody knows: login is impossible.
    await usersRepository.anonymize(id, await argon2.hash(randomBytes(32).toString('hex')));
    return { mode: 'anonymized' };
  }

  // The admin removes someone else's account. Their own goes through Minha conta.
  async deleteByAdmin(actorId: string, id: string): Promise<{ mode: 'deleted' | 'anonymized' }> {
    if (actorId === id) {
      throw new Forbidden('Delete your own account from Minha conta.');
    }
    return this.deleteAccount(id);
  }

  // The admin's reset, for someone who cannot receive e-mail. Everyone else
  // uses "Esqueci minha senha" (AuthService.forgotPassword).
  async resetPassword(id: string, newPassword: string): Promise<void> {
    this.ensureNotDeleted(await this.ensureExists(id));

    await usersRepository.updatePasswordHash(id, await argon2.hash(newPassword));

    // The whole point of storing sessions in Postgres: the account is logged
    // out everywhere the moment its password changes.
    await authRepository.deleteSessionsOfUser(id);
  }
}

export const usersService = new UsersService();
