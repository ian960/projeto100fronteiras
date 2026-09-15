import { promises } from "node:dns";
import { ICategoryPublic, ICategoryWithPostCount } from "./categories.types";
import { categoriesRepository } from "./categories.repository";
import { Conflict, NotFound, ValidationError } from "@/shared/errors/AppError";
import { slugify } from "zod/v4/core/util.cjs";
import { CreateCategoryInput, UpdateCategoryInput } from "./categories.service.types";
import { sl } from "zod/v4/locales";

export class CategoriesService {
    private async ensureExists(id: string): Promise<ICategoryPublic> {
        const category = await categoriesRepository.findById(id);
        if (!category) throw new NotFound('Category not found.');
        return category;
    }

private buildSlug(source: string): string {
    const slug = slugify(source);

    if(!slug) {
        throw new ValidationError('Could not build a slug from this name.', {
            name: 'Use at least one letter or number',
        });
    }
return slug
}

listActive(): Promise<ICategoryPublic[]> {
    return categoriesRepository.findAllActive();
}

listAll(): Promise<ICategoryWithPostCount[]> {
    return categoriesRepository.findAllWithPostCount();
}

getById(id: string): Promise<ICategoryPublic>{
    return this.ensureExists(id);
} 

async getBySlug(slug: string): Promise<ICategoryPublic>{
    const category = await categoriesRepository.findBySlug(slug);
    if(!category || !category.active) {
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
        ...(input.sortOrder !== undefined ? {sortOrder: input.sortOrder } : {}),
    });
}

async update(id: string, input: UpdateCategoryInput): Promise<ICategoryPublic>{
    await this.ensureExists(id);

    let slug: string | undefined;
    if(input.slug !== undefined){
        slug = this.buildSlug(input.slug);

        const existing = await categoriesRepository.findBySlug(slug);

        if(existing && existing.id !== id) {
            throw new Conflict (`A category with the slug "${slug}" already exists. `);
        }
    }

    return categoriesRepository.update(id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
    });




}

    async removeEventListener(id: string): Promise<void> {
        await this.ensureExists(id);
        
        const postCount = await categoriesRepository.countPosts(id);

        if (postCount > 0) {
            throw new Conflict(
                `This category has ${postCount} post(s) and cannot be deleted. Deactivate it instead.`,
            );
        }

        await categoriesRepository.delete(id)
    }

}
export const categoriesService = new CategoriesService();