import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getCloudinary } from '../../config/cloudinary';
import {
  Conflict,
  Forbidden,
  NotFound,
  ServiceUnavailable,
  ValidationError,
} from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import type { MediaKind } from '../../shared/types/enums';
import type { SessionUser } from '../auth/auth.types';
import { CloudinaryError, destroy, signParams, uploadFromUrl } from './cloudinary.client';
import * as policy from './media.policy';
import { PURPOSE_RULES, type MediaPurpose, type PurposeRule } from './media.purposes';
import { mediaRepository } from './media.repository';
import type { IMedia, IMediaView, ISignedUpload } from './media.types';
import { presentMedia } from './media.urls';
import type { ImportMediaInput, RegisterMediaInput, UploadedFacts } from './media.service.types';

// How a file gets into the project:
//
//   1. sign()      the panel asks for an upload "for a cover". The server picks
//                  the folder, the file's id and the accepted formats, and signs
//                  them with the API secret, which never leaves the server.
//   2. (browser)   sends the file straight to Cloudinary with those fields.
//                  A 100 MB video never passes through this API.
//   3. register()  the panel forwards Cloudinary's answer. Cloudinary signed it
//                  too (public_id + version), so the server can tell a real
//                  upload from an invented one without calling Cloudinary.
//
// importFromUrl() does 1–3 in one go on the server, for a pasted image link.

const MB = 1024 * 1024;

function sameSignature(expected: string, received: string): boolean {
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(received.toLowerCase());
  // Constant time: comparing character by character would leak, through
  // timing, how many leading characters of a forged signature were right.
  return a.length === b.length && timingSafeEqual(a, b);
}

// The server generates every id: "<top folder>/<purpose folder>/<uuid>".
function folderFor(rule: PurposeRule): string {
  return `${getCloudinary().folder}/${rule.folder}`;
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isOurId(rule: PurposeRule, publicId: string): boolean {
  const prefix = `${folderFor(rule)}/`;
  return publicId.startsWith(prefix) && ID_PATTERN.test(publicId.slice(prefix.length));
}

// "~/Downloads/Edital nº 12.pdf" -> "Edital nº 12.pdf"
function cleanName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? name;
  return last.trim().slice(0, 200) || 'arquivo';
}

export class MediaService {
  sign(purpose: MediaPurpose): ISignedUpload {
    const cloud = getCloudinary();
    const rule = PURPOSE_RULES[purpose];
    const folder = folderFor(rule);

    // Every value here is covered by the signature. The browser can send the
    // file, but cannot change where it goes or what it is allowed to be.
    const params: Record<string, string> = {
      timestamp: String(Math.floor(Date.now() / 1000)), // valid for one hour
      public_id: `${folder}/${randomUUID()}`,
      asset_folder: folder, // where it shows up in the Cloudinary console
      allowed_formats: rule.formats.join(','),
      // A signature reused within its hour cannot replace a published file.
      // "0", not "false": exactly what Cloudinary's own SDK sends.
      overwrite: '0',
    };

    const signature = signParams(params, cloud.apiSecret);

    return {
      uploadUrl: `${cloud.apiBase}/v1_1/${cloud.cloudName}/${rule.resourceType}/upload`,
      fields: { ...params, api_key: cloud.apiKey, signature },
      maxBytes: rule.maxBytes,
      accept: rule.accept,
    };
  }

  async register(actor: SessionUser, input: RegisterMediaInput): Promise<IMediaView> {
    const cloud = getCloudinary();
    const rule = PURPOSE_RULES[input.purpose];

    // Cloudinary signs its answer with the same secret: public_id + version.
    const expected = signParams(
      { public_id: input.publicId, version: input.version },
      cloud.apiSecret,
    );

    // Not destroyed on failure: an unverified id may not be ours to delete.
    if (!isOurId(rule, input.publicId) || !sameSignature(expected, input.signature)) {
      throw new ValidationError('This upload could not be verified.', {
        file: 'Send the file again.',
      });
    }

    // The panel may retry after a network hiccup. Same file, same answer.
    const existing = await mediaRepository.findByPublicId(input.publicId);
    if (existing) {
      if (!policy.canUse(actor, existing)) throw new Forbidden();
      return presentMedia(existing);
    }

    const format = await this.assertFitsPurpose(rule, input);

    const media = await mediaRepository.create({
      kind: rule.kind,
      publicId: input.publicId,
      version: input.version,
      format,
      bytes: input.bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSec: input.duration ?? null,
      pages: input.pages ?? null,
      originalName: cleanName(input.originalName),
      uploadedById: actor.id,
    });

    return presentMedia(media);
  }

  // A pasted link is copied into Cloudinary, so the post does not depend on
  // someone else's website keeping the picture online.
  async importFromUrl(actor: SessionUser, input: ImportMediaInput): Promise<IMediaView> {
    const rule = PURPOSE_RULES[input.purpose];
    const folder = folderFor(rule);

    let uploaded: Record<string, any>;
    try {
      uploaded = await uploadFromUrl(input.url, {
        public_id: `${folder}/${randomUUID()}`,
        asset_folder: folder,
        allowed_formats: rule.formats.join(','),
        overwrite: '0',
      });
    } catch (err) {
      if (!(err instanceof CloudinaryError) && !(err instanceof Error && err.name === 'TimeoutError')) {
        throw err;
      }
      // Cloudinary fetches the link itself. A 404, a web page instead of an
      // image, or an unsupported format all end up here.
      logger.warn('Cloudinary could not import a link', err);
      throw new ValidationError('Could not import an image from this link.', {
        url: 'Use a link that opens the image itself (JPEG, PNG or WebP).',
      });
    }

    const facts: UploadedFacts = {
      publicId: uploaded.public_id,
      version: String(uploaded.version),
      resourceType: uploaded.resource_type,
      format: uploaded.format,
      bytes: uploaded.bytes,
      width: uploaded.width,
      height: uploaded.height,
    };

    const format = await this.assertFitsPurpose(rule, facts);

    const fromPath = decodeURIComponent(new URL(input.url).pathname.split('/').pop() ?? '');

    const media = await mediaRepository.create({
      kind: rule.kind,
      publicId: facts.publicId,
      version: facts.version,
      format,
      bytes: facts.bytes,
      width: facts.width ?? null,
      height: facts.height ?? null,
      originalName: cleanName(fromPath || `${uploaded.original_filename}.${format}`),
      uploadedById: actor.id,
    });

    return presentMedia(media);
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    if (!policy.canDelete(actor)) {
      throw new Forbidden('Only an admin can delete files.');
    }

    const media = await mediaRepository.findById(id);
    if (!media) throw new NotFound('File not found.');

    const usage = await mediaRepository.countUsage(media);
    const total = Object.values(usage).reduce((sum, count) => sum + count, 0);

    if (total > 0) {
      throw new Conflict(`This file is still in use (${total}). Remove it from the posts first.`);
    }

    await this.destroyInCloudinary(media);
    await mediaRepository.delete(id);
  }

  // ── used by posts and authors ─────────────────────────────────────────────

  // Loads a file that a post or a profile wants to point at, and checks that
  // it is the right kind and that this person may use it. `field` is the
  // form field the error is shown next to.
  async requireUsable(
    actor: SessionUser,
    id: string,
    kind: MediaKind,
    field: string,
  ): Promise<IMedia> {
    const [media] = await this.requireAllUsable(actor, [id], kind, field);
    return media!;
  }

  async requireAllUsable(
    actor: SessionUser,
    ids: string[],
    kind: MediaKind,
    field: string,
  ): Promise<IMedia[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];

    const found = await mediaRepository.findByIds(unique);

    if (found.length !== unique.length) {
      throw new ValidationError('File not found.', { [field]: 'Upload the file again.' });
    }

    if (found.some((media) => media.kind !== kind)) {
      throw new ValidationError('This file cannot be used here.', {
        [field]: `Choose a file of type: ${kind}.`,
      });
    }

    if (found.some((media) => !policy.canUse(actor, media))) {
      throw new Forbidden('You can only use files you uploaded.');
    }

    const byId = new Map(found.map((media) => [media.id, media]));
    return unique.map((id) => byId.get(id)!);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  // The upload already happened, so a file that breaks the rules is removed
  // from Cloudinary right away instead of lingering there unused.
  // Returns the format, normalized ("jpeg" is stored as "jpg").
  private async assertFitsPurpose(rule: PurposeRule, facts: UploadedFacts): Promise<string> {
    const format = facts.format.toLowerCase() === 'jpeg' ? 'jpg' : facts.format.toLowerCase();
    let problem: string | null = null;

    if (facts.resourceType !== rule.resourceType || !rule.formats.includes(format)) {
      problem = `Accepted formats: ${rule.formats.join(', ')}.`;
    } else if (facts.bytes > rule.maxBytes) {
      problem = `Maximum ${Math.round(rule.maxBytes / MB)} MB.`;
    } else if (rule.minWidth && (facts.width ?? 0) < rule.minWidth) {
      problem = `Use an image at least ${rule.minWidth}px wide.`;
    }

    if (!problem) return format;

    await this.destroyInCloudinary({ publicId: facts.publicId, kind: rule.kind }).catch((err) =>
      logger.warn('Could not remove a rejected upload from Cloudinary', err),
    );

    throw new ValidationError('This file does not fit here.', { file: problem });
  }

  private async destroyInCloudinary(media: Pick<IMedia, 'publicId' | 'kind'>): Promise<void> {
    const result = await destroy(media.kind === 'video' ? 'video' : 'image', media.publicId);

    // "not found" is fine: the goal is that the file is not there.
    if (result !== 'ok' && result !== 'not found') {
      logger.error('Cloudinary refused to delete a file', result);
      throw new ServiceUnavailable('Cloudinary did not delete the file. Try again in a moment.');
    }
  }
}

export const mediaService = new MediaService();
