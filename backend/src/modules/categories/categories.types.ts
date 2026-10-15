export interface ICategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ICategoryPublic = ICategory;

// Embedded in a post response.
export type ICategorySummary = Pick<ICategory, 'id' | 'name' | 'slug'>;

// Admin list: "Política (23)".
export type ICategoryWithPostCount = ICategory & {
  _count?: { posts: number };
};

// There is deliberately no ICategoryWithPosts.
//
// A composed type should exist only when a repository method returns it, and
// none does: `include: { posts: true }` would load every post of the category,
// drafts included and unpaginated. The category page calls
// postsRepository.findPublished({ categorySlug, page, limit }) instead.
//
// Leaving it out also keeps the dependency one-way — posts knows about
// categories, categories knows nothing about posts, exactly like the foreign
// key in the database.
