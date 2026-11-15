// What the reader sees on "Minha conta". "none": never asked.
export type NewsletterMineStatus = 'none' | 'pending' | 'active' | 'unsubscribed';

export type IssueSummary = {
  id: string;
  subject: string;
  createdAt: Date;
  createdBy: string | null;
  total: number;
  sent: number;
  pending: number;
  failed: number;
  cancelled: number;
};

export type NewsletterOverview = {
  subscribers: { active: number; pending: number; unsubscribed: number };
  dailyLimit: number;
  sentLast24h: number;
  // Waiting in the queue, across every issue.
  queued: number;
  sending: boolean;
  issues: IssueSummary[];
};

// A story the admin can pick for the newsletter.
export type NewsletterPostOption = {
  id: string;
  type: 'news' | 'column';
  title: string;
  slug: string;
  publishedAt: Date | null;
  category: string | null;
};
