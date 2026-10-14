import { z } from 'zod';

export const imageUploadQuerySchema = z.object({
  query: z.object({
    // Where the file belongs, only to keep the bucket tidy.
    folder: z.enum(['covers', 'authors']).default('covers'),
  }),
});

export const videoTicketSchema = z.object({
  body: z.object({
    filename: z.string().trim().min(1).max(200),
    // Only mp4 is accepted. A phone recording in .mov/HEVC will not play in a
    // large share of browsers, and without transcoding we would be publishing
    // a black rectangle to those readers.
    contentType: z.literal('video/mp4'),
    sizeBytes: z.coerce.number().int().positive(),
  }),
});
