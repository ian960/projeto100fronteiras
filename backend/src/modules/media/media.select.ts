// The columns of a media row, for Prisma `select`s in other modules (a post's
// cover, an author's photo). One definition, so every query loads the same
// shape and presentMedia() always has what it needs.
export const mediaSelect = {
  id: true,
  kind: true,
  publicId: true,
  version: true,
  format: true,
  bytes: true,
  width: true,
  height: true,
  durationSec: true,
  pages: true,
  originalName: true,
  uploadedById: true,
  createdAt: true,
} as const;
