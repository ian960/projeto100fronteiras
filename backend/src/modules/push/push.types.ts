// What GET /api/push/config tells the site. enabled false: the server has no
// VAPID keys, and the site hides the button.
export type PushConfig = { enabled: boolean; publicKey: string | null };

export type PushNotificationSummary = {
  id: string;
  title: string;
  body: string;
  url: string;
  postTitle: string | null;
  status: 'sending' | 'done';
  total: number;
  sent: number;
  failed: number;
  removed: number;
  createdAt: Date;
  finishedAt: Date | null;
  createdBy: string | null;
};

export type PushOverview = {
  configured: boolean;
  subscriptions: number;
  dailyLimit: number;
  sentLast24h: number;
  sending: boolean;
  notifications: PushNotificationSummary[];
};

// What the service worker (frontend/public/sw.js) receives, encrypted.
export type PushPayload = {
  title: string;
  body: string;
  // A path on the site (/noticia/...), opened on click.
  url: string;
  image: string | null;
  // Same tag, same notification: a second one about the same story replaces
  // the first instead of piling up.
  tag: string;
};
