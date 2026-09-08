export const Role = {
    ADMIN: 'admin',
    COLUMNIST: 'columnist',
    READER: 'reader'
} as const 
export type Role = (typeof Role )[keyof typeof Role]

export const AuthorType = {
    WRITTER: 'writter',
    COLUMNIST: 'columnist'
} as const
export type AuthorType = (typeof AuthorType ) [keyof typeof AuthorType]

export const PostType = {
    NEWS: 'news',
    COLUMN: 'column'
} as const
export type PostType = (typeof PostType ) [keyof typeof PostType]

export const PostStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PUBLISHED: 'published'
} as const
export type PostStatus = (typeof PostStatus ) [ keyof typeof PostStatus]