import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { AuthorType, MediaKind } from '../../shared/types/enums';
import { isSlugOf, slugify } from '../../shared/utils/slugify';
import type { SessionUser } from '../auth/auth.types';
import { mediaService } from '../media/media.service';
import { authorsRepository } from './authors.repository';
import type { IAuthorPublic, IAuthorWithPostCount } from './authors.types';
import type { CreateAuthorInput, UpdateAuthorInput, UpdateMyProfileInput } from './authors.service.types';

export class AuthorsService {
  private async ensureExists(id: string): Promise<IAuthorPublic> {
    const author = await authorsRepository.findById(id);
    if (!author) throw new NotFound('Author not found.');
    return author;
  }

  private buildSlug(source: string): string {
    const slug = slugify(source);

    if (!slug) {
      throw new ValidationError('Could not build a slug from this name.', {
        name: 'Use at least one letter or number.',
      });
    }

    return slug;
  }

  // A renamed author whose address was made from the old name gets one made
  // from the new name, unless someone else already has it. Returns undefined
  // when the address stays as it is.
  private async followName(author: IAuthorPublic, newName: string | undefined): Promise<string | undefined> {
    if (newName === undefined || !isSlugOf(author.slug, author.name)) return undefined;

    const candidate = slugify(newName);
    if (!candidate || candidate === author.slug) return undefined;

    const taken = await authorsRepository.findBySlug(candidate);
    return taken ? undefined : candidate;
  }

  private async ensureSlugIsFree(slug: string, exceptId?: string): Promise<void> {
    const existing = await authorsRepository.findBySlug(slug);

    if (existing && existing.id !== exceptId) {
      throw new Conflict(`An author with the slug "${slug}" already exists.`);
    }
  }

  // A new photo must be an image this person may use. Checked only when it
  // changes, so saving a profile never fails over the photo already set.
  private async assertPhoto(
    actor: SessionUser,
    photoId: string | null | undefined,
    current: string | null = null,
  ): Promise<void> {
    if (!photoId || photoId === current) return;
    await mediaService.requireUsable(actor, photoId, MediaKind.IMAGE, 'photoId');
  }

  // Public: the columnists tab.
  listColumnists(): Promise<IAuthorPublic[]> {
    return authorsRepository.findMany({ type: AuthorType.COLUMNIST, active: true });
  }

  // Admin: everyone, with counts.
  listAll(): Promise<IAuthorWithPostCount[]> {
    return authorsRepository.findManyWithPostCount({});
  }

  getById(id: string): Promise<IAuthorPublic> {
    return this.ensureExists(id);
  }

  async getBySlug(slug: string): Promise<IAuthorPublic> {
    const author = await authorsRepository.findBySlug(slug);

    if (!author || !author.active) {
      throw new NotFound('Author not found.');
    }

    return author;
  }

  // Creates a byline with no login. A columnist is never created this way —
  // they register themselves and the admin promotes them, which is what keeps
  // passwords out of the admin's hands.
  async create(actor: SessionUser, input: CreateAuthorInput): Promise<IAuthorPublic> {
    if (input.type === AuthorType.WRITER && input.columnTitle) {
      throw new ValidationError('Only columnists can have a column title.', {
        columnTitle: 'Not applicable to a writer.',
      });
    }

    const slug = this.buildSlug(input.slug ?? input.name);
    await this.ensureSlugIsFree(slug);
    await this.assertPhoto(actor, input.photoId);

    return authorsRepository.create({
      name: input.name,
      slug,
      type: input.type,
      bio: input.bio ?? null,
      photoId: input.photoId ?? null,
      columnTitle: input.columnTitle ?? null,
    });
  }

  async update(actor: SessionUser, id: string, input: UpdateAuthorInput): Promise<IAuthorPublic> {
    const author = await this.ensureExists(id);
    await this.assertPhoto(actor, input.photoId, author.photoId);

    if (author.type === AuthorType.WRITER && input.columnTitle) {
      throw new ValidationError('Only columnists can have a column title.', {
        columnTitle: 'Not applicable to a writer.',
      });
    }

    // A typed address wins. Otherwise an address made from the name follows
    // the name (see followName).
    let slug: string | undefined;

    if (input.slug !== undefined) {
      slug = this.buildSlug(input.slug);
      await this.ensureSlugIsFree(slug, id);
    } else {
      slug = await this.followName(author, input.name);
    }

    return authorsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.photoId !== undefined ? { photoId: input.photoId } : {}),
      ...(input.columnTitle !== undefined ? { columnTitle: input.columnTitle } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
  }

  // A columnist editing their own byline, bio, photo and column title.
  async updateMyProfile(actor: SessionUser, input: UpdateMyProfileInput): Promise<IAuthorPublic> {
    if (!actor.authorId) {
      throw new Forbidden('Your account has no author profile.');
    }

    const author = await this.ensureExists(actor.authorId);
    await this.assertPhoto(actor, input.photoId, author.photoId);
    const slug = await this.followName(author, input.name);

    return authorsRepository.update(actor.authorId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.photoId !== undefined ? { photoId: input.photoId } : {}),
      ...(input.columnTitle !== undefined ? { columnTitle: input.columnTitle } : {}),
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);

    // The FK is Restrict, so the database already refuses. Counting first
    // turns "this record is referenced by others" into something the admin
    // can act on.
    const postCount = await authorsRepository.countPosts(id);

    if (postCount > 0) {
      throw new Conflict(
        `This author signs ${postCount} post(s) and cannot be deleted. Deactivate them instead.`,
      );
    }

    await authorsRepository.delete(id);
  }
}

export const authorsService = new AuthorsService();
