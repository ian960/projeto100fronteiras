import { Conflict, NotFound, ValidationError } from '../../shared/errors/AppError';
import { isSlugOf, slugify } from '../../shared/utils/slugify';
import { categoriesRepository } from './categories.repository';
import type { ICategoryPublic, ICategoryWithPostCount } from './categories.types';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.service.types';

export class CategoriesService {
  private async ensureExists(id: string): Promise<ICategoryPublic> {
    const category = await categoriesRepository.findById(id);
    if (!category) throw new NotFound('Category not found.');
    return category;
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

  // Public site menu: active only.
  listActive(): Promise<ICategoryPublic[]> {
    return categoriesRepository.findAllActive();
  }

  // Admin panel: everything, with post counts.
  listAll(): Promise<ICategoryWithPostCount[]> {
    return categoriesRepository.findAllWithPostCount();
  }

  getById(id: string): Promise<ICategoryPublic> {
    return this.ensureExists(id);
  }

  async getBySlug(slug: string): Promise<ICategoryPublic> {
    const category = await categoriesRepository.findBySlug(slug);

    if (!category || !category.active) {
      throw new NotFound('Category not found.');
    }

    return category;
  }

  async create(input: CreateCategoryInput): Promise<ICategoryPublic> {
    const slug = this.buildSlug(input.slug ?? input.name);

    const existing = await categoriesRepository.findBySlug(slug);

    if (existing) {
      throw new Conflict(`A category with the slug "${slug}" already exists.`);
    }

    return categoriesRepository.create({
      name: input.name,
      slug,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
  }

  async update(id: string, input: UpdateCategoryInput): Promise<ICategoryPublic> {
    const category = await this.ensureExists(id);

    let slug: string | undefined;

    if (input.slug !== undefined) {
      slug = this.buildSlug(input.slug);

      const existing = await categoriesRepository.findBySlug(slug);

      if (existing && existing.id !== id) {
        throw new Conflict(`A category with the slug "${slug}" already exists.`);
      }
    } else if (input.name !== undefined && isSlugOf(category.slug, category.name)) {
      // Nobody typed this address: it was made from the name, so it follows
      // the name. Links to the old address stop working, which the panel
      // says before saving. If the new address is taken, the rename still
      // goes through and the old address stays.
      const candidate = slugify(input.name);

      if (candidate && candidate !== category.slug && !(await categoriesRepository.findBySlug(candidate))) {
        slug = candidate;
      }
    }

    return categoriesRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);

    // The FK is Restrict and would refuse anyway, but the raw message is
    // "this record is referenced by others". Counting first lets the admin
    // read "this category has 23 posts" and know what to do.
    const postCount = await categoriesRepository.countPosts(id);

    if (postCount > 0) {
      throw new Conflict(
        `This category has ${postCount} post(s) and cannot be deleted. Deactivate it instead.`,
      );
    }

    await categoriesRepository.delete(id);
  }
}

export const categoriesService = new CategoriesService();
