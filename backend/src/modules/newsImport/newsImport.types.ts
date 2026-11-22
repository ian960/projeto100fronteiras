export type INewsSource = {
  id: string;
  name: string;
  feedUrl: string;
  fullText: boolean;
  active: boolean;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  lastRunAt: Date | null;
  lastError: string | null;
  lastImportedCount: number;
  createdAt: Date;
  updatedAt: Date;
};

// A line of "Últimas importadas" in the panel.
export type IImportedItem = {
  id: string;
  importedAt: Date;
  imageUrl: string | null;
  source: { id: string; name: string };
  post: { id: string; title: string; status: string; slug: string } | null;
};

// What the post editor needs to know about a post that came from a feed.
export type IImportOrigin = {
  sourceName: string;
  fullText: boolean;
  imageUrl: string | null;
};

export type ImportRunResult = {
  sourceId: string;
  name: string;
  imported: number;
  error: string | null;
  // What the feed had, to explain a "nada novo": how many stories, and the
  // date of the newest one.
  found: number;
  newestAt: Date | null;
};
