import { Conflict, Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { AuthorType } from '../../shared/types/enums';
import { slugify } from '../../shared/utils/slugify';
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

  private async ensureSlugIsFree(slug: string, exceptId?: string): Promise<void> {
    const existing = await authorsRepository.findBySlug(slug);

    if (existing && existing.id !== exceptId) {
      throw new Conflict(`An author with the slug "${slug}" already exists.`);
    }
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
  async create(input: CreateAuthorInput): Promise<IAuthorPublic> {
    if (input.type === AuthorType.WRITER && input.columnTitle) {
      throw new ValidationError('Only columnists can have a column title.', {
        columnTitle: 'Not applicable to a writer.',
      });
    }

    const slug = this.buildSlug(input.slug ?? input.name);
    await this.ensureSlugIsFree(slug);

    return authorsRepository.create({
      name: input.name,
      slug,
      type: input.type,
      bio: input.bio ?? null,
      photoUrl: input.photoUrl ?? null,
      columnTitle: input.columnTitle ?? null,
    });
  }

  async update(id: string, input: UpdateAuthorInput): Promise<IAuthorPublic> {
    const author = await this.ensureExists(id);

    if (author.type === AuthorType.WRITER && input.columnTitle) {
      throw new ValidationError('Only columnists can have a column title.', {
        columnTitle: 'Not applicable to a writer.',
      });
    }

    // The slug only moves when explicitly asked for. Renaming an author must
    // not silently 404 every link to their page.
    let slug: string | undefined;

    if (input.slug !== undefined) {
      slug = this.buildSlug(input.slug);
      await this.ensureSlugIsFree(slug, id);
    }

    return authorsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.columnTitle !== undefined ? { columnTitle: input.columnTitle } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
  }

  // A columnist editing their own byline, bio, photo and column title.
  async updateMyProfile(authorId: string | null, input: UpdateMyProfileInput): Promise<IAuthorPublic> {
    if (!authorId) {
      throw new Forbidden('Your account has no author profile.');
    }

    return authorsRepository.update(authorId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
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
