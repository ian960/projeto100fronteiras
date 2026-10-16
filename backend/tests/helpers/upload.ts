import type { agent } from './agent';

// What the panel does to send a file, step by step, against the fake
// Cloudinary: ask the API for a signature, send the file straight to
// "Cloudinary", forward its answer to the API.

type Agent = ReturnType<typeof agent>;
type Purpose = 'cover' | 'body' | 'author' | 'video' | 'document';
export type TestFile = { name: string; bytes: Buffer };

// ── tiny files with just enough of a real header ─────────────────────────────
// The fake reads the format from the first bytes and the size from the PNG
// header, like Cloudinary. Nothing here is a decodable picture.

export function pngFile(width: number, height: number, name = 'photo.png'): TestFile {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return { name, bytes: header };
}

export function pdfFile(pages: number, name = 'edital.pdf'): TestFile {
  const body = `%PDF-1.4\n${'<< /Type /Page >>\n'.repeat(pages)}<< /Type /Pages >>\n%%EOF`;
  return { name, bytes: Buffer.from(body, 'latin1') };
}

export function mp4File(name = 'clip.mp4'): TestFile {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'latin1');
  return { name, bytes };
}

// ── the three steps ──────────────────────────────────────────────────────────

export async function signUpload(client: Agent, purpose: Purpose) {
  const response = await client.post('/api/media/signature').send({ purpose }).expect(200);
  return response.body.data.upload as {
    uploadUrl: string;
    fields: Record<string, string>;
    maxBytes: number;
    accept: string;
  };
}

// Step 2: browser -> Cloudinary. `tamper` lets a test change a signed field,
// as a malicious page would.
export async function sendToCloudinary(
  upload: { uploadUrl: string; fields: Record<string, string> },
  file: TestFile,
  tamper: Record<string, string> = {},
) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...upload.fields, ...tamper })) {
    form.append(name, value);
  }
  form.append('file', new Blob([new Uint8Array(file.bytes)]), file.name);

  const response = await fetch(upload.uploadUrl, { method: 'POST', body: form });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

// Cloudinary's answer, renamed the way the panel sends it to the API.
export function registration(purpose: Purpose, cloud: Record<string, any>, originalName: string) {
  return {
    purpose,
    publicId: cloud.public_id,
    version: cloud.version,
    signature: cloud.signature,
    resourceType: cloud.resource_type,
    format: cloud.format,
    bytes: cloud.bytes,
    width: cloud.width ?? null,
    height: cloud.height ?? null,
    duration: cloud.duration ?? null,
    pages: cloud.pages ?? null,
    originalName,
  };
}

// All three steps; returns the media the API created.
export async function uploadMedia(client: Agent, purpose: Purpose, file: TestFile) {
  const upload = await signUpload(client, purpose);
  const cloud = await sendToCloudinary(upload, file);
  if (cloud.status !== 200) throw new Error(`Fake Cloudinary refused: ${JSON.stringify(cloud.body)}`);

  const response = await client
    .post('/api/media')
    .send(registration(purpose, cloud.body, file.name))
    .expect(201);

  return response.body.data.media as Record<string, any>;
}
