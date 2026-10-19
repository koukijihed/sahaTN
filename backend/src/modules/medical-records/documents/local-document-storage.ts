import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { MedicalDocumentStorage } from './medical-document-storage';

// Stockage local prive des documents medicaux, destine au developpement et aux
// tests. La racine est configurable (DOCUMENT_STORAGE_DIR) et ne doit JAMAIS
// se trouver dans un repertoire servi par un serveur web. Les fichiers sont
// ecrits avec des permissions restreintes (0o600). Les cles sont relatives a la
// racine et generees par le serveur ; toute cle tentant de sortir de la racine
// est rejetee (protection contre la traversee de repertoire).
//
// Limite assumee : ce stockage n'integre ni antivirus ni chiffrement applicatif
// au repos. Ces sujets restent ouverts (voir docs/security.md).
@Injectable()
export class LocalPrivateDocumentStorage implements MedicalDocumentStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('documentStorageDir');
    this.root = resolve(
      configured && configured.trim().length > 0
        ? configured
        : join(process.cwd(), 'storage', 'private-documents')
    );
  }

  get rootDirectory(): string {
    return this.root;
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('\0') || isAbsolute(key)) {
      throw new Error('Invalid document storage key');
    }
    const candidate = resolve(this.root, key);
    const rel = relative(this.root, candidate);
    if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Invalid document storage key');
    }
    return candidate;
  }

  async save(key: string, content: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    // flag "wx" : on refuse d'ecraser un contenu existant (cle censee unique).
    await writeFile(target, content, { mode: 0o600, flag: 'wx' });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
