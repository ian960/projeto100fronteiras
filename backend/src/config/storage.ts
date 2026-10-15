import { S3Client } from '@aws-sdk/client-s3';
import { r2Config } from './env';
import { ServiceUnavailable } from '../shared/errors/AppError';

// Built lazily and only when R2 is configured. Importing this module never
// fails, so the rest of the API boots fine without Cloudflare keys.
let client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return r2Config !== null;
}

export function getStorage() {
  if (!r2Config) {
    throw new ServiceUnavailable(
      'File uploads are not configured on this server. Set the R2_* variables to enable them.',
    );
  }

  if (!client) {
    // R2 speaks the S3 protocol. Region must be "auto".
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }

  const { bucket, publicUrl } = r2Config;

  return {
    s3: client,
    bucket,
    publicUrl: (key: string) => `${publicUrl}/${key}`,
  };
}
