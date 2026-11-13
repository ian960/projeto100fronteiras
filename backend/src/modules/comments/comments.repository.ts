import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { mediaSelect } from '../media/media.select';
import type { ICommentPost, ICommentRow } from './comments.types';

const rowSelect = { id: true, postId: true, userId: true, parentId: true, deletedAt: true } as const;

// Everything the site shows about a comment, the writer's photo included.
const viewSelect = {
  id: true,
  parentId: true,
  content: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      role: true,
      avatar: { select: mediaSelect },
      // A columnist without an account photo still has their byline photo.
      author: { select: { id: true, photo: { select: mediaSelect } } },
    },
  },
} as const;

export class CommentsRepository {
  async findPost(postId: string): Promise<ICommentPost | null> {
    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, status: true, authorId: true, author: { select: { userId: true } } },
      });
      return post
        ? { id: post.id, status: post.status, authorId: post.authorId, authorUserId: post.author.userId }
        : null;
    } catch (err) {
      logger.error('Failed to load the post of a comment', err);
      throw err;
    }
  }

  // Oldest first, like a conversation. Replies come with everything else and
  // are grouped by the service.
  async findForPost(postId: string) {
    try {
      return await prisma.comment.findMany({
        where: { postId },
        select: viewSelect,
        // uuid7 ids grow with time: the tie-break for two comments in the same millisecond.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 2000,
      });
    } catch (err) {
      logger.error('Failed to list comments', err);
      throw err;
    }
  }

  async findById(id: string): Promise<ICommentRow | null> {
    try {
      return await prisma.comment.findUnique({ where: { id }, select: rowSelect });
    } catch (err) {
      logger.error('Failed to find comment', err);
      throw err;
    }
  }

  async findView(id: string) {
    try {
      return await prisma.comment.findUniqueOrThrow({ where: { id }, select: viewSelect });
    } catch (err) {
      logger.error('Failed to load comment', err);
      throw err;
    }
  }

  async create(data: { postId: string; userId: string; parentId: string | null; content: string }) {
    try {
      return await prisma.comment.create({ data, select: viewSelect });
    } catch (err) {
      logger.error('Failed to create comment', err);
      throw err;
    }
  }

  async updateContent(id: string, content: string) {
    try {
      return await prisma.comment.update({
        where: { id },
        data: { content, editedAt: new Date() },
        select: viewSelect,
      });
    } catch (err) {
      logger.error('Failed to update comment', err);
      throw err;
    }
  }

  async countReplies(id: string): Promise<number> {
    try {
      return await prisma.comment.count({ where: { parentId: id } });
    } catch (err) {
      logger.error('Failed to count replies', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.comment.delete({ where: { id } });
    } catch (err) {
      logger.error('Failed to delete comment', err);
      throw err;
    }
  }

  // Emptied, not removed: its replies stay readable under "Comentário excluído".
  async softDelete(id: string): Promise<void> {
    try {
      await prisma.comment.update({ where: { id }, data: { content: '', deletedAt: new Date() } });
    } catch (err) {
      logger.error('Failed to soft-delete comment', err);
      throw err;
    }
  }
}

export const commentsRepository = new CommentsRepository();

export type CommentViewRow = Awaited<ReturnType<CommentsRepository['findView']>>;
