export type CreateCategoryInput = {
    name: string;
    slug?: string;
    sortOrder?: number;
};
export type UpdateCategoryInput = {
    name?: string;
    slug?: string;
    sortOrder?: number;
    active?: boolean;
};