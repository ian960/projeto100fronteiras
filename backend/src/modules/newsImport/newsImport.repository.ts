import { prisma } from '../../config/prisma';
import type { IImportOrigin, IImportedItem, INewsSource } from './newsImport.types';

export type NewsSourceData = {
  name: string;
  feedUrl: string;
  fullText: boolean;
  active: boolean;
  categoryId: string | null;
};

const sourceSelect = {
  id: true,
  name: true,
  feedUrl: true,
  fullText: true,
  active: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  lastRunAt: true,
  lastError: true,
  lastImportedCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class NewsImportRepository {
  listSources(): Promise<INewsSource[]> {
    return prisma.newsSource.findMany({ select: sourceSelect, orderBy: { createdAt: 'asc' } });
  }

  listActiveSources(): Promise<INewsSource[]> {
    return prisma.newsSource.findMany({ where: { active: true }, select: sourceSelect, orderBy: { createdAt: 'asc' } });
  }

  findSource(id: string): Promise<INewsSource | null> {
    return prisma.newsSource.findUnique({ where: { id }, select: sourceSelect });
  }

  findSourceByFeedUrl(feedUrl: string): Promise<{ id: string } | null> {
    return prisma.newsSource.findUnique({ where: { feedUrl }, select: { id: true } });
  }

  createSource(data: NewsSourceData): Promise<INewsSource> {
    return prisma.newsSource.create({ data, select: sourceSelect });
  }

  updateSource(id: string, data: Partial<NewsSourceData>): Promise<INewsSource> {
    return prisma.newsSource.update({ where: { id }, data, select: sourceSelect });
  }

  async deleteSource(id: string): Promise<void> {
    await prisma.newsSource.delete({ where: { id } });
  }

  async recordRun(id: string, at: Date, imported: number, error: string | null): Promise<void> {
    await prisma.newsSource.update({
      where: { id },
      data: { lastRunAt: at, lastImportedCount: imported, lastError: error },
    });
  }

  async seenGuids(sourceId: string, guids: string[]): Promise<Set<string>> {
    const rows = await prisma.importedItem.findMany({
      where: { sourceId, guid: { in: guids } },
      select: { guid: true },
    });
    return new Set(rows.map((row) => row.guid));
  }

  // Remembers an item. False when another run got there first (unique key).
  async markSeen(sourceId: string, guid: string, imageUrl: string | null): Promise<string | null> {
    const result = await prisma.importedItem.createMany({
      data: [{ sourceId, guid, imageUrl }],
      skipDuplicates: true,
    });
    if (result.count === 0) return null;
    const row = await prisma.importedItem.findUnique({ where: { sourceId_guid: { sourceId, guid } }, select: { id: true } });
    return row?.id ?? null;
  }

  async linkPost(itemId: string, postId: string): Promise<void> {
    await prisma.importedItem.update({ where: { id: itemId }, data: { postId } });
  }

  async forget(itemId: string): Promise<void> {
    await prisma.importedItem.delete({ where: { id: itemId } });
  }

  // Deletes every imported news still waiting in Revisão. The imported_items
  // rows stay (postId becomes null), so the same news is not imported again.
  async deletePendingImported(): Promise<number> {
    const result = await prisma.post.deleteMany({
      where: { status: 'pending', importedFrom: { isNot: null } },
    });
    return result.count;
  }

  listRecentItems(limit: number): Promise<IImportedItem[]> {
    return prisma.importedItem.findMany({
      where: { postId: { not: null } },
      orderBy: { importedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        importedAt: true,
        imageUrl: true,
        source: { select: { id: true, name: true } },
        post: { select: { id: true, title: true, status: true, slug: true } },
      },
    });
  }

  async findOriginOfPost(postId: string): Promise<IImportOrigin | null> {
    const row = await prisma.importedItem.findUnique({
      where: { postId },
      select: { imageUrl: true, source: { select: { name: true, fullText: true } } },
    });
    return row ? { sourceName: row.source.name, fullText: row.source.fullText, imageUrl: row.imageUrl } : null;
  }

  // Imported drafts are written in the name of an admin: the oldest active one.
  findImportingAdmin() {
    return prisma.user.findFirst({
      where: { role: 'admin', active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, role: true, authors: { select: { id: true } } },
    });
  }
}

export const newsImportRepository = new NewsImportRepository();
