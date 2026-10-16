import { cloudinaryConfig, type CloudinaryConfig } from './env';
import { ServiceUnavailable } from '../shared/errors/AppError';

// Importing this module never fails, so the rest of the API boots fine
// without Cloudinary keys. Only the media endpoints need them.

export function isMediaConfigured(): boolean {
  return cloudinaryConfig !== null;
}

export function mediaUnavailable(): ServiceUnavailable {
  return new ServiceUnavailable(
    'Media uploads are not configured on this server. Set CLOUDINARY_URL to enable them.',
  );
}

// The settings, for code that talks to Cloudinary. Throws 503 when it is off.
export function getCloudinary(): CloudinaryConfig {
  if (!cloudinaryConfig) throw mediaUnavailable();
  return cloudinaryConfig;
}

// The settings or null, for code that only builds URLs and must not fail
// (a public page showing a picture).
export function getCloudinarySettings(): CloudinaryConfig | null {
  return cloudinaryConfig;
}
