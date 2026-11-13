import { Role } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import type { ICommentPost, ICommentRow } from './comments.types';

// Who may do what with comments. Pure functions, like posts.policy.

export function isOwner(user: SessionUser, comment: ICommentRow): boolean {
  return comment.userId !== null && comment.userId === user.id;
}

// The person whose byline signs the post moderates its comments.
export function isPostAuthor(user: SessionUser, post: ICommentPost): boolean {
  return user.authorId !== null && user.authorId === post.authorId;
}

// Only the one who wrote it changes the words.
export function canEdit(user: SessionUser, comment: ICommentRow): boolean {
  return isOwner(user, comment) && comment.deletedAt === null;
}

// The writer, the post's author on their own post, and the admin anywhere.
export function canDelete(user: SessionUser, comment: ICommentRow, post: ICommentPost): boolean {
  return user.role === Role.ADMIN || isOwner(user, comment) || isPostAuthor(user, post);
}
