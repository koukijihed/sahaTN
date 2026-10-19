'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, readCookie } from '../../../../lib/api';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge
} from '../../../../components/ui';

const CATEGORIES = [
  'LAB_RESULT',
  'IMAGING',
  'REPORT',
  'PRESCRIPTION',
  'OTHER'
];

interface MedicalDocument {
  id: string;
  category: string;
  originalName: string;
  detectedMimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: string;
  encounterId: string | null;
  createdAt: string;
  archivedAt: string | null;
  archiveReason: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function MyDocumentsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [category, setCategory] = useState('LAB_RESULT');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MedicalDocument | null>(
    null
  );
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/medical-records/me/documents');
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger vos documents.');
        return;
      }
      setDocuments((await response.json()) as MedicalDocument[]);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadDocument(file: File) {
    setUploading(true);
    setMessage(null);
    setError(null);
    const form = new FormData();
    form.append('category', category);
    form.append('file', file);
    const csrf = readCookie('sahatn_csrf');
    try {
      // FormData : on n'utilise pas apiFetch (qui fixerait un Content-Type JSON).
      const response = await fetch('/api/medical-records/me/documents', {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        body: form
      });
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        setMessage(
          response.status === 413
            ? 'Fichier trop volumineux (5 Mo maximum).'
            : 'Dépôt refusé : format non supporté (PDF, PNG, JPEG, WEBP).'
        );
        return;
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await load();
    } catch {
      setMessage('Impossible de contacter le serveur.');
    } finally {
      setUploading(false);
    }
  }

  async function archiveDocument() {
    if (!archiveTarget) {
      return;
    }
    setArchiving(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/medical-records/me/documents/${archiveTarget.id}/archive`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (!response.ok) {
        setMessage('Impossible d’archiver ce document.');
        return;
      }
      setArchiveTarget(null);
      await load();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace patient"
        title="Mes documents médicaux"
        description="Formats acceptés : PDF, PNG, JPEG, WEBP · 5 Mo maximum · contenu vérifié avant enregistrement."
      />

      {error ? (
        <ErrorState
          title="Documents indisponibles"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="danger">{message}</Alert> : null}

      <Card>
        <h2 className="card__title">Déposer un document</h2>
        <div className="form-grid">
          <Field label="Catégorie" htmlFor="documentCategory">
            <select
              id="documentCategory"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fichier" htmlFor="documentFile">
            <input
              id="documentFile"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadDocument(file);
                }
              }}
            />
          </Field>
        </div>
        {uploading ? (
          <p className="muted" role="status">
            Dépôt en cours…
          </p>
        ) : null}
      </Card>

      <section className="section">
        <h2>Documents</h2>
        {loading ? (
          <LoadingState label="Chargement des documents…" />
        ) : documents.length === 0 ? (
          <EmptyState icon="📄" title="Aucun document">
            Aucun document enregistré.
          </EmptyState>
        ) : (
          <div className="grid grid--cards">
            {documents.map((document) => (
              <Card key={document.id}>
                <div className="card__header">
                  <h3 className="card__title truncate" title={document.originalName}>
                    {document.originalName}
                  </h3>
                  <StatusBadge status={document.status} />
                </div>
                <p className="card__meta">
                  <Badge variant="info">{document.category}</Badge>{' '}
                  {formatSize(document.sizeBytes)} · {document.detectedMimeType} ·{' '}
                  {new Date(document.createdAt).toLocaleString('fr-FR')}
                </p>
                <p className="muted">
                  Empreinte SHA-256 :{' '}
                  <code>{document.checksumSha256.slice(0, 16)}…</code>
                </p>
                {document.status === 'ARCHIVED' ? (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Archivé
                    {document.archiveReason
                      ? ` — ${document.archiveReason}`
                      : ''}
                  </p>
                ) : (
                  <div className="btn-row">
                    <a
                      className="btn btn--secondary btn--sm"
                      href={`/api/medical-records/me/documents/${document.id}/content`}
                      download
                    >
                      Télécharger
                    </a>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setArchiveTarget(document)}
                    >
                      Archiver
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archiver ce document ?"
        description={
          archiveTarget
            ? `« ${archiveTarget.originalName} » ne sera plus proposé au téléchargement.`
            : undefined
        }
        confirmLabel="Archiver"
        danger
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archiveDocument()}
      />
    </main>
  );
}
