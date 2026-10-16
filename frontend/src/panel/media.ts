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

// Checked here so a wrong file fails at once, instead of after a long upload.
// Cloudinary and the API check again; this is a courtesy, not the guard.
function checkFile(file: File, signed: SignedUpload): string | null {
  if (file.size > signed.maxBytes) {
    return `O arquivo tem ${(file.size / MB).toFixed(1).replace('.', ',')} MB. O limite é ${Math.round(signed.maxBytes / MB)} MB.`;
  }
  const accepted = signed.accept.split(',');
  // Some systems report HEIC or .mov with an empty type: let Cloudinary decide.
  if (file.type && !accepted.includes(file.type)) {
    return 'Este tipo de arquivo não é aceito aqui.';
  }
  return null;
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

  const answer = await sendToCloudinary(signed, file, onProgress, signal);
  return registerMedia(purpose, answer, file.name);
}

// A pasted link: Cloudinary copies the image into the account.
export function importMedia(purpose: Extract<MediaPurpose, 'cover' | 'body' | 'author'>, url: string): Promise<Media> {
  return post<{ media: Media }>('/media/import', { purpose, url }).then((data) => data.media);
}

// The message under a file field, whatever went wrong.
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.fields.file ?? error.fields.url ?? error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível enviar o arquivo.';
}

export { formatBytes };
