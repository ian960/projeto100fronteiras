// How the commenter is labelled next to their name. Only people with a role
// in the portal get one; a reader is just their name.
//   admin      the portal's administrator
//   author     the person whose byline signs this post
//   columnist  a columnist commenting on someone else's post
export type CommentBadge = 'admin' | 'author' | 'columnist';

export type ICommentAuthor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  badge: CommentBadge | null;
};

// One comment as the site shows it.
export type ICommentView = {
  id: string;
  parentId: string | null;
  // Empty once deleted (a deleted comment that still has replies).
  content: string;
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
  // null: the account was deleted.
  author: ICommentAuthor | null;
};

export type ICommentThread = ICommentView & { replies: ICommentView[] };

// What GET /api/comments?postId= answers. postAuthorUserId lets the site show
// the "Excluir" button to the post's author; the API checks it again anyway.
export type ICommentList = {
  postAuthorUserId: string | null;
  total: number;
  comments: ICommentThread[];
};

// The facts the policy needs about a comment.
export type ICommentRow = {
  id: string;
  postId: string;
  userId: string | null;
  parentId: string | null;
  deletedAt: Date | null;
};

// The facts the policy needs about the post a comment is on.
export type ICommentPost = {
  id: string;
  status: string;
  authorId: string;
  authorUserId: string | null;
};
