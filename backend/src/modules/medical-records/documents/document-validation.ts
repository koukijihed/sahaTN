// Validation du contenu d'un document medical. Le type MIME n'est jamais
// deduit de la seule extension ni du seul `Content-Type` envoye par le client :
// les octets d'en-tete (magic bytes) sont inspectes. Une incoherence entre
// extension, type declare et contenu est refusee.

export const MAX_ORIGINAL_NAME_LENGTH = 255;

// Types autorises, verifies par inspection du contenu. Volontairement restreint
// aux formats courants non executables des documents cliniques.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

const ALLOWED_EXTENSIONS: Record<AllowedDocumentMimeType, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp']
};

export type DocumentRejectionReason =
  | 'empty_file'
  | 'file_too_large'
  | 'unsupported_type'
  | 'type_mismatch';

export interface ValidatedDocumentContent {
  originalName: string;
  declaredMimeType: string;
  detectedMimeType: AllowedDocumentMimeType;
  sizeBytes: number;
}

// Assainit le nom original : on ne conserve que le nom de base (aucun
// separateur de chemin), sans caracteres de controle, borne en longueur. Le nom
// n'est JAMAIS utilise pour construire la cle de stockage.
export function sanitizeOriginalName(rawName: string | undefined): string {
  const base = (rawName ?? '')
    .split(/[/\\]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!base) {
    return 'document';
  }
  return base.slice(0, MAX_ORIGINAL_NAME_LENGTH);
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }
  return bytes.every((byte, index) => buffer[index] === byte);
}

// Detecte le type reel a partir des octets d'en-tete. Retourne null si le
// format n'est pas reconnu (donc non autorise).
export function detectMimeType(content: Buffer): AllowedDocumentMimeType | null {
  if (startsWithBytes(content, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf'; // "%PDF-"
  }
  if (
    startsWithBytes(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'image/png';
  }
  if (startsWithBytes(content, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString('latin1') === 'RIFF' &&
    content.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) {
    return '';
  }
  return name.slice(dot).toLowerCase();
}

export interface DocumentValidationInput {
  originalName: string | undefined;
  declaredMimeType: string | undefined;
  content: Buffer;
  maxBytes: number;
}

// Valide un depot. Leve une erreur portant un motif borne si le document est
// vide, trop volumineux, de type non supporte ou incoherent.
export function validateDocumentContent(
  input: DocumentValidationInput
): ValidatedDocumentContent {
  const originalName = sanitizeOriginalName(input.originalName);
  const sizeBytes = input.content.length;

  if (sizeBytes === 0) {
    throw new DocumentValidationError('empty_file', 'The file is empty');
  }
  if (sizeBytes > input.maxBytes) {
    throw new DocumentValidationError(
      'file_too_large',
      'The file exceeds the maximum allowed size'
    );
  }

  const detected = detectMimeType(input.content);
  if (!detected) {
    throw new DocumentValidationError(
      'unsupported_type',
      'The file type is not supported'
    );
  }

  const declaredRaw = (input.declaredMimeType ?? '').split(';')[0].trim().toLowerCase();
  const declared =
    declaredRaw && declaredRaw !== 'application/octet-stream' ? declaredRaw : detected;

  // Le type declare par le client ne doit pas contredire le contenu reel.
  if (declared !== detected) {
    throw new DocumentValidationError(
      'type_mismatch',
      'The declared content type does not match the file content'
    );
  }

  // L'extension, si presente, doit correspondre au contenu reel.
  const extension = extensionOf(originalName);
  if (extension && !ALLOWED_EXTENSIONS[detected].includes(extension)) {
    throw new DocumentValidationError(
      'type_mismatch',
      'The file extension does not match the file content'
    );
  }

  return {
    originalName,
    declaredMimeType: declared,
    detectedMimeType: detected,
    sizeBytes
  };
}

export class DocumentValidationError extends Error {
  constructor(
    public readonly reason: DocumentRejectionReason,
    message: string
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}
