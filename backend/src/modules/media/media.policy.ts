import { Role } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import type { IMedia } from './media.types';

// Who may do what with uploaded files. Pure functions, like posts.policy.

export function isAdmin(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

// A columnist puts on their column only files they uploaded themselves. The
// admin, who edits everything, may use any file.
export function canUse(user: SessionUser, media: IMedia): boolean {
  return isAdmin(user) || media.uploadedById === user.id;
}

// Deleting a file is final (it leaves Cloudinary too), so only the admin.
export function canDelete(user: SessionUser): boolean {
  return isAdmin(user);
}
