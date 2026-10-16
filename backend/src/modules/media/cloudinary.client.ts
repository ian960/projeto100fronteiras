import { createHash } from 'node:crypto';
import { getCloudinary } from '../../config/cloudinary';

// The three things this API asks of Cloudinary's Upload API, written out
// instead of pulled from the SDK: it is two POSTs and a hash, and having it in
// plain sight is what makes the signature easy to understand and to test.
//
// Docs: https://cloudinary.com/documentation/authentication_signatures

export class CloudinaryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CloudinaryError';
  }
}

// These never go into the string to sign.
const NOT_SIGNED = new Set(['file', 'cloud_name', 'resource_type', 'api_key', 'signature']);

// Cloudinary's signature: every other parameter as name=value, sorted by name,
// joined with "&", the API secret appended, SHA-1 in hex. Empty values are
// left out. Used both to sign what we send and to check what Cloudinary sends
// back (its answer to an upload is signed with public_id + version).
export function signParams(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .filter((name) => !NOT_SIGNED.has(name) && params[name] !== '')
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');

  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

// A signed POST to /v1_1/<cloud>/<image|video>/<action>.
async function call(
  resourceType: 'image' | 'video',
  action: 'upload' | 'destroy',
  params: Record<string, string>,
): Promise<Record<string, any>> {
  const cloud = getCloudinary();

  const signed = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = new URLSearchParams({
    ...signed,
    api_key: cloud.apiKey,
    signature: signParams(signed, cloud.apiSecret),
  });

  const response = await fetch(`${cloud.apiBase}/v1_1/${cloud.cloudName}/${resourceType}/${action}`, {
    method: 'POST',
    body,
    // Importing a link means Cloudinary downloading it first.
    signal: AbortSignal.timeout(60_000),
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, any>;

  if (!response.ok) {
    throw new CloudinaryError(json.error?.message ?? `HTTP ${response.status}`, response.status);
  }

  return json;
}

// Cloudinary downloads the image at `url` and stores it under `params`.
export function uploadFromUrl(url: string, params: Record<string, string>) {
  return call('image', 'upload', { ...params, file: url });
}

// `invalidate` also purges cached copies from the CDN.
export async function destroy(resourceType: 'image' | 'video', publicId: string): Promise<string> {
  const json = await call(resourceType, 'destroy', { public_id: publicId, invalidate: 'true' });
  return String(json.result);
}
