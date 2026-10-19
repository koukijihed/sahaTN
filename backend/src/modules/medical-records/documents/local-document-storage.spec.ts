import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalPrivateDocumentStorage } from './local-document-storage';

describe('LocalPrivateDocumentStorage', () => {
  let storage: LocalPrivateDocumentStorage;
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'docstore-'));
    const config = {
      get: (key: string) => (key === 'documentStorageDir' ? tempRoot : undefined)
    } as unknown as ConfigService;
    storage = new LocalPrivateDocumentStorage(config);
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('round-trips a document under a server-generated key', async () => {
    const key = 'documents/2026/10/uuid-1234';
    const content = Buffer.from('%PDF-1.7\nhello');
    await storage.save(key, content);
    const stored = await readFile(join(tempRoot, key));
    expect(stored.equals(content)).toBe(true);
    expect(await storage.read(key)).toEqual(content);
  });

  it('writes the expected bytes (permissions restricted are enforced by the storage)', async () => {
    const key = 'documents/2026/10/uuid-5678';
    await storage.save(key, Buffer.from('x'));
    const content = await readFile(join(tempRoot, key));
    expect(content.toString()).toBe('x');
  });

  it('rejects an absolute storage key', async () => {
    await expect(storage.save(join(tempRoot, 'escape'), Buffer.from('x'))).rejects.toThrow(
      'Invalid document storage key'
    );
  });

  it('rejects a traversal key escaping the root', async () => {
    for (const key of ['../escape.txt', 'a/../../escape.txt', '..\\escape.txt']) {
      await expect(storage.save(key, Buffer.from('x'))).rejects.toThrow(
        'Invalid document storage key'
      );
      await expect(storage.read(key)).rejects.toThrow('Invalid document storage key');
    }
  });

  it('rejects a key containing a null byte or empty key', async () => {
    await expect(storage.save('a\0b', Buffer.from('x'))).rejects.toThrow(
      'Invalid document storage key'
    );
    await expect(storage.save('', Buffer.from('x'))).rejects.toThrow(
      'Invalid document storage key'
    );
  });

  it('refuses to overwrite an existing key', async () => {
    const key = 'documents/2026/10/uuid-9999';
    await storage.save(key, Buffer.from('first'));
    await expect(storage.save(key, Buffer.from('second'))).rejects.toThrow();
    expect(await storage.read(key)).toEqual(Buffer.from('first'));
  });

  it('fails gracefully when reading or removing a missing key', async () => {
    await expect(storage.read('documents/2026/10/nope')).rejects.toThrow();
    await expect(storage.remove('documents/2026/10/missing')).resolves.toBeUndefined();
  });

  it('removes an existing key', async () => {
    const key = 'documents/2026/10/uuid-7777';
    await storage.save(key, Buffer.from('x'));
    await storage.remove(key);
    await expect(storage.read(key)).rejects.toThrow();
  });

  it('allows a key nested under a subfolder with a dot-prefixed folder', async () => {
    const key = 'documents/2026/10/.hidden/../uuid-1';
    await expect(storage.save(key, Buffer.from('x'))).resolves.toBeUndefined();
    expect(await storage.read(key)).toEqual(Buffer.from('x'));
  });

  it('backs onto the configured directory only', async () => {
    const written = join(tempRoot, 'documents', '2026', '10', 'uuid-4242');
    await storage.save('documents/2026/10/uuid-4242', Buffer.from('data'));
    expect((await readFile(written)).toString()).toBe('data');
  });
});