import { Forbidden, NotFound, ValidationError } from '../../shared/errors/AppError';
import { PostStatus, Role } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import { photoUrlOf } from '../authors/authors.select';
import * as policy from './comments.policy';
import { commentsRepository, type CommentViewRow } from './comments.repository';
import type { CommentBadge, ICommentList, ICommentPost, ICommentThread, ICommentView } from './comments.types';

function badgeOf(user: NonNullable<CommentViewRow['user']>, post: ICommentPost): CommentBadge | null {
  if (user.role === Role.ADMIN) return 'admin';
  if (user.author && user.author.id === post.authorId) return 'author';
  if (user.role === Role.COLUMNIST) return 'columnist';
  return null;
}

function present(row: CommentViewRow, post: ICommentPost): ICommentView {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    parentId: row.parentId,
    content: deleted ? '' : row.content,
    deleted,
    createdAt: row.createdAt,
    editedAt: deleted ? null : row.editedAt,
    author:
      row.user && !deleted
        ? {
            id: row.user.id,
            name: row.user.name,
            avatarUrl: photoUrlOf(row.user.avatar) ?? photoUrlOf(row.user.author?.photo),
            badge: badgeOf(row.user, post),
          }
        : null,
  };
}

export class CommentsService {
  // Comments exist only on what readers can see: a published post. A draft's
  // id answers like a post that does not exist.
  private async requirePublishedPost(postId: string): Promise<ICommentPost> {
    const post = await commentsRepository.findPost(postId);
    if (!post || post.status !== PostStatus.PUBLISHED) throw new NotFound('Post not found.');
    return post;
  }

  private async requireComment(id: string) {
    const comment = await commentsRepository.findById(id);
    if (!comment) throw new NotFound('Comment not found.');
    return comment;
  }

  async list(postId: string): Promise<ICommentList> {
    const post = await this.requirePublishedPost(postId);
    const rows = await commentsRepository.findForPost(postId);

    const threads = new Map<string, ICommentThread>();
    const replies: ICommentView[] = [];

    for (const row of rows) {
      const view = present(row, post);
      if (view.parentId) replies.push(view);
      else threads.set(view.id, { ...view, replies: [] });
    }
    for (const reply of replies) threads.get(reply.parentId!)?.replies.push(reply);

    const comments = [...threads.values()];
    const total = rows.filter((row) => row.deletedAt === null).length;

    return { postAuthorUserId: post.authorUserId, total, comments };
  }

  async create(
    actor: SessionUser,
    input: { postId: string; parentId?: string | null; content: string },
  ): Promise<ICommentView> {
    const post = await this.requirePublishedPost(input.postId);

    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await commentsRepository.findById(input.parentId);
      if (!parent || parent.postId !== post.id) {
        throw new ValidationError('Comment not found.', { parentId: 'This comment no longer exists.' });
      }
      // A reply to a reply joins the same conversation: one level only.
      parentId = parent.parentId ?? parent.id;
    }

    const row = await commentsRepository.create({
      postId: post.id,
      userId: actor.id,
      parentId,
      content: input.content,
    });
    return present(row, post);
  }

  async update(actor: SessionUser, id: string, content: string): Promise<ICommentView> {
    const comment = await this.requireComment(id);
    if (!policy.canEdit(actor, comment)) throw new Forbidden('Only the person who wrote a comment can edit it.');

    const post = await this.requirePublishedPost(comment.postId);
    const row = await commentsRepository.updateContent(id, content);
    return present(row, post);
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    const comment = await this.requireComment(id);
    const post = await commentsRepository.findPost(comment.postId);
    if (!post) throw new NotFound('Comment not found.');

    if (!policy.canDelete(actor, comment, post)) throw new Forbidden();

    // Keep a top-level comment that has replies, emptied, so they still make sense.
    if (!comment.parentId && (await commentsRepository.countReplies(id)) > 0) {
      await commentsRepository.softDelete(id);
      return;
    }

    await commentsRepository.delete(id);

    // The last reply under an already deleted comment: nothing is left to read.
    if (comment.parentId) {
      const parent = await commentsRepository.findById(comment.parentId);
      if (parent?.deletedAt && (await commentsRepository.countReplies(parent.id)) === 0) {
        await commentsRepository.delete(parent.id);
      }
    }
  }
}

export const commentsService = new CommentsService();
