import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { FAKE_CLOUDINARY } from '../helpers/cloudinaryTestEnv';

// A small stand-in for Cloudinary, for automated tests and the browser test.
//
// It does the parts the project depends on, the same way Cloudinary does:
//   - checks the signature of every upload and delete (same algorithm)
//   - enforces allowed_formats and overwrite=false
//   - answers uploads with Cloudinary's field names and its own signature
//   - serves files back under the same URL layout as res.cloudinary.com
// It does NOT transform anything: a request for w_480 returns the original.
//
// Never used in development or production — those talk to the real thing.

export type FakeCloudinaryOptions = {
  port: number;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export type StoredAsset = {
  publicId: string;
  resourceType: 'image' | 'video';
  format: string;
  version: number;
  bytes: Buffer;
  width: number | null;
  height: number | null;
  pages: number | null;
  duration: number | null;
  assetFolder: string | null;
};

export type FakeCloudinary = {
  url: string;
  assets: Map<string, StoredAsset>;
  close(): Promise<void>;
};

// Cloudinary's rule: every parameter except these, sorted by name, joined
// with "&", followed by the API secret, hashed with SHA-1.
const NOT_SIGNED = new Set(['file', 'cloud_name', 'resource_type', 'api_key', 'signature']);

export function signParams(params: Record<string, string>, secret: string): string {
  const payload = Object.keys(params)
    .filter((key) => !NOT_SIGNED.has(key) && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(payload + secret).digest('hex');
}

// A grey 16:9 PNG, served for video frames and PDF pages.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mM4cfYaSYhhVMOg0AAA8rZcQEW3pqYAAAAASUVORK5CYII=',
  'base64',
);

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
};

// Reads the format from the file's first bytes, like Cloudinary: the name and
// the declared type are ignored.
function sniff(bytes: Buffer): string | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 4) === '%PDF') return 'pdf';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (bytes.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'qt  ') return 'mov';
    if (brand.startsWith('hei') || brand === 'mif1') return 'heic';
    if (brand === 'avif') return 'avif';
    if (brand === 'M4V ') return 'm4v';
    return 'mp4';
  }
  return null;
}

function imageSize(bytes: Buffer, format: string): { width: number; height: number } | null {
  if (format === 'png') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };

  if (format === 'jpg') {
    // Walk the JPEG segments until a Start Of Frame marker.
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

async function readForm(req: IncomingMessage): Promise<FormData> {
  const request = new Request('http://fake.local', {
    method: 'POST',
    headers: req.headers as Record<string, string>,
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  return request.formData();
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, {
    'content-type': type,
    // Uploads come straight from the panel in the browser, like the real one.
    'access-control-allow-origin': '*',
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer));
}

const fail = (res: ServerResponse, status: number, message: string) =>
  send(res, status, { error: { message } });

export async function startFakeCloudinary(options: FakeCloudinaryOptions): Promise<FakeCloudinary> {
  const assets = new Map<string, StoredAsset>();
  const base = `http://127.0.0.1:${options.port}`;
  const key = (resourceType: string, publicId: string) => `${resourceType}/${publicId}`;

  function deliveryUrl(asset: StoredAsset) {
    return `${base}/${options.cloudName}/${asset.resourceType}/upload/v${asset.version}/${asset.publicId}.${asset.format}`;
  }

  function describe(asset: StoredAsset, originalFilename: string) {
    return {
      asset_id: randomUUID().replace(/-/g, ''),
      public_id: asset.publicId,
      version: asset.version,
      version_id: randomUUID().replace(/-/g, ''),
      // Cloudinary signs its answer: SHA-1 of public_id + version + secret.
      signature: signParams(
        { public_id: asset.publicId, version: String(asset.version) },
        options.apiSecret,
      ),
      width: asset.width,
      height: asset.height,
      format: asset.format,
      resource_type: asset.resourceType,
      created_at: new Date().toISOString(),
      bytes: asset.bytes.length,
      type: 'upload',
      url: deliveryUrl(asset),
      secure_url: deliveryUrl(asset),
      original_filename: originalFilename,
      asset_folder: asset.assetFolder,
      ...(asset.pages ? { pages: asset.pages } : {}),
      ...(asset.duration ? { duration: asset.duration } : {}),
    };
  }

  // Checks the account, the API key, the signature and its one-hour validity.
  function verify(cloud: string, params: Record<string, string>): string | null {
    if (cloud !== options.cloudName) return 'Invalid cloud_name';
    if (params.api_key !== options.apiKey) return 'Invalid api_key';
    if (signParams(params, options.apiSecret) !== params.signature) {
      return 'Invalid Signature. String to sign was wrong.';
    }
    const age = Date.now() / 1000 - Number(params.timestamp);
    if (!(age >= -60 && age <= 3600)) return 'Stale request';
    return null;
  }

  async function upload(req: IncomingMessage, res: ServerResponse, cloud: string, resourceType: string) {
    const form = await readForm(req);
    const params: Record<string, string> = {};
    let file: string | File | null = null;

    for (const [name, value] of form.entries()) {
      if (name === 'file') file = value as string | File;
      else params[name] = String(value);
    }

    const problem = verify(cloud, params);
    if (problem) return fail(res, 401, problem);
    if (!file) return fail(res, 400, 'Missing required parameter - file');

    let bytes: Buffer;
    let originalFilename = 'file';

    if (typeof file === 'string') {
      // A link: Cloudinary downloads it itself.
      const response = await fetch(file).catch(() => null);
      if (!response?.ok) return fail(res, 400, `Resource not found - ${file}`);
      bytes = Buffer.from(await response.arrayBuffer());
      originalFilename = decodeURIComponent(new URL(file).pathname.split('/').pop() ?? 'file').replace(/\.[^.]+$/, '');
    } else {
      bytes = Buffer.from(await file.arrayBuffer());
      originalFilename = file.name.replace(/\.[^.]+$/, '') || 'file';
    }

    const format = sniff(bytes);
    if (!format) return fail(res, 400, 'Invalid image file');

    const isVideo = ['mp4', 'mov', 'webm', 'm4v'].includes(format);
    if ((resourceType === 'video') !== isVideo) return fail(res, 400, `Invalid ${resourceType} file`);

    const allowed = (params.allowed_formats ?? '').split(',').filter(Boolean);
    if (allowed.length && !allowed.includes(format)) {
      return fail(res, 400, `${resourceType === 'video' ? 'Video' : 'Image'} file format ${format} not allowed`);
    }

    const publicId = params.public_id ?? randomUUID();
    const existing = assets.get(key(resourceType, publicId));
    const overwrite = !['false', '0'].includes(params.overwrite ?? 'true');

    // overwrite=false: the file already there wins, as on Cloudinary.
    if (existing && !overwrite) {
      return send(res, 200, { ...describe(existing, originalFilename), existing: true });
    }

    const size = imageSize(bytes, format);
    const asset: StoredAsset = {
      publicId,
      resourceType: isVideo ? 'video' : 'image',
      format,
      version: Math.floor(Date.now() / 1000),
      bytes,
      width: size?.width ?? (isVideo ? 1920 : format === 'pdf' ? 1240 : null),
      height: size?.height ?? (isVideo ? 1080 : format === 'pdf' ? 1754 : null),
      pages: format === 'pdf' ? Math.max(1, (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length) : null,
      duration: isVideo ? 12.5 : null,
      assetFolder: params.asset_folder ?? null,
    };

    assets.set(key(asset.resourceType, publicId), asset);
    return send(res, 200, describe(asset, originalFilename));
  }

  async function destroy(req: IncomingMessage, res: ServerResponse, cloud: string, resourceType: string) {
    const form = await readForm(req);
    const params = Object.fromEntries([...form.entries()].map(([name, value]) => [name, String(value)]));
    const problem = verify(cloud, params);
    if (problem) return fail(res, 401, problem);

    const found = assets.delete(key(resourceType, params.public_id ?? ''));
    return send(res, 200, { result: found ? 'ok' : 'not found' });
  }

  // <cloud>/<image|video>/upload/[<transformation>/]v<version>/<publicId>.<ext>
  const DELIVERY = /^\/([^/]+)\/(image|video)\/upload\/(?:(.+?)\/)?v(\d+)\/(.+)\.([a-z0-9]+)$/i;

  function deliver(res: ServerResponse, path: string) {
    const match = path.match(DELIVERY);
    if (!match) return fail(res, 404, 'Not found');

    const [, cloud, resourceType, , , publicId, extension] = match;
    const asset = assets.get(key(resourceType!, publicId!));
    if (cloud !== options.cloudName || !asset) return fail(res, 404, 'Resource not found');

    // A frame of a video or a page of a PDF: a placeholder picture.
    if (extension === 'jpg' && asset.format !== 'jpg') {
      return send(res, 200, PLACEHOLDER_PNG, 'image/png');
    }

    return send(res, 200, asset.bytes, CONTENT_TYPES[asset.format] ?? 'application/octet-stream');
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', base);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': '*',
      });
      return res.end();
    }

    const api = url.pathname.match(/^\/v1_1\/([^/]+)\/(image|video)\/(upload|destroy)$/);

    const handle = async () => {
      if (req.method === 'POST' && api) {
        const [, cloud, resourceType, action] = api;
        return action === 'upload'
          ? upload(req, res, cloud!, resourceType!)
          : destroy(req, res, cloud!, resourceType!);
      }
      if (req.method === 'GET') return deliver(res, url.pathname);
      return fail(res, 404, 'Not found');
    };

    handle().catch((err) => fail(res, 500, String(err)));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => resolve());
  });

  return {
    url: base,
    assets,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// `npx tsx tests/fake-cloudinary/server.ts` starts it on its own, for the
// browser test. Same settings as the automated tests.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('fake-cloudinary/server.ts')) {
  void startFakeCloudinary(FAKE_CLOUDINARY).then((fake) => {
    console.log(`Fake Cloudinary on ${fake.url} (cloud "${FAKE_CLOUDINARY.cloudName}")`);
  });
}
