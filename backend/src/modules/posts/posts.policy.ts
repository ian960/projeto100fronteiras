import { PostStatus, PostType, Role } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import type { IPost } from './posts.types';

// Every "who may do what" rule for posts lives here, and nowhere else.
//
// These are pure functions: no database, no request, no session. That is what
// makes them testable on their own, and what stops the rules from drifting
// across five service methods that each re-derive them slightly differently.
//
// Division of labour: the policy decides, the service orchestrates, the
// repository executes. The policy never queries.

export function isAdmin(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

// A columnist owns a column their byline signs, and a news story they wrote
// themselves (signed by them and created from their account). News the admin
// wrote and signed with a columnist's name stays the admin's.
export function ownsPost(user: SessionUser, post: IPost): boolean {
  if (user.role !== Role.COLUMNIST || user.authorId === null || post.authorId !== user.authorId) {
    return false;
  }
  if (post.type === PostType.COLUMN) return true;
  return post.createdById === user.id;
}

export function canViewInPanel(user: SessionUser, post: IPost): boolean {
  return isAdmin(user) || ownsPost(user, post);
}

// Published means out of the columnist's hands. The admin fixes typos from
// then on — worth saying out loud during training, because the columnist will
// ask.
export function canEdit(user: SessionUser, post: IPost): boolean {
  if (isAdmin(user)) return true;
  return ownsPost(user, post) && post.status !== PostStatus.PUBLISHED;
}

export function canDelete(user: SessionUser, post: IPost): boolean {
  if (isAdmin(user)) return true;
  return ownsPost(user, post) && post.status === PostStatus.DRAFT;
}

// Only the admin puts anything online. A columnist can never write
// status = 'published', no matter which endpoint they reach.
export function canPublish(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canUnpublish(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canFeature(user: SessionUser): boolean {
  return isAdmin(user);
}

// Draft -> pending: the columnist handing their text to the admin.
export function canSubmitForReview(user: SessionUser, post: IPost): boolean {
  if (!ownsPost(user, post)) return false;
  return post.status === PostStatus.DRAFT;
}

// A columnist writes columns and news, both signed by them and both going
// through Revisão: only the admin publishes.
export function canCreateType(user: SessionUser, type: PostType): boolean {
  if (isAdmin(user)) return true;
  return user.role === Role.COLUMNIST && (type === PostType.COLUMN || type === PostType.NEWS);
}
