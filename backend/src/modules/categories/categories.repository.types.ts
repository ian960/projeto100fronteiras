export type CreateCategoryData = {
    name: string,
    slug: string,
    sortOrder?: number,

}

export type UpdateCategoryData = {
    name?: string,
    slug?: string,
    sortOrder?: number,
    active?: boolean,
}

export type ICreateCategoryRepositoryDTO = CreateCategoryData;
export type IUpdateCategoryRepositoryDTO = UpdateCategoryData;

export type IFindCategoryRepositoryFilters = {
    active?: boolean
};
