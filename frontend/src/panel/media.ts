import { ApiError, post } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { Media, MediaPurpose, SignedUpload } from '../lib/types';

// Sending a file, in three steps (backend: modules/media/media.service.ts):
//
//   1. ask the API for a signed upload "for a cover"
//   2. send the file straight to Cloudinary with those fields, untouched
//   3. forward Cloudinary's answer to the API, which checks its signature
//
// The file never passes through our server, so a 100 MB video costs the API
// nothing, and the API secret never reaches the browser.

export function signUpload(purpose: MediaPurpose): Promise<SignedUpload> {
  return post<{ upload: SignedUpload }>('/media/signature', { purpose }).then((data) => data.upload);
}

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes / MB).toFixed(1).replace('.', ',');

// Checked here so a wrong file fails at once, instead of after a long upload.
// Cloudinary and the API check again; this is a courtesy, not the guard.
function checkFile(file: File, signed: SignedUpload): string | null {
  if (file.type === 'image/svg+xml') {
    return 'Arquivos SVG não são aceitos, porque podem conter código. Exporte a imagem como PNG ou JPEG.';
  }
  // Some systems report HEIC or .mov with an empty type: let Cloudinary decide.
  const accepted = signed.accept.split(',');
  if (file.type && !accepted.includes(file.type)) {
    return 'Este tipo de arquivo não é aceito aqui.';
  }
  // A big photo is shrunk below (prepareImage); only past maxSourceBytes is it refused.
  const limit = signed.maxSourceBytes ?? signed.maxBytes;
  if (file.size > limit) {
    return `O arquivo tem ${mb(file.size)} MB. O limite é ${Math.round(limit / MB)} MB.`;
  }
  return null;
}

// ── Shrinking a big photo before it leaves the browser ──────────────────────
// A camera or WhatsApp photo can be 15 MB and 6000 px wide. Cloudinary's free
// plan takes at most 10 MB, and the site never shows more than ~2500 px, so
// such a photo is redrawn at about 2560×2560 pixels as a JPEG (~1–2 MB): it
// gets in, and it goes up much faster on a phone's 4G.

const MAX_PIXELS = 2560 * 2560;
// Under this, a file is sent as it is: decoding it would cost more than it saves.
const SHRINK_FROM_BYTES = 3 * MB;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function prepareImage(file: File, maxBytes: number): Promise<File> {
  const tooBig = file.size > maxBytes;
  // An animated GIF redrawn on a canvas would lose its animation: only when it must.
  if (!tooBig && (file.size <= SHRINK_FROM_BYTES || file.type === 'image/gif')) return file;

  let bitmap: ImageBitmap;
  try {
    // Turns the photo upright from its EXIF orientation, like the site will.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // This browser cannot open the format (HEIC or TIFF outside Safari, say).
    // Cloudinary can: send it as it is, unless it is over Cloudinary's limit.
    if (!tooBig) return file;
    throw new Error(
      `A imagem tem ${mb(file.size)} MB, acima do limite de ${Math.round(maxBytes / MB)} MB, e este navegador não consegue reduzi-la. ` +
        'Tente enviar pelo celular, ou salve a foto como JPEG antes.',
    );
  }

  try {
    const pixels = bitmap.width * bitmap.height;
    if (!tooBig && pixels <= MAX_PIXELS) return file;

    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / pixels));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      if (tooBig) throw new Error('Não foi possível reduzir a imagem neste navegador.');
      return file;
    }

    // JPEG has no transparency: a transparent PNG gets a white background, not black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await toJpeg(canvas, 0.88);
    if (blob && blob.size > maxBytes) blob = await toJpeg(canvas, 0.7);
    if (!blob || blob.size > maxBytes) {
      if (!tooBig) return file;
      throw new Error(`Não foi possível reduzir a imagem para menos de ${Math.round(maxBytes / MB)} MB.`);
    }
    // Shrinking made it bigger (an already well-compressed photo): keep the original.
    if (!tooBig && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

// Cloudinary's own error messages, in the reader's language.
function cloudinaryMessage(status: number, body: { error?: { message?: string } } | null): string {
  const message = body?.error?.message ?? '';
  if (/not allowed/i.test(message)) return 'Este formato de arquivo não é aceito aqui.';
  if (/too large/i.test(message)) return 'O arquivo é grande demais para o plano do Cloudinary.';
  if (/invalid (image|video) file/i.test(message)) return 'O arquivo parece corrompido ou não é do tipo esperado.';
  if (status === 401) return 'O envio expirou. Tente de novo.';
  return message ? `O Cloudinary recusou o arquivo: ${message}` : `Falha no envio (${status}).`;
}

type CloudinaryAnswer = Record<string, unknown> & {
  public_id: string;
  version: number;
  signature: string;
  resource_type: 'image' | 'video';
  format: string;
  bytes: number;
};

// XHR instead of fetch only because fetch has no upload progress.
export function sendToCloudinary(
  signed: SignedUpload,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<CloudinaryAnswer> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(signed.fields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', signed.uploadUrl);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as CloudinaryAnswer);
      else reject(new Error(cloudinaryMessage(xhr.status, xhr.response)));
    };
    xhr.onerror = () => reject(new Error('A conexão caiu durante o envio. Tente de novo.'));
    xhr.onabort = () => reject(new DOMException('Envio cancelado.', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

export function registerMedia(purpose: MediaPurpose, answer: CloudinaryAnswer, originalName: string): Promise<Media> {
  return post<{ media: Media }>('/media', {
    purpose,
    publicId: answer.public_id,
    version: answer.version,
    signature: answer.signature,
    resourceType: answer.resource_type,
    format: answer.format,
    bytes: answer.bytes,
    width: (answer.width as number | undefined) ?? null,
    height: (answer.height as number | undefined) ?? null,
    duration: (answer.duration as number | undefined) ?? null,
    pages: (answer.pages as number | undefined) ?? null,
    originalName,
  }).then((data) => data.media);
}

// The three steps. Throws an Error with a message ready to show; an ApiError
// keeps its `fields` so a form can place it next to the right input.
export async function uploadMedia(
  purpose: MediaPurpose,
  file: File,
  onProgress: (fraction: number) => void = () => {},
  signal?: AbortSignal,
): Promise<Media> {
  const signed = await signUpload(purpose);

  const problem = checkFile(file, signed);
  if (problem) throw new Error(problem);

  const ready = signed.kind === 'image' ? await prepareImage(file, signed.maxBytes) : file;
  signal?.throwIfAborted();

  const answer = await sendToCloudinary(signed, ready, onProgress, signal);
  // The name the person knows, even when a shrunk .jpg was sent.
  return registerMedia(purpose, answer, file.name);
}

// A pasted link: Cloudinary copies the image into the account.
export function importMedia(purpose: Extract<MediaPurpose, 'cover' | 'body' | 'author'>, url: string): Promise<Media> {
  return post<{ media: Media }>('/media/import', { purpose, url }).then((data) => data.media);
}

// The message under a file field, whatever went wrong.
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.fields.file ?? error.fields.url) return (error.fields.file ?? error.fields.url)!;
    // The API refused what Cloudinary said about the file. There is no field
    // on screen to fix, so "check the highlighted fields" would mislead.
    if (Object.keys(error.fields).length > 0) return 'O arquivo foi enviado, mas o portal não conseguiu registrá-lo. Tente de novo.';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Não foi possível enviar o arquivo.';
}

export { formatBytes };
