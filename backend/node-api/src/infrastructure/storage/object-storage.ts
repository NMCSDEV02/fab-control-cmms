import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const LOCAL_PROVIDER = 'LOCAL_PRIVATE';
const EVIDENCE_BUCKET = 'maintenance-evidence';
const HEADER_BYTES = 16;

const mediaTypes = {
  'image/jpeg': { extension: 'jpg', evidenceType: 'PHOTO' },
  'image/png': { extension: 'png', evidenceType: 'PHOTO' },
  'image/webp': { extension: 'webp', evidenceType: 'PHOTO' },
} as const;

export type AcceptedEvidenceMediaType = keyof typeof mediaTypes;

export interface StoredObject {
  readonly id: string;
  readonly provider: typeof LOCAL_PROVIDER;
  readonly bucket: typeof EVIDENCE_BUCKET;
  readonly objectKey: string;
  readonly originalName: string;
  readonly mediaType: AcceptedEvidenceMediaType;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly evidenceType: 'PHOTO';
}

export interface StoredObjectReference {
  readonly provider: string;
  readonly bucket: string;
  readonly objectKey: string;
}

export class ObjectStorageError extends Error {
  constructor(
    readonly code: 'FILE_TYPE_NOT_ALLOWED' | 'FILE_CONTENT_INVALID' | 'FILE_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'ObjectStorageError';
  }
}

export interface ObjectStorage {
  readonly maxEvidenceBytes: number;
  storeEvidence(input: {
    readonly tenantId: string;
    readonly originalName: string;
    readonly mediaType: string;
    readonly stream: Readable;
  }): Promise<StoredObject>;
  open(reference: StoredObjectReference): ReadStream;
  remove(reference: StoredObjectReference): Promise<void>;
}

function acceptedMediaType(value: string): AcceptedEvidenceMediaType {
  if (Object.hasOwn(mediaTypes, value)) return value as AcceptedEvidenceMediaType;
  throw new ObjectStorageError('FILE_TYPE_NOT_ALLOWED', 'Envie uma foto JPEG, PNG ou WebP.');
}

function sanitizedOriginalName(value: string): string {
  const printable = basename(value.normalize('NFKC')).replaceAll(/\p{Cc}/gu, '');
  const normalized = printable.replaceAll(/\s+/gu, ' ').trim();
  return (normalized || 'evidencia').slice(0, 180);
}

function validMagicBytes(mediaType: AcceptedEvidenceMediaType, header: Buffer): boolean {
  if (mediaType === 'image/jpeg') {
    return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (mediaType === 'image/png') {
    return (
      header.length >= 8 &&
      header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  return (
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;

  constructor(
    root: string,
    readonly maxEvidenceBytes: number,
  ) {
    this.root = resolve(root);
  }

  private pathFor(reference: StoredObjectReference): string {
    if (reference.provider !== LOCAL_PROVIDER || reference.bucket !== EVIDENCE_BUCKET) {
      throw new Error('O objeto não pertence ao armazenamento privado local.');
    }
    if (isAbsolute(reference.objectKey)) throw new Error('Chave de armazenamento inválida.');

    const bucketRoot = resolve(this.root, EVIDENCE_BUCKET);
    const target = resolve(bucketRoot, reference.objectKey);
    if (target !== bucketRoot && !target.startsWith(`${bucketRoot}${sep}`)) {
      throw new Error('Chave de armazenamento fora do diretório privado.');
    }
    return target;
  }

  async storeEvidence(input: {
    readonly tenantId: string;
    readonly originalName: string;
    readonly mediaType: string;
    readonly stream: Readable;
  }): Promise<StoredObject> {
    const mediaType = acceptedMediaType(input.mediaType);
    const now = new Date();
    const id = randomUUID();
    const extension = mediaTypes[mediaType].extension;
    const objectKey = [
      input.tenantId,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${id}.${extension}`,
    ].join('/');
    const reference = { provider: LOCAL_PROVIDER, bucket: EVIDENCE_BUCKET, objectKey } as const;
    const target = this.pathFor(reference);
    const temporary = `${target}.${randomUUID()}.uploading`;
    const hash = createHash('sha256');
    let byteSize = 0;
    let header = Buffer.alloc(0);

    const inspector = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        byteSize += chunk.length;
        if (byteSize > this.maxEvidenceBytes) {
          callback(
            new ObjectStorageError(
              'FILE_TOO_LARGE',
              `A evidência excede o limite de ${this.maxEvidenceBytes} bytes.`,
            ),
          );
          return;
        }
        hash.update(chunk);
        if (header.length < HEADER_BYTES) {
          header = Buffer.concat([header, chunk.subarray(0, HEADER_BYTES - header.length)]);
        }
        callback(null, chunk);
      },
    });

    await mkdir(dirname(target), { recursive: true });
    try {
      await pipeline(
        input.stream,
        inspector,
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      );
      if (byteSize === 0 || !validMagicBytes(mediaType, header)) {
        throw new ObjectStorageError(
          'FILE_CONTENT_INVALID',
          'O conteúdo do arquivo não corresponde ao formato de imagem informado.',
        );
      }
      await rename(temporary, target);
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw cause;
    }

    return {
      id,
      ...reference,
      originalName: sanitizedOriginalName(input.originalName),
      mediaType,
      byteSize,
      checksumSha256: hash.digest('hex'),
      evidenceType: mediaTypes[mediaType].evidenceType,
    };
  }

  open(reference: StoredObjectReference): ReadStream {
    return createReadStream(this.pathFor(reference));
  }

  async remove(reference: StoredObjectReference): Promise<void> {
    await rm(this.pathFor(reference), { force: true });
  }
}
