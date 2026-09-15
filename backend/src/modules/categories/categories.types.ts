import { Post } from "../posts/posts.types"

export interface ICategory {
    
    id: string, 
    name: string,       
    slug: string,      
    sortOrder: number, 
    active: boolean,    
    createdAt: Date, 
    updatedAt: Date 

}


export type ICategoryPublic = ICategory


export type ICategoryWithPostCount = ICategory & {
  _count?: { posts: number };
};

export type ICategoryWithPosts = ICategory & {
    posts?: Post[]
}