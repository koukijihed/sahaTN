import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DocumentValidationError,
  detectMimeType,
  extensionOf,
  sanitizeOriginalName,
  validateDocumentContent
} from './document-validation';

function pdfBuffer(size = 64): Buffer {
  const buffer = Buffer.alloc(Math.max(size, 8));
  Buffer.from('%PDF-1.7\n%').copy(buffer, 0);
  return buffer;
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

function webpBuffer(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.write('RIFF', 0, 'latin1');
  buffer.write('WEBP', 8, 'latin1');
  return buffer;
}

describe('document-validation', () => {
  describe('sanitizeOriginalName', () => {
    it('keeps the base name only (no path separators)', () => {
      expect(sanitizeOriginalName('reports/a/b/result.pdf')).toBe('result.pdf');
      expect(sanitizeOriginalName('C:\\files\\scan.png')).toBe('scan.png');
      expect(sanitizeOriginalName('mixed\\to/x.pdf')).toBe('x.pdf');
    });

    it('removes control characters and trims', () => {
      expect(sanitizeOriginalName('  result.pdf \n')).toBe('result.pdf');
      expect(sanitizeOriginalName('re\u0000sult.pdf')).toBe('result.pdf');
    });

    it('falls back to a safe default when the name is empty', () => {
      expect(sanitizeOriginalName('')).toBe('document');
      expect(sanitizeOriginalName(undefined)).toBe('document');
      expect(sanitizeOriginalName('\\')).toBe('document');
    });

    it('truncates over-long names', () => {
      const long = `${'a'.repeat(300)}.pdf`;
      expect(sanitizeOriginalName(long)).toHaveLength(255);
    });
  });

  describe('detectMimeType', () => {
    it('recognises the allowed formats from their magic bytes', () => {
      expect(detectMimeType(pdfBuffer())).toBe('application/pdf');
      expect(detectMimeType(pngBuffer())).toBe('image/png');
      expect(detectMimeType(jpegBuffer())).toBe('image/jpeg');
      expect(detectMimeType(webpBuffer())).toBe('image/webp');
    });

    it('returns null for unknown content', () => {
      expect(detectMimeType(Buffer.from('plain text, not a document'))).toBeNull();
      expect(detectMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    });
  });

  describe('extensionOf', () => {
    it('returns the lowercased extension or an empty string', () => {
      expect(extensionOf('scan.PDF')).toBe('.pdf');
      expect(extensionOf('scan.pdf')).toBe('.pdf');
      expect(extensionOf('noext')).toBe('');
      expect(extensionOf('trailing.')).toBe('');
    });
  });

  describe('validateDocumentContent', () => {
    it('accepts a valid pdf with consistent metadata', () => {
      const result = validateDocumentContent({
        originalName: 'result.pdf',
        declaredMimeType: 'application/pdf',
        content: pdfBuffer(),
        maxBytes: 1024 * 1024
      });
      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.declaredMimeType).toBe('application/pdf');
      expect(result.originalName).toBe('result.pdf');
      expect(result.sizeBytes).toBe(pdfBuffer().length);
    });

    it('accepts every allowed MIME type', () => {
      const samples: Record<string, Buffer> = {
        'application/pdf': pdfBuffer(),
        'image/png': pngBuffer(),
        'image/jpeg': jpegBuffer(),
        'image/webp': webpBuffer()
      };
      for (const mime of ALLOWED_DOCUMENT_MIME_TYPES) {
        const detected = detectMimeType(samples[mime]);
        expect(detected).toBe(mime);
        expect(
          validateDocumentContent({
            originalName: `doc.${mime.split('/')[1]}`,
            declaredMimeType: mime,
            content: samples[mime],
            maxBytes: 1024 * 1024
          }).detectedMimeType
        ).toBe(mime);
      }
    });

    it('rejects an empty payload', () => {
      expect(() =>
        validateDocumentContent({
          originalName: 'empty.pdf',
          declaredMimeType: 'application/pdf',
          content: Buffer.alloc(0),
          maxBytes: 1024 * 1024
        })
      ).toThrowError(new DocumentValidationError('empty_file', 'The file is empty'));
    });

    it('rejects a payload above the configured maximum', () => {
      expect(() =>
        validateDocumentContent({
          originalName: 'big.pdf',
          declaredMimeType: 'application/pdf',
          content: pdfBuffer(),
          maxBytes: 16
        })
      ).toThrowError(
        new DocumentValidationError(
          'file_too_large',
          'The file exceeds the maximum allowed size'
        )
      );
    });

    it('rejects unsupported content (e.g. an executable)', () => {
      const executable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, ...Buffer.alloc(8)]);
      expect(() =>
        validateDocumentContent({
          originalName: 'tool.pdf',
          declaredMimeType: 'application/pdf',
          content: executable,
          maxBytes: 1024 * 1024
        })
      ).toThrowError(
        new DocumentValidationError('unsupported_type', 'The file type is not supported')
      );
    });

    it('rejects a declared type that contradicts the content', () => {
      expect(() =>
        validateDocumentContent({
          originalName: 'real.pdf',
          declaredMimeType: 'image/png',
          content: pdfBuffer(),
          maxBytes: 1024 * 1024
        })
      ).toThrowError(
        new DocumentValidationError(
          'type_mismatch',
          'The declared content type does not match the file content'
        )
      );
    });

    it('tolerates an unknown declared type by trusting the content', () => {
      const result = validateDocumentContent({
        originalName: 'real.pdf',
        declaredMimeType: 'application/octet-stream',
        content: pdfBuffer(),
        maxBytes: 1024 * 1024
      });
      expect(result.detectedMimeType).toBe('application/pdf');
    });

    it('rejects an extension that contradicts the content', () => {
      expect(() =>
        validateDocumentContent({
          originalName: 'real.txt',
          declaredMimeType: 'application/pdf',
          content: pdfBuffer(),
          maxBytes: 1024 * 1024
        })
      ).toThrowError(
        new DocumentValidationError(
          'type_mismatch',
          'The file extension does not match the file content'
        )
      );
    });
  });
});