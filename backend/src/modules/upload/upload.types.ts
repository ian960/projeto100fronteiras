export type UploadedImage = {
  url: string;
  width: number;
  height: number;
  bytes: number;
  // Same image at smaller widths, for the card and the thumbnail.
  variants: { width: number; url: string }[];
};

export type VideoUploadTicket = {
  // Pre-signed PUT the browser uses to send the file straight to R2.
  uploadUrl: string;
  // Where the file will be readable once the PUT finishes. This is the value
  // that goes into the post's videoUrl.
  publicUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
};
