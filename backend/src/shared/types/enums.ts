export const Role = {
  ADMIN: 'admin',
  COLUMNIST: 'columnist',
  READER: 'reader',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AuthorType = {
  WRITER: 'writer',
  COLUMNIST: 'columnist',
} as const;
export type AuthorType = (typeof AuthorType)[keyof typeof AuthorType];

export const PostType = {
  NEWS: 'news',
  COLUMN: 'column',
} as const;
export type PostType = (typeof PostType)[keyof typeof PostType];

export const PostStatus = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
} as const;
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export const MediaKind = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
} as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

// Places on the site where an advertiser's banner can go (schema.prisma).
export const BannerSlot = {
  HOME_TOP: 'home_top',
  HOME_MIDDLE: 'home_middle',
  ARTICLE_MIDDLE: 'article_middle',
  ARTICLE_END: 'article_end',
  SITE_FOOTER: 'site_footer',
} as const;
export type BannerSlot = (typeof BannerSlot)[keyof typeof BannerSlot];
